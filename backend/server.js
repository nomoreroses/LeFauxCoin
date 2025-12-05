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
    res.send('✅ API LeFauxCoin "Expert Argus" (Version CSV Officiel) est EN LIGNE.');
});

// --- 1. CHARGEMENT DU CSV "MA_COTE_ARGUS_OFFICIELLE.csv" ---
let ARGUS_DB = [];

const parseKmTranche = (tranche) => {
    // Ex: "120000 - 135000" -> { min: 120000, max: 135000 }
    if (!tranche) return { min: 0, max: 9999999 };
    const parts = tranche.split('-').map(p => parseInt(p.replace(/\D/g, '')));
    if (parts.length === 2) return { min: parts[0], max: parts[1] };
    if (parts.length === 1) return { min: parts[0], max: parts[0] }; // Cas rare
    return { min: 0, max: 9999999 };
};

const loadArgusCSV = () => {
    const csvPath = path.join(__dirname, 'MA_COTE_ARGUS_OFFICIELLE.csv');
    console.log(`📂 Chargement de l'Argus depuis : ${csvPath}`);

    try {
        if (fs.existsSync(csvPath)) {
            const content = fs.readFileSync(csvPath, 'utf8');
            const lines = content.split(/\r?\n/);
            
            // On saute la première ligne (Headers) si elle contient "Marque"
            const startIndex = lines[0].toLowerCase().includes('marque') ? 1 : 0;

            for (let i = startIndex; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;

                // Format attendu: Marque;Modele;Annee;Km_Tranche;Energie;Boite;Cote_Moyenne;...
                const cols = line.split(';');
                if (cols.length < 7) continue;

                const kmRange = parseKmTranche(cols[3]);

                ARGUS_DB.push({
                    marque: normalizeString(cols[0]),
                    modele: normalizeString(cols[1]), // Normalisation pour recherche facile
                    modele_raw: cols[1],             // Garder le vrai nom pour affichage
                    annee: parseInt(cols[2]),
                    minKm: kmRange.min,
                    maxKm: kmRange.max,
                    cote: parseInt(cols[6]) // Cote_Moyenne
                });
            }
            console.log(`✅ ${ARGUS_DB.length} cotes chargées en mémoire.`);
        } else {
            console.warn("⚠️ Fichier 'MA_COTE_ARGUS_OFFICIELLE.csv' introuvable !");
        }
    } catch (e) {
        console.error("❌ Erreur lecture CSV:", e.message);
    }
};

// Charge la base au démarrage
loadArgusCSV();

// --- 2. FONCTION D'ESTIMATION LOCALE ---
const estimerPrixLocal = (modeleInput, anneeInput, kmInput) => {
    if (!modeleInput || !anneeInput || ARGUS_DB.length === 0) return null;
    
    const searchModel = normalizeString(modeleInput);
    const searchKm = kmInput || 150000; // Par défaut si inconnu

    // 1. Filtrer par Année et Modèle (match partiel autorisé sur le modèle)
    let candidates = ARGUS_DB.filter(item => 
        item.annee === anneeInput && 
        (item.modele.includes(searchModel) || searchModel.includes(item.modele))
    );

    if (candidates.length === 0) return null;

    // 2. Trouver la bonne tranche kilométrique
    // On cherche la tranche qui contient le kilométrage exact
    let bestMatch = candidates.find(item => searchKm >= item.minKm && searchKm <= item.maxKm);

    // Si pas de tranche exacte (ex: voiture a 200.000km et le tableau s'arrête à 150.000)
    // On prend le plus proche (le maxKm le plus élevé ou le minKm le plus bas)
    if (!bestMatch) {
        candidates.sort((a, b) => Math.abs(a.minKm - searchKm) - Math.abs(b.minKm - searchKm));
        bestMatch = candidates[0];
    }

    return bestMatch ? bestMatch.cote : null;
};


