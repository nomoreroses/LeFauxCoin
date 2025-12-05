const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const csv = require('csv-parser');
const https = require('https'); // Important pour l'appel API SIREN

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(bodyParser.json());

// ==========================================
// 1. CHARGEMENT DE LA COTE ARGUS (CSV)
// ==========================================
let ARGUS_DB = [];
const CSV_FILE = 'MA_COTE_ARGUS_OFFICIELLE.csv';

if (fs.existsSync(CSV_FILE)) {
    fs.createReadStream(CSV_FILE)
        .pipe(csv({ separator: ';' }))
        .on('data', (row) => {
            ARGUS_DB.push({
                marque: row['Marque'] ? row['Marque'].toUpperCase() : "",
                modele: row['Modele'] ? row['Modele'].toUpperCase() : "",
                annee: parseInt(row['Annee']),
                km_tranche: row['Km_Tranche'],
                cote: parseInt(row['Cote_Mediane']),
                fiabilite: row['Fiabilité']
            });
        })
        .on('end', () => console.log(`✅ BASE ARGUS CHARGÉE : ${ARGUS_DB.length} véhicules.`));
} else {
    console.warn("⚠️ FICHIER ARGUS ABSENT. L'analyse prix sera limitée.");
}

// ==========================================
// 2. BASES DE DONNÉES (Moteurs & Marques)
// ==========================================
const CAR_KNOWLEDGE_DB = [
    { id: "puretech", keywords: ["puretech", "1.2", "vti", "82", "110", "130"], badYears: [2013, 2014, 2015, 2016, 2017, 2018], msg: "🚨 MOTEUR PURETECH : Risque critique (courroie désagrégée). Vérifiez l'historique." },
    { id: "bluehdi15", keywords: ["1.5", "bluehdi", "hdi"], badYears: [2017, 2018, 2019, 2020, 2021, 2022], msg: "⚠️ 1.5 BLUEHDI : Fragilité chaîne arbres à cames. Exigez la preuve du passage en 8mm." },
    { id: "tce12", keywords: ["1.2", "tce", "dig-t"], badYears: [2012, 2013, 2014, 2015, 2016], msg: "⚠️ 1.2 TCE : Risque casse moteur (surconsommation huile)." }
];

const MARQUES_DETECTABLES = ["RENAULT", "PEUGEOT", "CITROEN", "VOLKSWAGEN", "BMW", "AUDI", "MERCEDES", "TOYOTA", "FIAT", "FORD", "DACIA", "TESLA", "VOLVO", "PORSCHE", "SEAT", "NISSAN", "OPEL", "SUZUKI", "HYUNDAI", "KIA", "SKODA", "MINI", "LAND ROVER", "JEEP", "ALFA ROMEO"];

// ==========================================
// 3. FONCTIONS UTILITAIRES
// ==========================================

// Fonction pour appeler l'API Pappers (Gratuite et sans clé pour les appels modérés)
function checkCompany(siren) {
    return new Promise((resolve, reject) => {
        const url = `https://api.pappers.fr/v2/entreprise/?siren=${siren}`;
        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    if (res.statusCode === 200) resolve(JSON.parse(data));
                    else resolve(null);
                } catch (e) { resolve(null); }
            });
        }).on('error', (e) => resolve(null));
    });
}

