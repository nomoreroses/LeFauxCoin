// Fichier: argusEngine.js
const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');

// CONFIGURATION
// Pointe vers le fichier généré par le script Python V20/V21
const CSV_FILE = 'argus_referentiel_v21.csv'; 
const MIN_PRICE_FLOOR = 500; // 500€ min
const MIN_RESIDUAL_VALUE = 0.15; // 15% de la cote min

class ArgusEngine {
    constructor() {
        this.data = [];
        this.isLoaded = false;
    }

    /**
     * Charge le CSV en mémoire au démarrage du serveur.
     */
    loadData() {
        return new Promise((resolve, reject) => {
            const filePath = path.join(__dirname, CSV_FILE);
            
            if (!fs.existsSync(filePath)) {
                console.error(`[ArgusEngine] ❌ ERREUR CRITIQUE : Le fichier ${CSV_FILE} est introuvable.`);
                console.error(`[ArgusEngine] Veuillez lancer le script Python 'step4_argus_builder.py' d'abord.`);
                this.data = [];
                resolve(); // On resolve quand même pour ne pas crasher le serveur, mais l'argus sera vide.
                return;
            }

            console.log(`[ArgusEngine] Chargement de ${CSV_FILE}...`);
            const fileContent = fs.readFileSync(filePath, 'utf8');
            
            Papa.parse(fileContent, {
                header: true,
                delimiter: ";",
                skipEmptyLines: true,
                dynamicTyping: true, // Auto-convertit "2020" en 2020 (int)
                complete: (results) => {
                    // Nettoyage et mapping des colonnes
                    this.data = results.data.map(row => ({
                        Marque: row.Marque ? row.Marque.toString().toUpperCase().trim() : "",
                        Modele: row.Modèle ? row.Modèle.toString().toUpperCase().trim() : "", // Attention à l'accent CSV
                        Annee: parseInt(row.Année) || 0,
                        Puissance: parseInt(row.Puissance) || 0,
                        Energie: row.Énergie ? row.Énergie.toString().toUpperCase().trim() : "",
                        Boite: row.Boîte ? row.Boîte.toString().toUpperCase().trim() : "",
                        Finition: row.Finition ? row.Finition.toString().toUpperCase().trim() : "",
                        Cote_Reference: parseInt(row.Cote_Reference) || 0,
                        Km_Reference: parseInt(row.Km_Reference) || 0,
                        Decote_par_Km: parseFloat(row.Decote_par_Km) || -0.05,
                        Volume: parseInt(row.Volume_Annonces) || 0,
                        Qualite: row.Qualite_Cote || "C"
                    }));
                    
                    // Optimisation : On ne garde que les lignes valides
                    this.data = this.data.filter(r => r.Marque && r.Modele && r.Cote_Reference > 0);

                    this.isLoaded = true;
                    console.log(`[ArgusEngine] ✅ Base chargée : ${this.data.length} segments de cote.`);
                    resolve();
                },
                error: (err) => {
                    console.error("[ArgusEngine] Erreur parsing CSV:", err);
                    reject(err);
                }
            });
        });
    }

    /**
     * Filtre les données en cascade pour alimenter les menus déroulants.
     * @param {Object} filters - { Marque: "RENAULT", Modele: "CLIO V"... }
     */
    getOptions(filters) {
        if (!this.isLoaded) return [];

        let filtered = this.data;

        // Application stricte des filtres hiérarchiques
        if (filters.Marque) filtered = filtered.filter(r => r.Marque === filters.Marque);
        if (filters.Modele) filtered = filtered.filter(r => r.Modele === filters.Modele);
        if (filters.Annee) filtered = filtered.filter(r => r.Annee === parseInt(filters.Annee));
        if (filters.Energie) filtered = filtered.filter(r => r.Energie === filters.Energie);
        if (filters.Boite) filtered = filtered.filter(r => r.Boite === filters.Boite);
        if (filters.Puissance) filtered = filtered.filter(r => r.Puissance === parseInt(filters.Puissance));
        // La Finition est le dernier maillon, on ne filtre pas par finition pour obtenir la liste des finitions dispos
        
        return filtered;
    }

    /**
     * Extrait les valeurs uniques d'un champ pour l'affichage frontend.
     */
    getUniqueValues(dataset, field) {
        const values = new Set(dataset.map(r => r[field]));
        // Tri naturel (alphabétique ou numérique)
        return Array.from(values).sort((a, b) => {
            if (typeof a === 'number' && typeof b === 'number') return a - b;
            return String(a).localeCompare(String(b));
        });
    }

    /**
     * Calcule le prix final (Logique V19/V21 : Décote amortie + Plancher).
     */
    calculatePrice(criteria, reelKm) {
        // 1. Identification précise du segment
        const row = this.data.find(r => 
            r.Marque === criteria.Marque &&
            r.Modele === criteria.Modele &&
            r.Annee === parseInt(criteria.Annee) &&
            r.Energie === criteria.Energie &&
            r.Boite === criteria.Boite &&
            r.Puissance === parseInt(criteria.Puissance) &&
            r.Finition === criteria.Finition
        );

        if (!row) return null;

        const refPrice = row.Cote_Reference;
        const refKm = row.Km_Reference;
        const coef = row.Decote_par_Km; // Négatif, ex: -0.05
        const deltaKm = reelKm - refKm;

        let adjust = 0;

        // Logique mathématique avancée (Portage Python -> JS)
        if (deltaKm > 0) {
            // SCÉNARIO : Trop de kilomètres (Décote)
            // Palier 1 : 0 à 50k km de trop -> Plein tarif
            const step1 = Math.min(deltaKm, 50000);
            adjust += step1 * coef;

            // Palier 2 : 50k à 100k km de trop -> 50% tarif
            if (deltaKm > 50000) {
                const step2 = Math.min(deltaKm - 50000, 50000);
                adjust += step2 * (coef * 0.5);
            }

            // Palier 3 : > 100k km de trop -> 10% tarif (Amortissement fort)
            if (deltaKm > 100000) {
                const step3 = deltaKm - 100000;
                adjust += step3 * (coef * 0.1);
            }
        } else {
            // SCÉNARIO : Peu de kilomètres (Surcote)
            adjust = deltaKm * coef; // delta est négatif, coef négatif => résultat positif
            
            // Plafond Surcote : Max +40% du prix de réf
            const maxBonus = refPrice * 0.4;
            if (adjust > maxBonus) adjust = maxBonus;
        }

        let finalPrice = refPrice + adjust;

        // PRIX PLANCHER (Smart Floor)
        const floorPrice = Math.max(MIN_PRICE_FLOOR, refPrice * MIN_RESIDUAL_VALUE);
        let isFloored = false;

        if (finalPrice < floorPrice) {
            finalPrice = floorPrice;
            isFloored = true;
        }

        return {
            price: Math.round(finalPrice),
            marketPrice: refPrice,
            refKm: refKm,
            adjustment: Math.round(adjust),
            isFloored: isFloored,
            confidence: row.Qualite,
            volume: row.Volume,
            depreciationRate: coef
        };
    }
}

module.exports = new ArgusEngine();