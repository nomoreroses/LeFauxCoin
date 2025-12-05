const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const https = require('https');

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
    res.send('✅ API LeFauxCoin "Expert Argus" est EN LIGNE.');
});

// --- 1. KNOWLEDGE BASE ---
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
        id: "n47", 
        keywords: ["116d", "118d", "120d", "318d", "320d", "x1", "x3", "n47", "2.0"], 
        badYears: [2007, 2008, 2009, 2010, 2011, 2012, 2013], 
        msg: "🚨 DIESEL BMW N47 : Fragilité connue de la chaîne de distribution (située à l'arrière). Un bruit de cigale annonce une casse moteur imminente." 
    },
    { 
        id: "tfsi_oil", 
        keywords: ["1.8", "2.0", "tfsi", "tsi"], 
        badYears: [2008, 2009, 2010, 2011, 2012], 
        msg: "⚠️ 1.8/2.0 TFSI/TSI : Grave défaut de segmentation entraînant une surconsommation d'huile massive (1L/1000km)." 
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

// --- 2. UTILITIES ---
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

const CAR_MODELS_DB = ["clio", "208", "c3", "207", "golf", "308", "megane", "c4", "a3", "serie 1", "fiesta", "polo", "yaris", "twingo", "sandero", "duster", "captur", "2008", "3008", "5008", "scenic", "picasso", "zafira", "touran", "tiguan", "qashqai", "juke", "sportage", "tucson", "a4", "serie 3", "classe c", "passat", "508", "c5"];

const extractPreciseModel = (text) => {
    if (!text) return null;
    const t = text.toLowerCase();
    const structureMatch = text.match(/Modèle[\s\n]+([a-zA-Z0-9éè]+)/i);
    if (structureMatch && structureMatch[1]) return structureMatch[1].toLowerCase();
    const sortedModels = CAR_MODELS_DB.sort((a, b) => b.length - a.length);
    for (const model of sortedModels) {
        if (t.includes(model)) return model;
    }
    return null;
};

const extractMileage = (text) => {
    if (!text) return 150000;
    const kmMatch = text.match(/(\d{2,3})[\s.]?(\d{3})\s*(?:km|kms|kilom[eè]tre)/i) || text.match(/(\d{4,6})\s*(?:km|kms|kilom[eè]tre)/i);
    if (kmMatch) {
        let km = parseInt((kmMatch[1] + (kmMatch[2] || '000')).replace(/\D/g, ''));
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
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { resolve(null); } });
        });
        req.on('timeout', () => { req.destroy(); resolve(null); });
        req.on('error', () => resolve(null));
        req.end(postData);
    });
};

// --- 3. ANALYSES ---

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
        // On relaxe un peu la règle pour éviter les faux positifs si "207" est dans "207 SW"
        if (!detectedReportModel.includes(adModel) && !adModel.includes(detectedReportModel)) {
            isValid = false;
            flags.push({ type: 'fatal', label: "Rapport Incohérent (Modèle)", desc: `Annonce "${adModel}" vs Rapport "${detectedReportModel}".` });
        }
    }
    // ... reste inchangé ...
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
    // On rend le flag moins agressif si le texte ne mentionne pas explicitement l'import
    if (blackHole) { scoreMod += 20; flags.push({ type: 'warning', label: "Historique Incomplet", desc: "Import ou données manquantes." }); }
    return { scoreMod, flags };
};

const analyzeFinancial = (cleanText, headerPrice) => { 
    let f=[], s=0; const a = (cleanText || "").toLowerCase();
    // Suppression des faux positifs "frais de dossier" s'ils disent "pas de frais"
    if(a.includes("frais de dossier") && !hasNegativeContext(a, "frais de dossier")) { s+=20; f.push({type:'warning', label:'Frais Cachés', desc:'Hors frais dossier.'}); }
    
    const textPrices = a.match(/(\d{1,3}(?:[\s.]\d{3})*)\s?€/g);
    if (textPrices && headerPrice) {
        textPrices.forEach(p => {
            const val = parseInt(p.replace(/\D/g, ''));
            if (val > (headerPrice * 5) || (val > 1990 && val < 2030)) return; // Ignorer les années confondues avec prix
            if (val > 1000 && Math.abs(val - headerPrice) > (headerPrice * 0.2)) {
                if (!a.includes("reprise") && !a.includes("crédit")) {
                    s+=50; f.push({type:'danger', label:"Prix Contradictoire", desc:`${headerPrice}€ vs ${val}€.`});
                }
            }
        });
    }
    return {scoreMod:s, flags:f};
};

const analyzeMechanical = (cleanText) => {
    let f=[], s=0; const a = (cleanText || "").toLowerCase();
    if (a.includes("joint de culasse") && !a.includes("fait")) { s+=60; f.push({type:'danger', label:"Panne Moteur", desc:"Joint de culasse à prévoir."}); }
    if (a.includes("moteur hs") || a.includes("en l'état")) { s+=100; f.push({type:'danger', label:"Véhicule Non Roulant", desc:"Vendu pour pièces ou HS."}); }
    return {scoreMod:s, flags:f};
};

// --- FIX MAJEUR ICI : GESTION DES SIRET 14 CHIFFRES ---
const investigateCompany = async (rawSiren) => {
    if (!rawSiren) return null;
    
    // 1. Nettoyage
    let siren = rawSiren.replace(/\D/g, '');
    
    // 2. Si c'est un SIRET (14 chiffres), on extrait le SIREN (9 premiers)
    // Car l'API recherche-entreprises fonctionne mieux au niveau Unité Légale pour vérifier l'existence
    if (siren.length === 14) {
        siren = siren.substring(0, 9);
    }
    
    // 3. Vérification longueur stricte SIREN
    if (siren.length !== 9) return null;

    try {
        const data = await nodeRequest(`https://recherche-entreprises.api.gouv.fr/search?q=${siren}`);
        if (!data.results || data.results.length === 0) return { exists: false };
        
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
            isClosed: c.etat_administratif === 'C', // 'C' = Cessée, 'A' = Active
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

// --- 4. ROUTE PRINCIPALE ---
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

        const estimationIA = await estimerPrixIA(detectedModel, extractedYear, extractedKm);
        if (estimationIA && estimationIA.prix_estime) {
            const prixIA = estimationIA.prix_estime;
            const diff = Math.abs(extractedPrice - prixIA);
            const percentDiff = diff / prixIA;
            if (percentDiff > 0.35) {
                score += 40;
                if (extractedPrice < prixIA) report.push({ type: 'danger', label: "Prix Suspect (IA)", desc: `Estimation: ~${Math.round(prixIA)}€. Écart important.` });
                else report.push({ type: 'warning', label: "Prix Élevé (IA)", desc: `Supérieur à l'estimation (~${Math.round(prixIA)}€).` });
            } else {
                positives.push({label:"Prix Validé (IA)", desc:`Conforme (~${Math.round(prixIA)}€).`});
            }
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

        // C. SIREN
        if (siren) {
            isPro = true;
            // Appel corrigé qui gère maintenant les SIRET longs
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
        console.error("ERREUR FATALE:", error);
        res.status(500).json({ error: "Erreur serveur interne", message: error.message });
    }
});

app.listen(PORT, () => console.log(`✅ Serveur FINAL prêt sur le port ${PORT}`));