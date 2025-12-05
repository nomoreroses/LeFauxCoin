const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const https = require('https');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

// --- 0. SÉCURITÉ CORS ---
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(bodyParser.json());

app.get('/', (req, res) => {
    res.send('✅ API LeFauxCoin "Expert Argus" (Version Complete + Smart Match) est EN LIGNE.');
});

// --- 1. UTILS ---
const normalizeString = (str) => {
    if (!str) return "";
    return str.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Enlève les accents
        .replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e')
        .replace(/[^a-z0-9 ]/g, ''); // Garde les espaces pour le matching de mots
};

// --- 2. CHARGEMENT ET PARSING CSV ---
let ARGUS_DB = [];

const parseKmTranche = (tranche) => {
    if (!tranche) return { min: 0, max: 9999999 };
    const parts = tranche.split('-').map(p => parseInt(p.replace(/\D/g, '')));
    if (parts.length === 2) return { min: parts[0], max: parts[1] };
    if (parts.length === 1) return { min: parts[0], max: parts[0] }; 
    return { min: 0, max: 9999999 };
};

const loadArgusCSV = () => {
    const csvPath = path.join(__dirname, 'MA_COTE_ARGUS_OFFICIELLE.csv');
    console.log(`📂 Chargement de l'Argus depuis : ${csvPath}`);

    try {
        if (fs.existsSync(csvPath)) {
            const content = fs.readFileSync(csvPath, 'utf8');
            const lines = content.split(/\r?\n/);
            const startIndex = lines[0].toLowerCase().includes('marque') ? 1 : 0;

            for (let i = startIndex; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;
                const cols = line.split(';');
                if (cols.length < 7) continue;

                const kmRange = parseKmTranche(cols[3]);

                ARGUS_DB.push({
                    marque: normalizeString(cols[0]),
                    modele: normalizeString(cols[1]), // Ex: "207 sw urban"
                    modele_raw: cols[1],
                    annee: parseInt(cols[2]),
                    minKm: kmRange.min,
                    maxKm: kmRange.max,
                    cote: parseInt(cols[6])
                });
            }
            console.log(`✅ ${ARGUS_DB.length} cotes chargées avec succès.`);
        } else {
            console.warn("⚠️ Fichier 'MA_COTE_ARGUS_OFFICIELLE.csv' introuvable !");
        }
    } catch (e) {
        console.error("❌ Erreur lecture CSV:", e.message);
    }
};

loadArgusCSV();

// --- 3. ESTIMATION INTELLIGENTE (Smart Match) ---
const estimerPrixLocal = (modeleInput, anneeInput, kmInput, fullTextAd) => {
    if (!modeleInput || !anneeInput || ARGUS_DB.length === 0) return null;
    
    const searchModel = normalizeString(modeleInput); // Ex: "207"
    const searchKm = kmInput || 150000;
    const normalizedAd = normalizeString(fullTextAd || ""); // Titre complet de l'annonce

    // Étape 1 : Filtre large (Année + Modèle de base)
    let candidates = ARGUS_DB.filter(item => 
        item.annee === anneeInput && 
        (item.modele.includes(searchModel) || searchModel.includes(item.modele))
    );

    if (candidates.length === 0) return null;

    // Étape 2 : Scoring par pertinence (Smart Match)
    candidates = candidates.map(c => {
        const modelWords = c.modele.split(' ').filter(w => w.length > 1);
        let score = 0;
        modelWords.forEach(word => {
            if (normalizedAd.includes(word)) score += 10; // +10 points par mot clé trouvé (ex: "sw")
        });
        
        // Bonus si le kilométrage est DANS la tranche
        if (searchKm >= c.minKm && searchKm <= c.maxKm) score += 5;
        
        // Pénalité distance kilométrage
        const midKm = (c.minKm + c.maxKm) / 2;
        const kmDist = Math.abs(searchKm - midKm);
        
        return { ...c, score, kmDist };
    });

    // Étape 3 : Tri
    candidates.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.kmDist - b.kmDist;
    });

    const bestMatch = candidates[0];
    console.log(`🎯 Smart Match: "${bestMatch.modele_raw}" (Score: ${bestMatch.score}) pour l'annonce "${fullTextAd.substring(0,20)}..."`);
    
    return bestMatch.cote;
};


