const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const https = require('https');

const app = express();
const PORT = 5000;

// --- 1. CONFIGURATION CORS "PORTES OUVERTES" ---
// On autorise tout le monde (*) pour être sûr que Vercel passe.
// On supprime la ligne 'app.options' qui faisait planter Node 22.
// Le middleware cors() gère tout automatiquement s'il est placé ici.
app.use(cors({
    origin: '*', 
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(bodyParser.json());

// --- 2. PAGE D'ACCUEIL (Pour vérifier que le serveur marche) ---
// Ceci permet d'éviter le "Not Found" quand tu ouvres le lien dans le navigateur
app.get('/', (req, res) => {
    res.send(`
        <h1 style="font-family:sans-serif; color: green;">✅ L'API LeFauxCoin est EN LIGNE !</h1>
        <p style="font-family:sans-serif;">Le serveur fonctionne correctement.</p>
        <p style="font-family:sans-serif;">Pour l'utiliser, fais une requête <strong>POST</strong> sur <code>/api/scan/auto</code> depuis ton site.</p>
    `);
});

// --- 3. KNOWLEDGE BASE ---
const CAR_KNOWLEDGE_DB = [
    { id: "laguna2", keywords: ["laguna"], badYears: [2001, 2002, 2003], msg: "🚨 MODÈLE À FUIR (LAGUNA 2) : Pannes turbo & électronique fréquentes." },
    { id: "scenic2", keywords: ["scenic", "scénic", "megane", "mégane"], badYears: [2003, 2004, 2005], msg: "⚠️ ANNÉE À RISQUE (SCENIC 2) : Compteur digital & injection fragiles avant 2006." },
    { id: "espace4", keywords: ["espace"], badYears: [2002, 2003, 2004, 2005, 2006], engines: ["2.2", "3.0", "dci"], msg: "⛔️ DANGER MOTEUR (ESPACE 4) : Les 2.2 et 3.0 dCi sont très fragiles (bielle)." },
    { id: "307", keywords: ["307"], badYears: [2001, 2002, 2003, 2004, 2005], msg: "⚠️ PEUGEOT 307 (PHASE 1) : Soucis électroniques (COM2000) et volant moteur." },
    { id: "prince", keywords: ["207", "308", "mini", "cooper", "ds3"], badYears: [2007, 2008, 2009, 2010, 2011], engines: ["vti", "thp", "150", "156", "175"], msg: "⛔️ MOTEUR 'PRINCE' (THP/VTi) : Consommation d'huile & chaîne de distribution." },
    { id: "tdi140", keywords: ["golf", "a3", "touran", "leon"], badYears: [2003, 2004, 2005], engines: ["140", "tdi", "2.0"], msg: "⛔️ CULASSE POREUSE (TDI 140) : Consommation de liquide de refroidissement." },
    { id: "c3", keywords: ["c3"], badYears: [2002, 2003], msg: "⚠️ FRAGILITÉ (C3) : Ressorts d'amortisseurs cassants." }
];

const SCAM_SCRIPTS_DB = [
    { pattern: /très propre intérieur et extérieur aucun frais à prévoir aucun bosses ou rayures/i, label: "SCRIPT CONNU (Arnaque)", desc: "Texte utilisé massivement avec la faute 'aucun bosses'." },
    { pattern: /véhicule roule tous les jours parcours toute distance/i, label: "PHRASE GÉNÉRIQUE", desc: "Formule type pour rassurer." },
    { pattern: /curieux s'abstenir/i, label: "VENDEUR AGRESSIF", desc: "Décourage les questions." },
    { pattern: /pas de mail ni de sms/i, label: "CONTACT SUSPECT", desc: "Refus de traces écrites." },
    { pattern: /prix ferme et définitif/i, label: "PRIX SUSPECT", desc: "Vente forcée." },
    { pattern: /donne contre bon soin/i, label: "ARNAQUE AU DON", desc: "Arnaque aux frais de transport." }
];

// --- 4. UTILITIES ---
const nodeRequest = (url) => {
    return new Promise((resolve, reject) => {
        const req = https.get(url, (res) => {
            let data = ''; res.on('data', c => data += c);
            res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(new Error("No JSON")); } });
        });
        req.on('error', e => reject(e)); req.end();
    });
};

const normalizeString = (str) => {
    return str.toLowerCase().replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/@/g, 'a').replace(/[^a-z0-9 ]/g, '');
};

