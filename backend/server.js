const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const csv = require('csv-parser');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(bodyParser.json());

// --- 0. CHARGEMENT DE LA COTE ARGUS ---
let ARGUS_DB = [];
const CSV_FILE = 'MA_COTE_ARGUS_OFFICIELLE.csv';

if (fs.existsSync(CSV_FILE)) {
    fs.createReadStream(CSV_FILE)
        .pipe(csv({ separator: ';' }))
        .on('data', (row) => {
            // On stocke les données en mémoire pour un accès ultra-rapide
            ARGUS_DB.push({
                marque: row['Marque'] ? row['Marque'].toUpperCase() : "",
                modele: row['Modele'] ? row['Modele'].toUpperCase() : "",
                annee: parseInt(row['Annee']),
                km_tranche: row['Km_Tranche'],
                cote: parseInt(row['Cote_Mediane']),
                fiabilite: row['Fiabilité']
            });
        })
        .on('end', () => {
            console.log(`✅ BASE ARGUS CHARGÉE : ${ARGUS_DB.length} références.`);
        });
} else {
    console.warn("⚠️ ATTENTION : Fichier 'MA_COTE_ARGUS_OFFICIELLE.csv' introuvable. L'analyse prix sera désactivée.");
}

// --- 1. BASES DE CONNAISSANCES (Risques Mécaniques) ---
const CAR_KNOWLEDGE_DB = [
    { 
        id: "puretech", 
        keywords: ["puretech", "1.2", "vti", "82", "110", "130"], 
        badYears: [2013, 2014, 2015, 2016, 2017, 2018], 
        msg: "🚨 MOTEUR PURETECH (1.0/1.2) : Risque critique de dégradation de la courroie de distribution. Vérifiez impérativement l'entretien." 
    },
    { 
        id: "bluehdi15", 
        keywords: ["1.5", "bluehdi", "hdi"], 
        badYears: [2017, 2018, 2019, 2020, 2021, 2022], 
        msg: "⚠️ MOTEUR 1.5 BLUEHDI : Fragilité connue de la chaîne d'arbres à cames (risque de casse moteur). Exigez la preuve du passage à la chaîne 8mm." 
    },
    {
        id: "renault12tce",
        keywords: ["1.2", "tce", "dig-t"],
        badYears: [2012, 2013, 2014, 2015, 2016],
        msg: "🚨 MOTEUR 1.2 TCE/DIG-T : Risque majeur de surconsommation d'huile et casse moteur (défaut de segmentation)."
    }
];

const MARQUES_DETECTABLES = ["RENAULT", "PEUGEOT", "CITROEN", "VOLKSWAGEN", "BMW", "AUDI", "MERCEDES", "TOYOTA", "FIAT", "FORD", "DACIA", "TESLA", "VOLVO", "PORSCHE", "SEAT", "NISSAN", "OPEL", "SUZUKI", "HYUNDAI", "KIA", "SKODA", "MINI", "LAND ROVER", "JEEP", "ALFA ROMEO"];

// --- 2. FONCTIONS UTILITAIRES ---

function extractCarDetails(text, userExtractedPrice, userExtractedYear) {
    const upperText = text.toUpperCase();
    let detected = { marque: null, modele: null, annee: userExtractedYear, km: null, prix: userExtractedPrice };

    // Extraction Année (si non fournie par le front)
    if (!detected.annee) {
        const yearMatch = text.match(/\b(19|20)\d{2}\b/g);
        if (yearMatch) detected.annee = Math.max(...yearMatch.map(y => parseInt(y)));
    }

    // Extraction Prix (si non fourni par le front)
    if (!detected.prix) {
        const priceMatch = text.match(/(\d{1,3}(?:[\s.]\d{3})*)\s*(?:€|eur)/i);
        if (priceMatch) detected.prix = parseInt(priceMatch[1].replace(/[\s.]/g, ''));
    }

    // Extraction KM
    const kmMatch = text.match(/(\d{1,3}(?:[\s.]\d{3})*)\s*(?:km|kms)/i);
    if (kmMatch) detected.km = parseInt(kmMatch[1].replace(/[\s.]/g, ''));

    // Extraction Marque
    for (let m of MARQUES_DETECTABLES) {
        if (upperText.includes(m)) {
            detected.marque = m;
            break;
        }
    }

    // Extraction Modèle
    if (detected.marque) {
        const modelesPossibles = [...new Set(ARGUS_DB.filter(x => x.marque === detected.marque).map(x => x.modele))];
        // On trie par longueur décroissante pour matcher "CLIO IV" avant "CLIO"
        modelesPossibles.sort((a, b) => b.length - a.length);
        
        for (let mod of modelesPossibles) {
            if (upperText.includes(mod)) {
                detected.modele = mod;
                break; 
            }
        }
    }

    return detected;
}