// --- 4. KNOWLEDGE BASE COMPLETE ---
const CAR_KNOWLEDGE_DB = [
    // --- GROUP PSA (PEUGEOT / CITROËN / DS / OPEL) ---
    { 
        id: "puretech", 
        keywords: ["puretech", "1.2", "vti", "82", "110", "130"], 
        badYears: [2013, 2014, 2015, 2016, 2017, 2018], 
        msg: "🚨 MOTEUR PURETECH (1.0/1.2) : Risque critique de dégradation de la courroie de distribution (bouchage crépine huile). Vérifiez impérativement si la courroie a été changée récemment." 
    },
    { 
        id: "bluehdi15", 
        keywords: ["1.5", "bluehdi", "hdi"], 
        badYears: [2017, 2018, 2019, 2020], 
        msg: "⚠️ 1.5 BlueHDi : Fragilité de la chaîne d'arbre à cames (bruit/casse) et défaillance fréquente du réservoir d'AdBlue (cristallisation)." 
    },
    { 
        id: "bmp6", 
        keywords: ["bmp6", "etg6", "robotise", "robotisée"], 
        msg: "⚠️ BOÎTE BMP6/ETG6 : Boîte lente et sujette aux à-coups. Usure prématurée de l'embrayage et de la butée." 
    },
    { 
        id: "thp", 
        keywords: ["thp", "150", "156", "175", "200", "gti"], 
        badYears: [2007, 2008, 2009, 2010, 2011, 2012], 
        msg: "⛔️ MOTEUR PRINCE (1.6 THP) : Distribution très fragile (décalage chaîne) et consommation d'huile excessive." 
    },
    { 
        id: "picasso_air", 
        keywords: ["picasso", "c4"], 
        msg: "ℹ️ C4 PICASSO : Vérifiez les boudins de suspension pneumatique arrière (fuites fréquentes)." 
    },

    // --- RENAULT / DACIA / NISSAN ---
    { 
        id: "tce12", 
        keywords: ["1.2", "tce", "dig-t", "115", "120", "125", "130"], 
        badYears: [2012, 2013, 2014, 2015, 2016], 
        msg: "⛔️ MOTEUR 1.2 TCe (2012-2016) : ALERTE ROUGE. Risque majeur de surconsommation d'huile menant à la casse moteur (Défaut de conception segmentation)." 
    },
    { 
        id: "dci_coussinets", 
        keywords: ["1.5", "dci", "1.9", "dci"], 
        badYears: [2006, 2007, 2008], 
        msg: "⚠️ 1.5/1.9 dCi (Anciens) : Risque de coulure de bielles (coussinets). Vérifiez si le moteur claque." 
    },
    { 
        id: "rlink", 
        keywords: ["scenic", "megane", "talisman", "espace"], 
        badYears: [2015, 2016, 2017], 
        msg: "ℹ️ ÉLECTRONIQUE : Nombreux bugs du système R-Link 2 (écran noir, clim, radio) sur les modèles 2015-2017." 
    },

    // --- BMW / MINI ---
    { 
        id: "n47", 
        keywords: ["116d", "118d", "120d", "318d", "320d", "x1", "x3", "n47", "2.0"], 
        badYears: [2007, 2008, 2009, 2010, 2011, 2012, 2013], 
        msg: "🚨 DIESEL BMW N47 : Fragilité connue de la chaîne de distribution (située à l'arrière). Un bruit de cigale annonce une casse moteur imminente." 
    },
    { 
        id: "n20", 
        keywords: ["20i", "28i", "essence"], 
        badYears: [2011, 2012, 2013, 2014, 2015], 
        msg: "⚠️ ESSENCE BMW (N20) : Problèmes de guide de chaîne de distribution et pompe à huile." 
    },

    // --- AUDI / VW / SEAT / SKODA ---
    { 
        id: "tfsi_oil", 
        keywords: ["1.8", "2.0", "tfsi", "tsi"], 
        badYears: [2008, 2009, 2010, 2011, 2012], 
        msg: "⚠️ 1.8/2.0 TFSI/TSI : Grave défaut de segmentation entraînant une surconsommation d'huile massive (1L/1000km)." 
    },
    { 
        id: "stronic", 
        keywords: ["s-tronic", "stronic", "dsg", "dsg7", "dq200"], 
        msg: "⚠️ BOÎTE DSG7/S-Tronic (DQ200) : Usure prématurée du double embrayage et défaillance de la mécatronique." 
    },
    { 
        id: "tdi_pompe", 
        keywords: ["tdi", "1.6", "2.0"], 
        badYears: [2013, 2014, 2015, 2016], 
        msg: "ℹ️ TDI (EA288) : Défaillances fréquentes de la pompe à eau (surchauffe) et du radiateur de vanne EGR." 
    },

    // --- FIAT / ALFA ---
    { 
        id: "mjt13", 
        keywords: ["1.3", "mjt", "multijet", "jtdm"], 
        msg: "⚠️ 1.3 MultiJet/JTDm : Chaîne de distribution qui se détend (bruit à froid) et injecteurs fragiles. Attention à la dilution de l'huile (FAP)." 
    },
    { 
        id: "twinair", 
        keywords: ["0.9", "twinair"], 
        msg: "ℹ️ 0.9 TwinAir : Volant moteur bi-masse fragile et turbo capricieux sur les premiers modèles." 
    }
];

