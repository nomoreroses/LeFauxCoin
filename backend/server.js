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
    console.warn("⚠️ ATTENTION : Fichier 'MA_COTE_ARGUS_OFFICIELLE.csv' introuvable. Analyse prix désactivée.");
}

const CAR_KNOWLEDGE_DB = [
    { 
        id: "puretech", 
        keywords: ["puretech", "1.2", "vti", "82", "110", "130"], 
        badYears: [2013, 2014, 2015, 2016, 2017, 2018], 
        msg: "🚨 MOTEUR PURETECH (1.0/1.2) : Risque critique de dégradation de la courroie de distribution (bouchage crépine huile). Vérifiez impérativement si la courroie a été changée récemment." 
    },
    { 
        id: "bluehdi15", 
        keywords: ["1.5", "bluehdi", "hdi"], 
        badYears: [2017, 2018, 2019, 2020, 2021, 2022], 
        msg: "⚠️ MOTEUR 1.5 BLUEHDI : Fragilité connue de la chaîne d'arbres à cames (risque de casse moteur). Exigez la preuve du passage à la chaîne 8mm." 
    }
];

const MARQUES_DETECTABLES = ["RENAULT", "PEUGEOT", "CITROEN", "VOLKSWAGEN", "BMW", "AUDI", "MERCEDES", "TOYOTA", "FIAT", "FORD", "DACIA", "TESLA", "VOLVO", "PORSCHE", "SEAT", "NISSAN", "OPEL", "SUZUKI", "HYUNDAI", "KIA", "SKODA", "MINI", "LAND ROVER", "JEEP", "ALFA ROMEO"];

function extractCarDetails(text, userExtractedPrice, userExtractedYear) {
    const upperText = text.toUpperCase();
    let detected = { marque: null, modele: null, annee: userExtractedYear, km: null, prix: userExtractedPrice };

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
        if (upperText.includes(m)) {
            detected.marque = m;
            break;
        }
    }

    if (detected.marque) {
        const modelesPossibles = [...new Set(ARGUS_DB.filter(x => x.marque === detected.marque).map(x => x.modele))];
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

    const match = ARGUS_DB.find(row => 
        row.marque === details.marque &&
        row.modele === details.modele &&
        row.annee === details.annee &&
        row.km_tranche === tranche_cible
    );

    if (match) return { cote: match.cote, fiabilite: "Précise" };

    const matchesLoose = ARGUS_DB.filter(row => 
        row.marque === details.marque &&
        row.modele === details.modele &&
        row.annee === details.annee
    );

    if (matchesLoose.length > 0) {
        const avgCote = matchesLoose.reduce((acc, val) => acc + val.cote, 0) / matchesLoose.length;
        return { cote: Math.round(avgCote), fiabilite: "Estimée" };
    }

    return null;
}

app.get('/', (req, res) => {
    res.send('✅ API LeFauxCoin "Expert Argus" est EN LIGNE.');
});

app.post('/api/scan/auto', (req, res) => {
    const { description, siren, autoviza, extractedPrice, extractedYear } = req.body;
    const text = description || "";
    const cleanDescription = description.replace(/\s+/g, ' ').trim();
    
    let score = 0;
    let report = [];
    let positives = [];
    let isPro = false;
    let argusAnalysis = { type: "neutral", message: "" };
    
    const carDetails = extractCarDetails(text, extractedPrice, extractedYear);
    
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
                argusAnalysis.message = `🚨 PRIX BAS : ${carDetails.prix}€ vs Cote ${cote}€. -${Math.round(Math.abs(percentDiff))}% sous le marché.`;
            } else if (percentDiff > 35) {
                argusAnalysis.type = "bad_deal";
                argusAnalysis.message = `📉 TROP CHER : +${Math.round(percentDiff)}% au-dessus de la cote (${cote}€).`;
            } else if (percentDiff >= -15 && percentDiff <= 15) {
                score -= 15;
                argusAnalysis.type = "good_deal";
                argusAnalysis.message = `✅ PRIX JUSTE : Cohérent avec la cote (${cote}€).`;
                positives.push({ label: "Prix Cohérent", desc: "Conforme au marché." });
            } else {
                argusAnalysis.message = `ℹ️ Prix : ${carDetails.prix}€ (Cote: ${cote}€).`;
                argusAnalysis.type = "info";
            }
        }
    }

    const lowerText = text.toLowerCase();
    CAR_KNOWLEDGE_DB.forEach(risk => {
        const hasKeywords = risk.keywords.every(k => lowerText.includes(k));
        if (hasKeywords && risk.badYears.includes(carDetails.annee)) {
            score += 40;
            report.push({ type: 'fatal', label: "DÉFAUT MOTEUR", desc: risk.msg });
        }
    });

    if (siren) {
        isPro = true;
        positives.push({ label: "Entreprise", desc: `SIREN ${siren}` });
    }

    if (lowerText.includes("mandat cash") || lowerText.includes("coupons pcs")) {
        score += 100;
        report.push({ type: 'fatal', label: "FRAUDE", desc: "Paiement illégal demandé." });
    }

    score = Math.min(Math.max(score, 0), 100);
    const verdict = score >= 80 ? "DANGER" : score > 40 ? "SUSPECT" : "FIABLE";

    res.json({ 
        score, 
        verdict, 
        details: report, 
        positives, 
        isPro,
        argus: argusAnalysis 
    });
});

app.listen(PORT, () => console.log(`🚀 Serveur démarré sur ${PORT}`));