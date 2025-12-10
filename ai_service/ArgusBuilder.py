import pandas as pd
import numpy as np
import os
import sys
import json
import logging
from dataclasses import dataclass
from typing import List, Any
from sklearn.linear_model import LinearRegression

# --- CONFIGURATION LOGGING ---
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%H:%M:%S'
)
logger = logging.getLogger("ArgusBuilderV21")

# --- CONFIGURATION ---
INPUT_FILE = "leboncoin_FINAL_PLATINUM_V16.csv"
OUTPUT_DB = "argus_referentiel_v21.csv"
OUTPUT_METADATA = "argus_metadata_v21.json"

# --- CONSTANTES ---
MIN_SAMPLES_FOR_VALIDITY = 3
IQR_THRESHOLD = 1.5
MIN_PRICE_FLOOR = 500
MIN_RESIDUAL_VALUE = 0.15 

@dataclass
class CoteResult:
    cote_affinee: int
    cote_brute: int
    confiance: str
    volume_source: int
    kilometrage_reference: int
    ajustement_km: int
    prix_plancher_atteint: bool

class ArgusEngine:
    def __init__(self, data_path: str):
        self.data_path = data_path
        self.df = None
        self.referentiel = None

    def charger_donnees(self):
        if not os.path.exists(self.data_path):
            logger.critical(f"Fichier {self.data_path} introuvable.")
            sys.exit(1)
            
        logger.info("Chargement Dataset V16...")
        dtype_dict = {'Titre': str, 'Marque': str, 'Modèle': str, 'Énergie': str, 'Boîte': str, 'Finition': str}
        self.df = pd.read_csv(self.data_path, sep=';', dtype=dtype_dict)
        
        for col in ['Année', 'Kilométrage', 'Puissance', 'Prix']:
            self.df[col] = pd.to_numeric(self.df[col], errors='coerce').fillna(0).astype(int)
        for col in ['Marque', 'Modèle', 'Énergie', 'Boîte', 'Finition']:
            self.df[col] = self.df[col].astype(str).str.upper().str.strip()

        logger.info(f"Chargé : {len(self.df)} lignes brutes.")

    def _impute_missing_powers(self):
        logger.info("⚡ Fusion intelligente des données (Imputation)...")
        df_clean = self.df.copy()
        group_cols = ['Marque', 'Modèle', 'Année', 'Énergie']
        
        df_clean['Puissance_Ref'] = df_clean['Puissance'].replace(0, np.nan)
        def get_mode(x):
            m = x.mode()
            return m.iloc[0] if not m.empty else 0
            
        modes = df_clean.groupby(group_cols)['Puissance_Ref'].agg(get_mode)
        df_merged = df_clean.join(modes, on=group_cols, rsuffix='_Mode')
        
        mask_impute = (df_merged['Puissance'] == 0) & (df_merged['Puissance_Ref_Mode'] > 0)
        df_merged.loc[mask_impute, 'Puissance'] = df_merged.loc[mask_impute, 'Puissance_Ref_Mode'].astype(int)
        
        self.df = df_merged.drop(columns=['Puissance_Ref', 'Puissance_Ref_Mode'])
        logger.info(f"✨ Fusion terminée (Cleaned).")

    def _remove_outliers(self, df):
        if len(df) < 5: return df
        Q1 = df['Prix'].quantile(0.25)
        Q3 = df['Prix'].quantile(0.75)
        IQR = Q3 - Q1
        return df[(df['Prix'] >= Q1 - 1.5*IQR) & (df['Prix'] <= Q3 + 1.5*IQR)]

    def _calculate_depreciation_stabilized(self, df, annee_ref, prix_median):
        """
        Calcul de décote STABILISÉ (V21) :
        Empêche les aberrations sur les vieux véhicules ou les faibles volumes.
        """
        current_year = 2025 # Ou datetime.now().year
        age = current_year - annee_ref
        
        # 1. Calcul Régression Mathématique
        raw_coef = -0.05 # Default fallback
        if len(df) >= 5:
            try:
                reg = LinearRegression().fit(df[['Kilométrage']], df['Prix'])
                raw_coef = reg.coef_[0]
            except: pass

        # 2. Définition des Plafonds (Caps) selon l'âge et le prix
        # Plus la voiture est vieille/pas chère, moins le KM impacte le prix (en valeur absolue)
        
        max_loss = -0.15 # Par défaut, max 15cts/km (Voiture neuve/chère)
        
        if age >= 15:
            max_loss = -0.02 # Vieux clou : max 2cts/km
        elif age >= 10:
            max_loss = -0.05 # Occasion mûre : max 5cts/km
        elif age >= 5:
            max_loss = -0.08 # Occasion récente
            
        # Sécurité Prix : On ne peut pas perdre plus de 0.005% du prix par km
        # Ex: Voiture à 5000€ -> Max loss = 5000 * 0.00005 = -0.25€ (Large)
        # Ex: Voiture à 2000€ -> Max loss = -0.10€
        # C'est un filtre supplémentaire
        
        # 3. Application des bornes (Clamping)
        # Si la régression dit -0.50 (aberrant), on force à max_loss
        # Si la régression dit +0.02 (aberrant positif), on force une petite décote par défaut
        
        if raw_coef > 0: 
            # Aberration positive -> On force une décote standard pour l'âge
            final_coef = max_loss / 2 
        else:
            # On garde le coef réel MAIS on le bride par le bas (max_loss est négatif, ex -0.05)
            # Si raw_coef est -0.20, et max_loss -0.05. max(-0.20, -0.05) = -0.05. Correct.
            final_coef = max(raw_coef, max_loss)
            
        # Plancher minimal (on décote toujours au moins un tout petit peu)
        if final_coef > -0.005: final_coef = -0.005
            
        return round(final_coef, 5)

    def construire_referentiel(self):
        if self.df is None: self.charger_donnees()
        self._impute_missing_powers()
        
        logger.info("Calcul des cotes (Stabilized V21)...")
        groups = self.df.groupby(['Marque', 'Modèle', 'Année', 'Puissance', 'Énergie', 'Boîte', 'Finition'])
        
        rows = []
        total = len(groups)
        processed = 0
        
        for name, group in groups:
            processed += 1
            if processed % 5000 == 0: print(f"   -> {processed}/{total}...", end='\r')
            
            clean = self._remove_outliers(group)
            count = len(clean)
            if count < MIN_SAMPLES_FOR_VALIDITY: continue
            
            prix_median = int(clean['Prix'].median())
            annee = int(name[2])
            
            # Appel de la nouvelle fonction stabilisée
            coef_decote = self._calculate_depreciation_stabilized(clean, annee, prix_median)
            
            rows.append({
                'Marque': name[0], 'Modèle': name[1], 'Année': annee,
                'Puissance': int(name[3]), 'Énergie': name[4], 'Boîte': name[5], 'Finition': name[6],
                'Cote_Reference': prix_median,
                'Km_Reference': int(clean['Kilométrage'].mean()),
                'Decote_par_Km': coef_decote,
                'Volume_Annonces': count,
                'Qualite_Cote': "A" if count > 30 else "B" if count > 10 else "C"
            })
            
        print("\n")
        self.referentiel = pd.DataFrame(rows)
        logger.info(f"Référentiel V21 : {len(self.referentiel)} cotes uniques.")

    def sauvegarder_referentiel(self):
        if self.referentiel is not None:
            self.referentiel.to_csv(OUTPUT_DB, sep=';', index=False, encoding='utf-8-sig')
            logger.info(f"Base sauvegardée : {OUTPUT_DB}")