const SCAM_SCRIPTS_DB = [
    { pattern: /très propre intérieur et extérieur aucun frais à prévoir aucun bosses/i, label: "SCRIPT ARNAQUE", desc: "Faute 'aucun bosses' typique." },
    { pattern: /pas de mail ni de sms/i, label: "CONTACT SUSPECT", desc: "Refus de traces écrites." },
    { pattern: /western union|mandat cash|pcs/i, label: "PAIEMENT ILLÉGAL", desc: "Arnaque 100%." },
    { pattern: /chèque de banque (?:certifié|vérifié) le (?:samedi|dimanche)/i, label: "ARNAQUE CHÈQUE", desc: "Demande hors jours ouvrés." }
];

// --- 5. HELPERS ---
const hasNegativeContext = (text, keyword, windowSize = 30) => {
    if (!text) return false;
    const lowerText = text.toLowerCase();
    const index = lowerText.indexOf(keyword.toLowerCase());
    if (index === -1) return false;
    const start = Math.max(0, index - windowSize);
    const contextBefore = lowerText.substring(start, index);
    const negations = ["pas de ", "aucun ", "sans ", "0 ", "ni ", "jamais ", "non ", "ne "];
    return negations.some(neg => contextBefore.includes(neg));
};

const extractMainDescription = (fullText) => {
    if (!fullText) return "";
    let start = fullText.indexOf("Description");
    if (start === -1) start = 0;
    const markers = ["Ces annonces peuvent", "Voir plus", "Signaler", "Financement"];
    let end = fullText.length;
    markers.forEach(m => { const idx = fullText.indexOf(m, start); if(idx !== -1 && idx < end) end = idx; });
    return fullText.substring(start, end);
};