function extractCarDetails(text, userPrice, userYear) {
    const upperText = text.toUpperCase();
    let detected = { marque: null, modele: null, annee: userYear, km: null, prix: userPrice };

    if (!detected.annee) {
        const yearMatch = text.match(/\b(19|20)\d{2}\b/g);
        if (yearMatch) detected.annee = Math.max(...yearMatch.map(y => parseInt(y)));
    }
    if (!detected.prix) {
        const priceMatch = text.match(/(\d{1,3}(?:[\s.]\d{3})*)\s*(?:€|eur)/i);
        if (priceMatch) detected.prix = parseInt(priceMatch[1].replace(/[\s.]/g, ''));
    }
    const kmMatch = text.match(/(\d{1,3}(?:[\s.]\d{3})*)\s*(?:km|kms)/i);
    if (kmMatch) detected.km = parseInt(kmMatch[1].replace(/[\s.]/g, ''));

    for (let m of MARQUES_DETECTABLES) {
        if (upperText.includes(m)) { detected.marque = m; break; }
    }

    if (detected.marque) {
        const modelesPossibles = [...new Set(ARGUS_DB.filter(x => x.marque === detected.marque).map(x => x.modele))];
        modelesPossibles.sort((a, b) => b.length - a.length);
        for (let mod of modelesPossibles) {
            if (upperText.includes(mod)) { detected.modele = mod; break; }
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

    const match = ARGUS_DB.find(row => row.marque === details.marque && row.modele === details.modele && row.annee === details.annee && row.km_tranche === tranche_cible);
    if (match) return { cote: match.cote, fiabilite: "Précise" };

    const matchesLoose = ARGUS_DB.filter(row => row.marque === details.marque && row.modele === details.modele && row.annee === details.annee);
    if (matchesLoose.length > 0) {
        const avgCote = matchesLoose.reduce((acc, val) => acc + val.cote, 0) / matchesLoose.length;
        return { cote: Math.round(avgCote), fiabilite: "Estimée" };
    }
    return null;
}

// ==========================================
// 4. ROUTE API PRINCIPALE
// ==========================================
app.post('/api/scan/auto', async (req, res) => {
    const { description, siren, autoviza, extractedPrice, extractedYear, accountYear } = req.body;
    const text = (description || "") + " " + (autoviza || "");
    const lowerText = text.toLowerCase();
    
    let score = 0;
    let report = [];
    let positives = [];
    let isPro = false;
    let companyInfo = null;
    let argusAnalysis = { type: "neutral", message: "" };

    // --- A. ANALYSE ENTREPRISE (SIREN) ---
    if (siren) {
        isPro = true;
        const companyData = await checkCompany(siren);
        
        if (companyData && companyData.resultats_nom_entreprise) {
            // Entreprise trouvée
            const ent = companyData.resultats_nom_entreprise[0] || companyData; // Structure variable selon API Pappers
            const nom = ent.nom_entreprise || "Société identifiée";
            const dateCreation = ent.date_creation;
            
            companyInfo = { name: nom, date: dateCreation };
            positives.push({ label: "Identité Vérifiée", desc: `${nom} (SIREN: ${siren})` });

            // Check Ancienneté Entreprise
            if (dateCreation) {
                const creationYear = new Date(dateCreation).getFullYear();
                const age = new Date().getFullYear() - creationYear;
                if (age < 1) {
                    score += 30;
                    report.push({ type: 'warning', label: "Société Récente", desc: "Créée il y a moins d'un an." });
                } else {
                    positives.push({ label: "Société Établie", desc: `En activité depuis ${age} ans.` });
                }
            }
        } else {
            // SIREN introuvable ou invalide
            score += 40;
            report.push({ type: 'warning', label: "SIREN SUSPECT", desc: `Numéro ${siren} introuvable ou fermé.` });
        }
    }

    // --- B. ANALYSE COMPTE LEBONCOIN ---
    if (accountYear) {
        const ageAccount = new Date().getFullYear() - accountYear;
        if (ageAccount === 0) {
            score += 25;
            report.push({ type: 'warning', label: "Compte LBC Récent", desc: "Créé cette année (Prudence)." });
        } else if (ageAccount > 3) {
            score -= 10;
            positives.push({ label: "Compte Ancien", desc: `Membre depuis ${ageAccount} ans.` });
        }
    }

    // --- C. ANALYSE PRIX & COTE ARGUS ---
    const carDetails = extractCarDetails(description || "", extractedPrice, extractedYear);
    
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
                argusAnalysis.message = `🚨 PRIX TRÈS BAS : ${carDetails.prix}€ (Cote: ${cote}€). Écart suspect de ${Math.round(percentDiff)}%.`;
            } else if (percentDiff > 35) {
                argusAnalysis.type = "bad_deal";
                argusAnalysis.message = `📉 OFFRE CHÈRE : ${Math.round(percentDiff)}% au-dessus du marché (${cote}€).`;
            } else if (percentDiff >= -15 && percentDiff <= 15) {
                score -= 15;
                argusAnalysis.type = "good_deal";
                argusAnalysis.message = `✅ PRIX JUSTE : Cohérent avec la cote (${cote}€).`;
                positives.push({ label: "Bonne Affaire", desc: "Prix conforme au marché." });
            } else {
                argusAnalysis.message = `ℹ️ Prix analysé : ${carDetails.prix}€ (Cote env. ${cote}€).`;
                argusAnalysis.type = "info";
            }
        }
    }

    // --- D. ANALYSE TEXTUELLE & RISQUES ---
    // Moteurs
    CAR_KNOWLEDGE_DB.forEach(risk => {
        const hasKeywords = risk.keywords.every(k => lowerText.includes(k));
        if (hasKeywords && risk.badYears.includes(carDetails.annee)) {
            score += 45;
            report.push({ type: 'fatal', label: "DÉFAUT MOTEUR", desc: risk.msg });
        }
    });

    // Arnaques Paiement
    if (lowerText.includes("mandat cash") || lowerText.includes("coupons pcs") || lowerText.includes("transcash") || lowerText.includes("western union")) {
        score += 100;
        report.push({ type: 'fatal', label: "FRAUDE PAIEMENT", desc: "Refusez tout paiement par coupon/mandat." });
    }
    
    // Arnaques Livraison
    if (lowerText.includes("livraison") && (lowerText.includes("étranger") || lowerText.includes("expatrié") || lowerText.includes("transporteur"))) {
        score += 80;
        report.push({ type: 'danger', label: "ARNAQUE LIVRAISON", desc: "Classique 'voiture à l'étranger'." });
    }

    // Calcul Final
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
        companyInfo, // Info Pappers
        argus: argusAnalysis 
    });
});

app.get('/', (req, res) => {
    res.send('✅ API LeFauxCoin V2 (Fusionnée) en ligne.');
});

app.listen(PORT, () => console.log(`🚀 Serveur démarré sur le port ${PORT}`));