// --- 3. KNOWLEDGE BASE COMPLETE ---
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
    { pattern: /très propre intérieur et extérieur aucun frais à prévoir aucun bosses ou rayures/i, label: "SCRIPT CONNU (Arnaque)", desc: "Texte utilisé massivement avec la faute 'aucun bosses'." },
    { pattern: /véhicule roule tous les jours parcours toute distance/i, label: "PHRASE GÉNÉRIQUE", desc: "Formule type pour rassurer, souvent copiée-collée." },
    { pattern: /curieux s'abstenir/i, label: "VENDEUR AGRESSIF", desc: "Décourage les questions légitimes." },
    { pattern: /pas de mail ni de sms/i, label: "CONTACT SUSPECT", desc: "Refus de traces écrites, privilégie l'oral pour ne pas laisser de preuves." },
    { pattern: /prix ferme et définitif/i, label: "PRIX SUSPECT", desc: "Tente d'imposer une vente rapide sans discussion." },
    { pattern: /donne contre bon soin/i, label: "ARNAQUE AU DON", desc: "Arnaque classique aux frais de transport (Faux don)." },
    { pattern: /western union|mandat cash|pcs|toneo/i, label: "PAIEMENT ILLÉGAL", desc: "Moyens de paiement non traçables = Arnaque 100%." },
    { pattern: /chèque de banque (?:certifié|vérifié) le (?:samedi|dimanche)/i, label: "ARNAQUE CHÈQUE", desc: "Demande de chèque le week-end quand les banques sont fermées." }
];

// --- UTILITIES ---
const normalizeString = (str) => {
    if (!str) return "";
    return str.toLowerCase().replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/@/g, 'a').replace(/[^a-z0-9 ]/g, '');
};

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
    const noiseMarkers = ["Ces annonces peuvent vous intéresser", "Voir plus d’annonces", "Signaler l’annonce", "Financement", "Cetelem", "Vos droits et obligations", "Les annonces de"];
    let end = fullText.length;
    for (const marker of noiseMarkers) {
        const idx = fullText.indexOf(marker, start);
        if (idx !== -1 && idx < end) end = idx;
    }
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

    // 1. Structure LeBonCoin
    const structureMatch = text.match(/Modèle[\s\n]+([a-zA-Z0-9éè]+)/i);
    if (structureMatch && structureMatch[1]) {
        return structureMatch[1].toLowerCase();
    }

    // 2. Recherche dans la liste (Triée par longueur pour éviter les conflits ex: C4 vs C4 Picasso)
    const sortedModels = CAR_MODELS_DB.sort((a, b) => b.length - a.length);

    for (const model of sortedModels) {
        if (t.includes(model)) {
            // FIX SPÉCIAL : Eviter que "500" matche "5008" ou "500x"
            if (model === "500" && (t.includes("5008") || t.includes("500x") || t.includes("500 x"))) continue;
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

// Fonction NodeRequest et IA (Fallback)
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
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { resolve(null); } });
        });
        req.on('timeout', () => { req.destroy(); resolve(null); });
        req.on('error', () => resolve(null));
        req.end(postData);
    });
};

// --- ANALYSES ---

const analyzeScripts = (text) => { 
    if (!text) return { scoreMod: 0, flags: [] };
    let flags = []; let scoreMod = 0;
    for (const script of SCAM_SCRIPTS_DB) {
        if (script.pattern.test(text)) {
            scoreMod += 45; flags.push({ type: 'danger', label: script.label, desc: script.desc });
        }
    }
    return { scoreMod, flags };
};

const checkConsistency = (adText, reportText, adYear) => {
    if (!reportText || reportText.length < 20) return { valid: true, flags: [] }; 
    let flags = []; let isValid = true;
    const adModel = extractPreciseModel(adText);
    const report = reportText.toLowerCase();

    if (adModel && !report.includes(adModel)) {
        const detectedReportModel = report.match(/logo [a-z]+ ([a-z0-9]+)/i)?.[1] || "Autre";
        if (!detectedReportModel.includes(adModel) && !adModel.includes(detectedReportModel)) {
            isValid = false;
            flags.push({ type: 'fatal', label: "Rapport Incohérent (Modèle)", desc: `Annonce "${adModel}" vs Rapport "${detectedReportModel}".` });
        }
    }
    if (adYear) {
        let reportYear = null;
        const matchDate = report.match(/mise en circulation.*?(\d{2}\/\d{2}\/)(\d{4})/i);
        const matchStrictAutoviza = reportText.match(/(\d{4})[,\s\wéû]+Mise en circulation/i);
        if (matchDate) reportYear = parseInt(matchDate[2]);
        else if (matchStrictAutoviza) reportYear = parseInt(matchStrictAutoviza[1]);

        if (reportYear && Math.abs(reportYear - adYear) > 1) { 
            isValid = false;
            flags.push({ type: 'fatal', label: "Rapport Incohérent (Année)", desc: `Annonce ${adYear} vs Rapport ${reportYear}.` });
        }
    }
    return { valid: isValid, flags };
};