// LISTE COMPLETE DES MODELES
const CAR_MODELS_DB = [
    // PETITES CITADINES
    "clio", "208", "c3", "yaris", "polo", "corsa", "sandero", "fiesta", "207", "206", 
    "twingo", "107", "108", "c1", "aygo", "i10", "i20", "picanto", "rio", "micra", 
    "swift", "zoe", "spring", "up", "citigo", "mii", "panda", "500", "ka", "adam", 
    "karl", "spark", "alto", "celerio", "space star", "a1", "mito", "ds3",

    // COMPACTES
    "golf", "308", "megane", "c4", "a3", "serie 1", "classe a", "focus", "astra", 
    "leon", "ibiza", "fabia", "octavia", "scala", "tipo", "ceed", "i30", "auris", 
    "corolla", "civic", "mazda 3", "delta", "giulietta", "v40", "c30", "ds4",

    // BERLINES / ROUTIÈRES
    "passat", "508", "c5", "talisman", "insignia", "mondeo", "a4", "a5", "serie 3", 
    "serie 5", "classe c", "classe e", "superb", "avensis", "mazda 6", "5008", 
    "arteon", "xe", "xf", "ds5", "model 3", "laguna", "407", "607", "c6",

    // SUV / CROSSOVERS
    "captur", "2008", "3008", "c3 aircross", "c5 aircross", "kadjar", "arkana", 
    "austral", "kuga", "puma", "duster", "tiguan", "t-roc", "t-cross", "touareg", 
    "q2", "q3", "q5", "x1", "x3", "x5", "gla", "glc", "gle", "sportage", "tucson", 
    "kona", "niro", "juke", "qashqai", "x-trail", "rav4", "c-hr", "yaris cross", 
    "cx-3", "cx-5", "cx-30", "renegade", "compass", "ds7", "ds3 crossback", 
    "mokka", "grandland", "crossland", "jogger", "stepway", "ignis", "vitara", "xc60",

    // MONOSPACES / UTILITAIRES FAMILIAUX
    "scenic", "espace", "picasso", "berlingo", "rifter", "partner", "kangoo", 
    "touran", "sharan", "c-max", "s-max", "galaxy", "zafira", "meriva", "b-max", 
    "lodgy", "dokker", "roomster", "yeti", "vito", "multivan", "traveller", "expert", "cobra"
];

const extractPreciseModel = (text) => {
    if (!text) return null;
    const t = text.toLowerCase();
    const structureMatch = text.match(/Modèle[\s\n]+([a-zA-Z0-9éè]+)/i);
    if (structureMatch && structureMatch[1]) return structureMatch[1].toLowerCase();
    const sortedModels = CAR_MODELS_DB.sort((a, b) => b.length - a.length);
    for (const model of sortedModels) {
        if (t.includes(model)) {
            if (model === "500" && (t.includes("5008") || t.includes("500x"))) continue;
            return model;
        }
    }
    return null;
};

const extractMileage = (text) => {
    if (!text) return 150000;
    const match = text.match(/(\d{2,3})[\s.]?(\d{3})\s*(?:km)/i) || text.match(/(\d{4,6})\s*(?:km)/i);
    if (match) {
        let km = parseInt((match[1] + (match[2] || '000')).replace(/\D/g, ''));
        if (km < 1000) km *= 1000;
        return km;
    }
    return 150000;
};

const nodeRequest = (url) => {
    return new Promise((resolve, reject) => {
        const req = https.get(url, (res) => {
            let data = ''; res.on('data', c => data += c);
            res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(new Error("No JSON")); } });
        });
        req.on('error', e => reject(e)); req.end();
    });
};

const estimerPrixIA = (modele, annee, km) => {
    if (!modele || !annee || !km) return null;
    return new Promise((resolve) => {
        const postData = JSON.stringify({ modele, annee, km });
        const options = {
            hostname: 'api-prix-python.onrender.com',
            port: 443,
            path: '/estimer',
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': postData.length },
            timeout: 5000, 
        };
        const req = https.request(options, (res) => {
            let data = ''; res.on('data', c => data += c);
            res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { resolve(null); } });
        });
        req.on('timeout', () => { req.destroy(); resolve(null); });
        req.on('error', () => resolve(null));
        req.end(postData);
    });
};

// --- 6. ROUTE SCAN ---
const investigateCompany = async (rawSiren) => {
    if (!rawSiren) return null;
    let siren = rawSiren.replace(/\D/g, '');
    if (siren.length === 14) siren = siren.substring(0, 9);
    if (siren.length !== 9) return null;

    try {
        const data = await nodeRequest(`https://recherche-entreprises.api.gouv.fr/search?q=${siren}`);
        if (!data.results || !data.results.length) return { exists: false };
        const c = data.results[0];
        const s = c.siege;
        
        let mInfo = "Non public";
        if (c.dirigeants && c.dirigeants[0]) {
             const d = c.dirigeants[0];
             mInfo = `${d.prenoms||''} ${d.nom||''}`.trim();
        }

        return { 
            exists: true, 
            name: c.nom_complet, 
            isClosed: c.etat_administratif === 'C',
            naf: c.activite_principale, 
            address: `${s.numero_voie||''} ${s.libelle_voie}, ${s.code_postal} ${s.libelle_commune}`, 
            isGarage: c.activite_principale.startsWith('45'),
            managerInfo: mInfo,
            recentMoves: 0 // Simplifié
        };
    } catch { return "ERROR_NETWORK"; }
};