const hasNegativeContext = (text, keyword, windowSize = 30) => {
    const lowerText = text.toLowerCase();
    const index = lowerText.indexOf(keyword.toLowerCase());
    if (index === -1) return false;
    const start = Math.max(0, index - windowSize);
    const contextBefore = lowerText.substring(start, index);
    const negations = ["pas de ", "aucun ", "sans ", "0 ", "ni ", "jamais ", "non "];
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

const extractPreciseModel = (text) => {
    if (!text) return null;
    const structureMatch = text.match(/Modèle[\s\n]+([a-zA-Z0-9éè]+)/i);
    if (structureMatch && structureMatch[1]) return structureMatch[1].toLowerCase();
    const title = text.substring(0, 100).toLowerCase();
    const allKeywords = [...new Set(CAR_KNOWLEDGE_DB.flatMap(k => k.keywords)), "twingo", "clio", "golf", "polo", "c3", "c4", "206", "207", "208", "aygo", "yaris"];
    for (const m of allKeywords) { if (title.includes(m)) return m; }
    return null;
};

// --- 5. ANALYSES ---

const analyzeScripts = (text) => {
    let flags = []; let scoreMod = 0;
    for (const script of SCAM_SCRIPTS_DB) {
        if (script.pattern.test(text)) {
            scoreMod += 45; 
            flags.push({ type: 'danger', label: script.label, desc: script.desc });
        }
    }
    return { scoreMod, flags };
};

const checkConsistency = (adText, reportText, adYear) => {
    if (!reportText || reportText.length < 50) return { valid: true, flags: [] }; 
    let flags = [];
    let isValid = true;
    const adModel = extractPreciseModel(adText);
    const report = reportText.toLowerCase();

    // A. Check MODÈLE
    if (adModel) {
        if (!report.includes(adModel)) {
            const detectedReportModel = report.match(/logo [a-z]+ ([a-z0-9]+)/i)?.[1] || "Autre";
            isValid = false;
            flags.push({ 
                type: 'fatal', 
                label: "Rapport Incohérent (Modèle)", 
                desc: `Annonce pour "${adModel.toUpperCase()}" mais rapport pour "${detectedReportModel.toUpperCase()}". Rapport ignoré.` 
            });
            return { valid: false, flags }; 
        }
    }

    // B. Check ANNÉE (STRICT)
    if (adYear) {
        let reportYear = null;
        
        // Format Standard "Mise en circulation JJ/MM/AAAA"
        const matchDate = report.match(/mise en circulation.*?(\d{2}\/\d{2}\/)(\d{4})/i);
        
        // Format Autoviza En-tête "AAAA, MOIS ... Mise en circulation"
        const matchStrictAutoviza = reportText.match(/(\d{4})[,\s\wéû]+Mise en circulation/i);

        if (matchDate) reportYear = parseInt(matchDate[2]);
        else if (matchStrictAutoviza) reportYear = parseInt(matchStrictAutoviza[1]);

        if (reportYear && Math.abs(reportYear - adYear) > 1) { 
            isValid = false;
            flags.push({ type: 'fatal', label: "Rapport Incohérent (Année)", desc: `Annonce de ${adYear} mais rapport de ${reportYear} (Mise en circulation).` });
        }
    }
    return { valid: isValid, flags };
};

const analyzeReliability = (adText, year) => {
    let flags = []; let scoreMod = 0; const cleanAd = normalizeString(adText);
    if (!year) return { scoreMod, flags };
    const detectedModel = extractPreciseModel(adText);
    if (!detectedModel) return { scoreMod, flags };
    const entry = CAR_KNOWLEDGE_DB.find(e => e.keywords.includes(detectedModel));
    if (entry && entry.badYears.includes(year)) {
        let engineMatch = true;
        if (entry.engines) engineMatch = entry.engines.some(e => cleanAd.includes(e));
        if (engineMatch) { scoreMod += 30; flags.push({ type: 'warning', label: "Modèle à Risque", desc: entry.msg }); }
    }
    return { scoreMod, flags };
};

const analyzeHistory = (adText, autoText) => { 
    let flags = []; let scoreMod = 0; const ad = adText.toLowerCase(); const auto = autoText.toLowerCase();
    const claimsFirst = /(?:1|premi[eè]re)[\s-]*main/i.test(ad);
    const blackHole = auto.includes("période sans information") || auto.includes("importation");
    const ownersMatch = auto.match(/(\d+)\s+propriétaires/i);
    const count = ownersMatch ? parseInt(ownersMatch[1]) : 0;

    if (claimsFirst) {
        if (count > 1) { scoreMod += 60; flags.push({ type: 'danger', label: "Mensonge 1ère Main", desc: `Rapport indique ${count} propriétaires.` }); }
        else if (blackHole) { scoreMod += 55; flags.push({ type: 'danger', label: "Fausse 1ère Main (Import)", desc: "Véhicule importé ou historique manquant." }); }
    }
    if (blackHole) { scoreMod += 20; flags.push({ type: 'warning', label: "Import / Trou Noir", desc: "Historique partiel. Km non garanti." }); }
    return { scoreMod, flags };
};

const analyzeFinancial = (cleanText, headerPrice) => { 
    let f=[], s=0; const a = cleanText.toLowerCase();
    if(a.includes("frais de dossier") && !hasNegativeContext(a, "frais de dossier")) { s+=20; f.push({type:'warning', label:'Frais Cachés', desc:'Prix affiché hors frais.'}); }
    
    const textPrices = a.match(/(\d{1,3}(?:[\s.]\d{3})*)\s?€/g);
    if (textPrices && headerPrice) {
        textPrices.forEach(p => {
            const val = parseInt(p.replace(/\D/g, ''));
            
            // --- FILTRES ANTI-BRUIT (CORRECTION 73400€) ---
            if (val > (headerPrice * 5)) return; // Ignore les prix aberrants (capital social, etc)
            if (val > 1990 && val < 2030) return; // Ignore les années
            
            const context = a.substring(Math.max(0, a.indexOf(p)-30), a.indexOf(p));
            if (/prévoir|facture|réparation|frais|valeur|cote/i.test(context)) return;

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
    let f=[], s=0; const a = cleanText.toLowerCase();
    if (a.includes("berceau")) { s+=40; f.push({type:'warning', label:"Intervention Lourde (Berceau)", desc:"Changement de berceau = Choc antérieur ou corrosion."}); }
    if (a.includes("joint de culasse") && !a.includes("fait")) { s+=60; f.push({type:'danger', label:"Panne Moteur", desc:"Joint de culasse à prévoir."}); }
    return {scoreMod:s, flags:f};
};

const investigateCompany = async (rawSiren) => {
    const siren = rawSiren.replace(/\D/g, ''); if (siren.length !== 9) return null;
    try {
        const data = await nodeRequest(`https://recherche-entreprises.api.gouv.fr/search?q=${siren}`);
        if (!data.results || data.results.length === 0) return { exists: false };
        const c = data.results[0]; const s = c.siege; const now = new Date();
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
            
            // Seulement si l'adresse est récente, on montre l'historique
            if (ageA < 24) {
                 hist = e.map(x => { if(new Date(x.date_creation)>y1) moves++; return `${x.etat_administratif==='A'?'✅':'❌'} : ${x.libelle_commune||'Inc.'} (${new Date(x.date_creation).toLocaleDateString('fr-FR')})`; });
            }
        }
        return { exists: true, name: c.nom_complet, isClosed: c.etat_administratif === 'C', naf: c.activite_principale, nafLabel: c.activite_principale_libelle, address: `${s.numero_voie||''} ${s.type_voie||''} ${s.libelle_voie}, ${s.code_postal} ${s.libelle_commune}`, ageBoiteMois: ageB, ageAdresseMois: ageA, managerInfo: mInfo, managerAge: mAge, recentMoves: moves, history: hist, isGarage: c.activite_principale.startsWith('45') };
    } catch { return "ERROR_NETWORK"; }
};

// --- ROUTE PRINCIPALE API ---
app.post('/api/scan/auto', async (req, res) => {
    const { description, autoviza, siren, extractedPrice, extractedYear, accountYear } = req.body;
    const cleanDescription = extractMainDescription(description);

    let score = 0;
    let report = [];
    let positives = [];
    let mapsLink = null;
    let companyHistory = [];
    let isPro = false;
    let accountAgeRisk = false;

    // A. COHÉRENCE
    const consistency = checkConsistency(description, autoviza, extractedYear);
    const validAutoviza = consistency.valid ? autoviza : ""; 
    
    if (!consistency.valid) {
        report = [...report, ...consistency.flags];
        score += 60; 
    } else if (autoviza.length > 50) {
        positives.push({ label: "Rapport Analysé", desc: "Cohérent." });
    }

    // B. ANALYSES AVANCÉES
    const scriptAnalysis = analyzeScripts(cleanDescription);
    score += scriptAnalysis.scoreMod;
    report = [...report, ...scriptAnalysis.flags];

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
        const info = await investigateCompany(siren);
        if (info && info !== "ERROR_NETWORK") {
             if (info.exists === false) { score += 100; report.push({ type: 'danger', label: "FAUX SIREN", desc: "Inconnu." }); }
             else {
                 mapsLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(info.address)}`;
                 companyHistory = info.history;
                 if (info.isClosed) { score += 100; report.push({ type: 'danger', label: "FERMÉE", desc: "Radiée." }); }
                 else if (info.recentMoves >= 2) { score += 65; report.push({ type: 'danger', label: "INSTABILITÉ CRITIQUE", desc: `${info.recentMoves} déménagements en 1 an.` }); }
                 else if (info.ageAdresseMois < 6 && info.ageBoiteMois > 24) { score += 30; report.push({ type: 'warning', label: "Adresse Récente", desc: "Déménagement récent." }); }
                 else if (info.ageAdresseMois > 24) { score -= 15; positives.push({ label: "Adresse Stable", desc: `Depuis ${Math.floor(info.ageAdresseMois/12)} ans.` }); }
                 
                 if (!info.isGarage) { score += 45; report.push({ type: 'warning', label: "Activité Douteuse", desc: "Pas un garage." }); }
                 else { score -= 10; positives.push({ label: "Activité Vérifiée", desc: "Commerce Auto." }); }
                 if (info.managerInfo) positives.push({ label: "Dirigeant", desc: info.managerInfo });
             }
        }
    } else { positives.push({ label: "Vendeur", desc: "Particulier" }); }

    // D. COMPTE & PRIX
    if (accountYear) {
        const age = new Date().getFullYear() - accountYear;
        if (age < 1) { score += 25; accountAgeRisk = true; report.push({ type: 'warning', label: "Compte Récent", desc: "Créé cette année." }); }
        else if (age > 4) { score -= 10; positives.push({ label: "Compte Ancien", desc: `Membre ${age} ans.` }); }
    }
    
    const text = cleanDescription.toLowerCase();
    if (text.includes("mandat cash") || text.includes("coupons pcs")) { score += 100; report.push({ type: 'danger', label: "Arnaque Paiement", desc: "Méthode illégale." }); }

    if (extractedPrice && extractedYear) {
        let minPrice = extractedYear >= 2015 ? 5000 : 2000;
        if (extractedPrice < minPrice * 0.7) { score += 45; report.push({ type: 'warning', label: "Prix Suspect", desc: "Très bas." }); }
        else { score -= 10; positives.push({ label: "Prix Cohérent", desc: "Moyenne OK." }); }
    }

    score = Math.min(Math.max(score, 0), 100);
    const verdict = score >= 80 ? "DANGER" : score > 40 ? "SUSPECT" : "FIABLE";

    res.json({ score, verdict, details: report, positives, mapsLink, history: companyHistory, isPro, accountAgeRisk });
});

app.listen(PORT, () => console.log(`✅ Serveur FINAL prêt sur le port ${PORT}`));