const analyzeReliability = (adText, year) => {
    let flags = []; let scoreMod = 0; const cleanAd = normalizeString(adText);
    if (!year) return { scoreMod, flags };
    
    for (const entry of CAR_KNOWLEDGE_DB) {
        let yearMatch = false;
        if (entry.badYears) { if (entry.badYears.includes(year)) yearMatch = true; } else { yearMatch = true; }
        const keywordMatch = entry.keywords.some(k => cleanAd.includes(k));

        if (yearMatch && keywordMatch) {
            if (entry.id === 'puretech' && (cleanAd.includes("courroie faite") || cleanAd.includes("distribution faite"))) continue; 
            scoreMod += 35; 
            flags.push({ type: 'warning', label: "Fiabilité Modèle/Moteur", desc: entry.msg });
        }
    }
    return { scoreMod, flags };
};

const analyzeHistory = (adText, autoText) => { 
    const ad = (adText || "").toLowerCase(); const auto = (autoText || "").toLowerCase();
    let flags = []; let scoreMod = 0;
    const claimsFirst = /(?:1|premi[eè]re)[\s-]*main/i.test(ad);
    const blackHole = auto.includes("période sans information") || auto.includes("importation");
    const ownersMatch = auto.match(/(\d+)\s+propriétaires/i);
    const count = ownersMatch ? parseInt(ownersMatch[1]) : 0;

    if (claimsFirst && count > 1) { scoreMod += 60; flags.push({ type: 'danger', label: "Mensonge 1ère Main", desc: `Rapport: ${count} propriétaires.` }); }
    if (blackHole) { scoreMod += 20; flags.push({ type: 'warning', label: "Historique Incomplet", desc: "Import ou données manquantes." }); }
    return { scoreMod, flags };
};

const analyzeFinancial = (cleanText, headerPrice) => { 
    let f=[], s=0; const a = (cleanText || "").toLowerCase();
    if(a.includes("frais de dossier") && !hasNegativeContext(a, "frais de dossier")) { s+=20; f.push({type:'warning', label:'Frais Cachés', desc:'Hors frais dossier.'}); }
    
    const textPrices = a.match(/(\d{1,3}(?:[\s.]\d{3})*)\s?€/g);
    if (textPrices && headerPrice) {
        textPrices.forEach(p => {
            const val = parseInt(p.replace(/\D/g, ''));
            if (val > (headerPrice * 5) || (val > 1990 && val < 2030)) return; 
            if (val > 1000 && Math.abs(val - headerPrice) > (headerPrice * 0.2)) {
                if (!a.includes("reprise") && !a.includes("crédit") && !a.includes("apport")) {
                    s+=50; f.push({type:'danger', label:"Prix Contradictoire", desc:`${headerPrice}€ vs ${val}€.`});
                }
            }
        });
    }
    return {scoreMod:s, flags:f};
};

const analyzeMechanical = (cleanText) => {
    let f=[], s=0; const a = (cleanText || "").toLowerCase();
    if (a.includes("berceau")) { s+=40; f.push({type:'warning', label:"Intervention Lourde", desc:"Changement de berceau."}); }
    if (a.includes("joint de culasse") && !a.includes("fait")) { s+=60; f.push({type:'danger', label:"Panne Moteur", desc:"Joint de culasse à prévoir."}); }
    if (a.includes("moteur hs") || a.includes("en l'état")) { s+=100; f.push({type:'danger', label:"Véhicule Non Roulant", desc:"Vendu pour pièces ou HS."}); }
    return {scoreMod:s, flags:f};
};