app.post('/api/scan/auto', async (req, res) => {
    try {
        const { description = "", autoviza = "", siren = "", extractedPrice = null, extractedYear = null, accountYear = null } = req.body || {};
        
        const cleanDescription = extractMainDescription(description);
        const detectedModel = extractPreciseModel(cleanDescription);
        const extractedKm = extractMileage(cleanDescription);
        
        let score = 0;
        let report = [];
        let positives = [];

        // 1. ANALYSE PRIX (CSV SMART MATCH)
        let estimationPrix = null;
        let sourceEstimation = null;

        // On passe cleanDescription en 4ème argument pour le Smart Match
        const prixCSV = estimerPrixLocal(detectedModel, extractedYear, extractedKm, cleanDescription);
        
        if (prixCSV) {
            estimationPrix = prixCSV;
            sourceEstimation = "Cote Officielle CSV";
        } else {
            // Fallback IA
            const estimationIA = await estimerPrixIA(detectedModel, extractedYear, extractedKm);
            if (estimationIA && estimationIA.prix_estime) {
                estimationPrix = estimationIA.prix_estime;
                sourceEstimation = "IA En Ligne";
            }
        }

        if (estimationPrix && extractedPrice) {
            const diff = Math.abs(extractedPrice - estimationPrix);
            const percentDiff = diff / estimationPrix;
            
            if (percentDiff > 0.35) {
                score += 40;
                if (extractedPrice < estimationPrix) {
                    report.push({ type: 'danger', label: `Prix Suspect (${sourceEstimation})`, desc: `Cote: ${estimationPrix}€. Écart -${Math.round(percentDiff*100)}%.` });
                } else {
                    report.push({ type: 'warning', label: `Prix Élevé (${sourceEstimation})`, desc: `Supérieur à la cote (${estimationPrix}€).` });
                }
            } else {
                positives.push({ label: "Prix Cohérent", desc: `Conforme à la cote (${estimationPrix}€) - Source: ${sourceEstimation}.` });
            }
        }

        // 2. SCRIPTS
        const scripts = analyzeScripts(cleanDescription);
        score += scripts.scoreMod;
        report = [...report, ...scripts.flags];

        // 3. FIABILITÉ
        for (const entry of CAR_KNOWLEDGE_DB) {
            if (entry.badYears && !entry.badYears.includes(extractedYear)) continue;
            const normText = normalizeString(cleanDescription);
            if (entry.keywords.some(k => normText.includes(k))) {
                 // Exception courroie faite
                 if (entry.id === 'puretech' && normText.includes("courroie faite")) continue;
                 score += 35;
                 report.push({ type: 'warning', label: "Fiabilité Modèle", desc: entry.msg });
            }
        }

        // 4. SIRET
        let mapsLink = null;
        let companyHistory = [];
        let isPro = !!siren;
        if (siren) {
            const info = await investigateCompany(siren);
            if (info && info.exists) {
                if (info.isClosed) { score += 100; report.push({ type: 'danger', label: "ENTREPRISE FERMÉE", desc: "Cessée/Radiée." }); }
                else {
                    positives.push({ label: "Pro Vérifié", desc: `${info.name} (${info.isGarage ? 'Garage' : 'Autre'})` });
                    if (info.managerInfo) positives.push({ label: "Gérant", desc: info.managerInfo });
                    mapsLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(info.address)}`;
                }
            } else if (info && !info.exists) {
                score += 100; report.push({ type: 'danger', label: "FAUX SIRET", desc: "Numéro invalide." });
            }
        }

        score = Math.min(Math.max(score, 0), 100);
        const verdict = score >= 80 ? "DANGER" : score > 40 ? "SUSPECT" : "FIABLE";

        res.json({ score, verdict, details: report, positives, mapsLink, history: companyHistory, isPro });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => console.log(`✅ Serveur prêt sur le port ${PORT}`));