import pandas as pd
import numpy as np

# 1. CHARGEMENT DU FICHIER
# Assure-toi que le fichier est dans le même dossier
try:
    df = pd.read_csv('MA_COTE_ARGUS_OFFICIELLE.csv', sep=';', encoding='utf-8')
    print(f"Lignes initiales : {len(df)}")
except:
    # Fallback si encodage différent
    df = pd.read_csv('MA_COTE_ARGUS_OFFICIELLE.csv', sep=';', encoding='latin-1')
    print(f"Lignes initiales : {len(df)}")

# Nettoyage basique des chaînes
df['Marque'] = df['Marque'].astype(str).str.strip().str.upper()
df['Modele'] = df['Modele'].astype(str).str.strip().str.upper()

# ---------------------------------------------------------
# 2. CORRECTION DES MARQUES "AUTRE"
# ---------------------------------------------------------
print("🔧 Correction des marques 'AUTRE'...")

# Dictionnaire des modèles connus (appris du fichier lui-même)
known_models = {}
for idx, row in df[df['Marque'] != 'AUTRE'].iterrows():
    m = row['Modele']
    # On stocke le modèle exact
    known_models[m] = row['Marque']
    # On stocke aussi la racine (ex: 'CLIO' pour 'CLIO 2')
    root = m.split(' ')[0]
    if len(root) > 2 and root not in known_models:
        known_models[root] = row['Marque']

# Dictionnaire manuel pour les orphelins (ceux qui n'existent QUE dans AUTRE)
manual_fix = {
    'SCIROCCO': 'VOLKSWAGEN', 'CADDY': 'VOLKSWAGEN', 'UP': 'VOLKSWAGEN',
    'JUMPY': 'CITROEN', 'JUMPER': 'CITROEN', 'BERLINGO': 'CITROEN', 'SAXO': 'CITROEN',
    'EXPERT': 'PEUGEOT', 'BOXER': 'PEUGEOT', 'PARTNER': 'PEUGEOT', 'RIFTER': 'PEUGEOT',
    'DUCATO': 'FIAT', 'SCUDO': 'FIAT', 'DOBLO': 'FIAT', 'TALENTO': 'FIAT',
    'TRAFIC': 'RENAULT', 'MASTER': 'RENAULT', 'KANGOO': 'RENAULT', 'MASCOTT': 'RENAULT',
    'VITO': 'MERCEDES', 'SPRINTER': 'MERCEDES',
    'DAILY': 'IVECO',
    'VIVARO': 'OPEL', 'MOVANO': 'OPEL',
    'PROACE': 'TOYOTA',
    'NV200': 'NISSAN', 'NV300': 'NISSAN', 'PRIMASTAR': 'NISSAN'
}

def fix_brand(row):
    if row['Marque'] != 'AUTRE':
        return row['Marque']
    
    model = row['Modele']
    model_root = model.split(' ')[0]
    
    # 1. Vérification manuelle
    for k, v in manual_fix.items():
        if k in model: return v
        
    # 2. Vérification base connue (Exacte)
    if model in known_models: return known_models[model]
    
    # 3. Vérification base connue (Racine)
    if model_root in known_models: return known_models[model_root]
    
    return 'AUTRE' # Si vraiment introuvable

df['Marque'] = df.apply(fix_brand, axis=1)

# ---------------------------------------------------------
# 3. FUSION ET RECALCUL (AGRÉGATION)
# ---------------------------------------------------------
print("🧮 Recalcul des cotes pondérées...")

# On prépare le calcul de la moyenne pondérée : (Prix * Nb_Annonces)
df['Masse_Prix'] = df['Cote_Moyenne'] * df['Nb_Annonces']

# Colonnes identifiantes (ce qui définit une version unique)
group_cols = ['Marque', 'Modele', 'Annee', 'Km_Tranche', 'Energie', 'Boite']

# Règles d'agrégation
agg_rules = {
    'Masse_Prix': 'sum',        # On somme les masses monétaires
    'Nb_Annonces': 'sum',       # On somme le nombre d'annonces
    'Prix_Min': 'min',          # On prend le prix le plus bas global
    'Prix_Max': 'max',          # On prend le prix le plus haut global
    'Cote_Mediane': 'mean',     # Approx de la médiane (moyenne des médianes)
    'Fiabilité': 'first'        # On garde le premier commentaire de fiabilité trouvé
}

# GroupBy
df_clean = df.groupby(group_cols, as_index=False).agg(agg_rules)

# Calcul final de la nouvelle moyenne pondérée
df_clean['Cote_Moyenne'] = (df_clean['Masse_Prix'] / df_clean['Nb_Annonces']).round().astype(int)

# Nettoyage colonne temporaire
df_clean.drop(columns=['Masse_Prix'], inplace=True)

# Réorganiser les colonnes comme l'original
final_cols = ['Marque', 'Modele', 'Annee', 'Km_Tranche', 'Energie', 'Boite', 
              'Cote_Moyenne', 'Cote_Mediane', 'Prix_Min', 'Prix_Max', 
              'Nb_Annonces', 'Fiabilité']
              
df_clean = df_clean[final_cols]

# ---------------------------------------------------------
# 4. SAUVEGARDE
# ---------------------------------------------------------
output_file = 'MA_COTE_ARGUS_OFFICIELLE_CLEAN.csv'
df_clean.to_csv(output_file, sep=';', index=False, encoding='utf-8')

print(f"✅ Terminé ! Fichier généré : {output_file}")
print(f"Lignes finales (après fusion) : {len(df_clean)}")
print(f"Lignes fusionnées (nettoyées) : {len(df) - len(df_clean)}")