// --- FIX SIRET (Version corrigée) ---
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
        
        const now = new Date();
        const ageB = Math.floor((now - new Date(c.date_creation)) / (1000 * 60 * 60 * 24 * 30));
        const ageA = Math.floor((now - new Date(s.date_creation || c.date_creation)) / (1000 * 60 * 60 * 24 * 30));
        
        let mInfo = "Non public", mAge = null;
        if (c.dirigeants && c.dirigeants[0]) { 
            const d = c.dirigeants[0]; const n = `${d.prenoms||''} ${d.nom||''}`.trim();
            if (d.annee_de_naissance) { mAge = new Date().getFullYear() - d.annee_de_naissance; mInfo = `${n} (${mAge} ans)`; } else mInfo = n;
        }

        let moves = 0, hist = [];
        if (c.matching_etablissements) {
            const e = c.matching_etablissements.sort((a,b)=>new Date(b.date_creation)-new Date(a.date_creation));
            const y1 = new Date(); y1.setFullYear(now.getFullYear()-1);
            if (ageA < 24) {
                 hist = e.map(x => { if(new Date(x.date_creation)>y1) moves++; return `${x.etat_administratif==='A'?'✅':'❌'} : ${x.libelle_commune||'Inc.'} (${new Date(x.date_creation).toLocaleDateString('fr-FR')})`; });
            }
        }

        return { 
            exists: true, 
            name: c.nom_complet, 
            isClosed: c.etat_administratif === 'C',
            naf: c.activite_principale, 
            nafLabel: c.activite_principale_libelle, 
            address: `${s.numero_voie||''} ${s.type_voie||''} ${s.libelle_voie}, ${s.code_postal} ${s.libelle_commune}`, 
            ageBoiteMois: ageB, 
            ageAdresseMois: ageA, 
            managerInfo: mInfo, 
            managerAge: mAge, 
            recentMoves: moves, 
            history: hist, 
            isGarage: c.activite_principale.startsWith('45')
        };
    } catch { return "ERROR_NETWORK"; }
};