class InteractiveArgus:
    def __init__(self, db_path):
        if not os.path.exists(db_path): sys.exit(1)
        self.df = pd.read_csv(db_path, sep=';')
        self.df[['Année', 'Puissance']] = self.df[['Année', 'Puissance']].astype(int)

    def _select(self, options, label):
        opts = sorted(list(set(options)))
        if not opts: 
            print(f"⚠️  Aucune option pour {label}")
            return None
        if len(opts) == 1 and label != "MODÈLE": return opts[0]

        print(f"\n--- {label} ---")
        for i, o in enumerate(opts): print(f"  [{i+1}] {o}")
        
        while True:
            try:
                inp = input("Choix : ")
                if not inp: return opts[0]
                c = int(inp) - 1
                if 0 <= c < len(opts): return opts[c]
            except: pass

    def calculer_prix_final(self, ref_prix, ref_km, reel_km, coef):
        delta = reel_km - ref_km
        adj = 0
        
        if delta > 0: # Trop de bornes
            adj += min(delta, 50000) * coef
            if delta > 50000: adj += min(delta-50000, 50000) * (coef * 0.5)
            if delta > 100000: adj += (delta-100000) * (coef * 0.1)
        else: # Pas assez de bornes
            adj = delta * coef 
            if adj > ref_prix * 0.4: adj = ref_prix * 0.4
            
        final = ref_prix + adj
        plancher = max(MIN_PRICE_FLOOR, ref_prix * MIN_RESIDUAL_VALUE)
        
        is_floored = False
        if final < plancher:
            final = plancher
            is_floored = True
            
        return int(final), int(adj), is_floored

    def run(self):
        print("\n🚗 ARGUS V21 (Stabilized) 🚗")
        
        while True:
            s = input("\nMarque (3 lettres) : ").upper()
            if not s: continue
            m = sorted(self.df[self.df['Marque'].str.contains(s, na=False)]['Marque'].unique())
            if m: 
                marque = self._select(m, "MARQUE")
                if marque: break
        
        mask = (self.df['Marque'] == marque)
        modele = self._select(self.df[mask]['Modèle'].unique(), "MODÈLE")
        mask &= (self.df['Modèle'] == modele)
        
        annee = self._select(self.df[mask]['Année'].unique(), "ANNÉE")
        mask &= (self.df['Année'] == annee)
        
        energie = self._select(self.df[mask]['Énergie'].unique(), "ÉNERGIE")
        mask &= (self.df['Énergie'] == energie)
        
        boite = self._select(self.df[mask]['Boîte'].unique(), "BOÎTE")
        mask &= (self.df['Boîte'] == boite)
        
        p_vals = self.df[mask]['Puissance'].unique()
        p_lbls = [f"{p} ch" if p > 0 else "Standard" for p in p_vals]
        p_map = dict(zip(p_lbls, p_vals))
        p_choice = self._select(list(p_map.keys()), "PUISSANCE")
        mask &= (self.df['Puissance'] == p_map[p_choice])
        
        finition = self._select(self.df[mask]['Finition'].unique(), "FINITION")
        mask &= (self.df['Finition'] == finition)
        
        if mask.sum() == 0: 
            print("❌ Segment vide.")
            return

        row = self.df[mask].iloc[0]
        
        print(f"\n✅ {marque} {modele} {finition} ({annee}) - {p_choice}")
        
        try: km_reel = int(input(f"KM (Moyenne: {row['Km_Reference']}) : "))
        except: km_reel = row['Km_Reference']
        
        final, adj, floored = self.calculer_prix_final(
            row['Cote_Reference'], row['Km_Reference'], km_reel, row['Decote_par_Km']
        )
        
        print(f"\n💰 COTE : {final} €")
        if floored: print("⚠️  Prix Plancher Atteint")
        print(f"📊 Marché : {row['Cote_Reference']} € (Vol: {row['Volume_Annonces']}, Fiabilité: {row['Qualite_Cote']})")
        print(f"📉 Décote : {row['Decote_par_Km']:.4f} €/km (Stabilisée)")

if __name__ == "__main__":
    if not os.path.exists(OUTPUT_DB):
        engine = ArgusEngine(INPUT_FILE)
        engine.construire_referentiel()
        engine.sauvegarder_referentiel()
    
    app = InteractiveArgus(OUTPUT_DB)
    while True:
        try:
            app.run()
            if input("\nAutre ? (O/N) : ").upper() != "O": break
        except KeyboardInterrupt: break