function findArgusPrice(details) {
    if (!details.marque || !details.modele || !details.annee || !details.km) return null;

    const pas_km = 15000;
    const km_debut = Math.floor(details.km / pas_km) * pas_km;
    const km_fin = km_debut + pas_km;
    const tranche_cible = `${km_debut} - ${km_fin}`;

    // 1. Match Exact
    const match = ARGUS_DB.find(row => 
        row.marque === details.marque &&
        row.modele === details.modele &&
        row.annee === details.annee &&
        row.km_tranche === tranche_cible
    );

    if (match) return { cote: match.cote, fiabilite: "Précise (KM exact)" };

    // 2. Fallback : Moyenne Année/Modèle (sans KM exact)
    const matchesLoose = ARGUS_DB.filter(row => 
        row.marque === details.marque &&
        row.modele === details.modele &&
        row.annee === details.annee
    );

    if (matchesLoose.length > 0) {
        const avgCote = matchesLoose.reduce((acc, val) => acc + val.cote, 0) / matchesLoose.length;
        return { cote: Math.round(avgCote), fiabilite: "Estimée (Moyenne Année)" };
    }

    return null;
}

// --- ROUTE API ---
app.post('/api/scan/auto', (req, res) => {
    const { description, siren, autoviza, extractedPrice, extractedYear, accountYear } = req.body;
    const text = description + " " + (autoviza || "");
    const cleanDescription = description.replace(/\s+/g, ' ').trim();
    
    let score = 0;
    let report = [];
    let positives = [];
    let history = [];
    let isPro = false;
    let mapsLink = null;
    
    // Analyse Argus (Nouveau !)
    let argusAnalysis = { type: "neutral", message: "" };
    const carDetails = extractCarDetails(description, extractedPrice, extractedYear);
    
    if (carDetails.prix && carDetails.marque) {
        const argusData = findArgusPrice(carDetails);
        if (argusData) {
            const cote = argusData.cote;
            const diff = carDetails.prix - cote;
            const percentDiff = (diff / cote) * 100;
            
            argusAnalysis.cote_officielle = cote;
            argusAnalysis.voiture = `${carDetails.marque} ${carDetails.modele || ''} (${carDetails.annee})`;

            if (percentDiff < -35) {
                score += 60;
                argusAnalysis.type = "scam";
                argusAnalysis.message = `🚨 PRIX ANORMALEMENT BAS : ${carDetails.prix}€ (Cote: ${cote}€). C'est -${Math.round(Math.abs(percentDiff))}% sous le marché. Arnaque très probable.`;
            } else if (percentDiff > 35) {
                argusAnalysis.type = "bad_deal";
                argusAnalysis.message = `📉 MAUVAISE AFFAIRE : Ce véhicule est vendu ${Math.round(percentDiff)}% trop cher par rapport au marché (${cote}€).`;
            } else if (percentDiff >= -15 && percentDiff <= 15) {
                score -= 15;
                argusAnalysis.type = "good_deal";
                argusAnalysis.message = `✅ PRIX JUSTE : Le prix est parfaitement cohérent avec la cote (${cote}€).`;
                positives.push({ label: "Prix Cohérent", desc: "Conforme au marché." });
            } else {
                argusAnalysis.message = `ℹ️ Prix analysé : ${carDetails.prix}€ vs Cote : ${cote}€.`;
                argusAnalysis.type = "info";
            }
        }
    }

    // Analyse Moteur (Base de connaissances)
    const lowerText = text.toLowerCase();
    CAR_KNOWLEDGE_DB.forEach(risk => {
        const hasKeywords = risk.keywords.every(k => lowerText.includes(k));
        if (hasKeywords && risk.badYears.includes(carDetails.annee)) {
            score += 40;
            report.push({ type: 'fatal', label: "DÉFAUT MOTEUR CONNU", desc: risk.msg });
        }
    });

    // Analyse SIREN (Simulée pour l'exemple, à connecter à une API INSEE si besoin)
    if (siren) {
        isPro = true;
        if (siren === "123456789") { // Exemple test
            score += 100;
            report.push({ type: 'fatal', label: "SIREN INVALIDE", desc: "Faux numéro détecté." });
        } else {
            positives.push({ label: "Entreprise", desc: `SIREN ${siren} détecté.` });
            // Ici, vous pourriez appeler l'API Pappers/INSEE
        }
    }

    // Analyse Texte (Arnaques classiques)
    if (lowerText.includes("mandat cash") || lowerText.includes("western union") || lowerText.includes("coupons pcs") || lowerText.includes("transcash")) {
        score += 100;
        report.push({ type: 'fatal', label: "FRAUDE PAIEMENT", desc: "Demande de paiement illégal (Mandat/PCS)." });
    }
    if (lowerText.includes("livraison") && (lowerText.includes("étranger") || lowerText.includes("expatrié"))) {
        score += 80;
        report.push({ type: 'danger', label: "LIVRAISON DOUTEUSE", desc: "Arnaque classique 'je suis à l'étranger'." });
    }
    if (lowerText.includes("mail uniquement") || lowerText.includes("réponds pas aux appels")) {
        score += 30;
        report.push({ type: 'warning', label: "COMMUNICATION", desc: "Refus de téléphone suspect." });
    }

    // Calcul final du score
    score = Math.min(Math.max(score, 0), 100);
    let verdict = "FIABLE";
    if (score >= 80) verdict = "DANGER";
    else if (score > 40) verdict = "SUSPECT";

    res.json({ 
        score, 
        verdict, 
        details: report, 
        positives, 
        isPro,
        argus: argusAnalysis, // On renvoie le résultat Argus au frontend
        history,
        mapsLink 
    });
});

app.listen(PORT, () => console.log(`🚀 Serveur LeFauxCoin démarré sur le port ${PORT}`));