// --- ROUTE SCAN ---
app.post('/api/scan/auto', async (req, res) => {
    try {
        const { description = "", autoviza = "", siren = "", extractedPrice = null, extractedYear = null, accountYear = null } = req.body || {};
        
        const cleanDescription = extractMainDescription(description);
        let score = 0;
        let report = [];
        let positives = [];
        let mapsLink = null;
        let companyHistory = [];
        let isPro = false;
        let accountAgeRisk = false;

        // A. COHÉRENCE
        const consistency = checkConsistency(cleanDescription, autoviza, extractedYear);
        const validAutoviza = consistency.valid ? autoviza : ""; 
        if (!consistency.valid) { report = [...report, ...consistency.flags]; score += 60; }
        else if (autoviza && autoviza.length > 50) { positives.push({ label: "Rapport Analysé", desc: "Cohérent." }); }

        // DONNÉES CLÉS
        const detectedModel = extractPreciseModel(cleanDescription);
        const extractedKm = extractMileage(cleanDescription);
        
        // B. ANALYSES
        const scriptAnalysis = analyzeScripts(cleanDescription);
        score += scriptAnalysis.scoreMod;
        report = [...report, ...scriptAnalysis.flags];

        // 1. ESTIMATION PRIX (CSV PRIORITAIRE)
        let estimationPrix = null;
        let sourceEstimation = null;

        // Tentative via CSV
        const prixCSV = estimerPrixLocal(detectedModel, extractedYear, extractedKm);
        
        if (prixCSV) {
            estimationPrix = prixCSV;
            sourceEstimation = "Cote Officielle CSV";
            console.log(`🎯 Trouvé dans CSV : ${detectedModel} (${extractedYear}, ${extractedKm}km) -> ${prixCSV}€`);
        } else {
            console.log(`⚠️ Pas trouvé dans CSV pour : ${detectedModel} / ${extractedYear} / ${extractedKm}km`);
            // Fallback IA si CSV échoue
            const estimationIA = await estimerPrixIA(detectedModel, extractedYear, extractedKm);
            if (estimationIA && estimationIA.prix_estime) {
                estimationPrix = estimationIA.prix_estime;
                sourceEstimation = "IA En Ligne";
            }
        }

        if (estimationPrix && extractedPrice) {
            const diff = Math.abs(extractedPrice - estimationPrix);
            const percentDiff = diff / estimationPrix;
            
            if (percentDiff > 0.35) { // Écart > 35%
                score += 40;
                if (extractedPrice < estimationPrix) {
                    report.push({ type: 'danger', label: `Prix Suspect (${sourceEstimation})`, desc: `Cote: ${estimationPrix}€. Écart -${Math.round(percentDiff*100)}%.` });
                } else {
                    report.push({ type: 'warning', label: `Prix Élevé (${sourceEstimation})`, desc: `Supérieur à la cote (${estimationPrix}€).` });
                }
            } else {
                positives.push({ label: "Prix Cohérent", desc: `Conforme à la cote (${estimationPrix}€).` });
            }
        } else if (!estimationPrix) {
            report.push({ type: 'info', label: "Cote Indisponible", desc: "Modèle absent du fichier CSV." });
        }

        if (consistency.valid || !autoviza) {
            const relAnalysis = analyzeReliability(cleanDescription, extractedYear);
            score += relAnalysis.scoreMod;
            report = [...report, ...relAnalysis.flags];

            const histAnalysis = analyzeHistory(cleanDescription, validAutoviza);
            score += histAnalysis.scoreMod;
            report = [...report, ...histAnalysis.flags];

            const mechAnalysis = analyzeMechanical(cleanDescription);
            score += mechAnalysis.scoreMod;
            report = [...report, ...mechAnalysis.flags];
        }

        const finAnalysis = analyzeFinancial(cleanDescription, extractedPrice);
        score += finAnalysis.scoreMod;
        report = [...report, ...finAnalysis.flags];

        // C. SIRET
        if (siren) {
            isPro = true;
            const info = await investigateCompany(siren);
            
            if (info && info !== "ERROR_NETWORK") {
                 if (info.exists === false) { 
                     score += 100; 
                     report.push({ type: 'danger', label: "FAUX SIREN", desc: `Numéro ${siren} introuvable.` }); 
                 }
                 else {
                     mapsLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(info.address)}`;
                     companyHistory = info.history;
                     
                     if (info.isClosed) { score += 100; report.push({ type: 'danger', label: "ENTREPRISE FERMÉE", desc: "Statut: Cessée/Radiée." }); }
                     else if (info.recentMoves >= 2) { score += 65; report.push({ type: 'danger', label: "INSTABILITÉ", desc: `${info.recentMoves} déménagements en 1 an.` }); }
                     else if (info.ageAdresseMois < 6 && info.ageBoiteMois > 24) { score += 30; report.push({ type: 'warning', label: "Déménagement Récent", desc: "Adresse changée il y a < 6 mois." }); }
                     else if (info.ageAdresseMois > 24) { score -= 15; positives.push({ label: "Adresse Stable", desc: `Depuis ${Math.floor(info.ageAdresseMois/12)} ans.` }); }
                     
                     if (!info.isGarage) { score += 45; report.push({ type: 'warning', label: "Activité Douteuse", desc: "Code NAF hors auto." }); }
                     else { score -= 10; positives.push({ label: "Activité Vérifiée", desc: "Commerce Auto." }); }
                     if (info.managerInfo) positives.push({ label: "Dirigeant", desc: info.managerInfo });
                 }
            }
        } else { positives.push({ label: "Vendeur", desc: "Particulier" }); }

        if (accountYear) {
            const age = new Date().getFullYear() - accountYear;
            if (age < 1) { score += 25; accountAgeRisk = true; report.push({ type: 'warning', label: "Compte Récent", desc: "Créé cette année." }); }
            else if (age > 4) { score -= 10; positives.push({ label: "Compte Ancien", desc: `Membre ${age} ans.` }); }
        }
        
        const text = cleanDescription.toLowerCase();
        if (text.includes("mandat cash") || text.includes("coupons pcs")) { score += 100; report.push({ type: 'danger', label: "Arnaque Paiement", desc: "Méthode illégale." }); }

        score = Math.min(Math.max(score, 0), 100);
        const verdict = score >= 80 ? "DANGER" : score > 40 ? "SUSPECT" : "FIABLE";

        res.json({ score, verdict, details: report, positives, mapsLink, history: companyHistory, isPro, accountAgeRisk });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => console.log(`✅ Serveur prêt sur le port ${PORT}`));