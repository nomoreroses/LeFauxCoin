This looks like the final polish is needed. Your app is catching legitimate issues (like the 206 price formatting bug) but is also being a bit over-enthusiastic with others (like the 73,400€ zip code being read as a price).

Here is the fix strategy:

1.  **Frontend (White Screen/Error):** The `Uncaught ReferenceError: Database is not defined` error is because the `Database` icon wasn't imported. I'll add that.
2.  **Backend (Price Hallucinations):** I'll add a stricter "sanity check" for prices found in the text. If a price is found in the text that is \> 500% of the main price, we'll ignore it (assuming it's a zip code or capital stock).
3.  **Backend (Year Hallucinations):** I'll tighten the regex to *only* accept years found in the specific Autoviza header format or strictly next to "Mise en circulation".

Here are the two final, corrected files.

### 1\. BACKEND : `server.js` (Strict Mode)

```javascript
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const https = require('https');

const app = express();
const PORT = 5000;

app.use(cors());
app.use(bodyParser.json());

// --- 1. KNOWLEDGE BASE ---
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

// --- 2. UTILITIES ---
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

// --- 3. ANALYSES ---

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

// --- ROUTE PRINCIPALE ---
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

app.listen(PORT, () => console.log(`✅ Serveur FINAL prêt`));
```

### 2\. FRONTEND (`frontend/src/LeFauxCoin.jsx`)

```jsx
import React, { useState } from 'react';
import { 
  Shield, AlertOctagon, CheckCircle, ArrowRight, ArrowLeft, X, 
  MapPin, FileWarning, ExternalLink, Sparkles, Loader2, Zap, 
  User, Building2, Calendar, Euro, History, FileText, BadgeAlert, Database, Split, AlertTriangle
} from 'lucide-react';

const API_URL = "http://localhost:5000"; 

const ScamScanner = () => {
  const [view, setView] = useState('home'); 
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  
  const [detectedFields, setDetectedFields] = useState({ siren: false, price: false, year: false, member: false });
  const [scanData, setScanData] = useState({ description: '', autoviza: '', siren: '', extractedPrice: null, extractedYear: null, accountYear: null });

  // --- LOGIQUE IDENTIQUE ---
  const handleDescriptionChange = (e) => {
    const text = e.target.value;
    let newData = { ...scanData, description: text };
    let newDetected = { ...detectedFields };

    const sirenMatch = text.match(/(?:SIREN|siren|SIRET|siret)(?:[\s\D]*)([\d\s]{9,15})/i);
    if (sirenMatch && sirenMatch[1]) {
        const cleanSiren = sirenMatch[1].replace(/\s/g, '').substring(0, 9);
        if (cleanSiren.length === 9) { newData.siren = cleanSiren; newDetected.siren = true; }
    }
    // Regex Prix améliorée pour éviter les faux positifs (pas de modèle collé)
    const priceMatch = text.match(/(?:\n|^)\s*(\d[\d\s]{1,9}?)\s?€/);
    if (priceMatch && priceMatch[1]) {
        const cleanPrice = parseInt(priceMatch[1].replace(/[\s.]/g, '').replace(',', '.'));
        if (!isNaN(cleanPrice) && cleanPrice > 100 && cleanPrice < 200000) { newData.extractedPrice = cleanPrice; newDetected.price = true; }
    }
    const yearMatch = text.match(/(?:Année|modele|de)?\s?\b(20[0-2][0-9])\b/i);
    if (yearMatch && yearMatch[1]) { newData.extractedYear = parseInt(yearMatch[1]); newDetected.year = true; }

    const memberMatch = text.match(/Membre depuis\s+(?:janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)?\s?(\d{4})/i);
    if (memberMatch && memberMatch[1]) {
        newData.accountYear = parseInt(memberMatch[1]);
        newDetected.member = true;
    }

    setScanData(newData);
    setDetectedFields(newDetected);
  };

  const launchScan = async () => {
    if (!scanData.description && !scanData.siren && !scanData.autoviza) return alert("Collez au moins l'annonce.");
    setLoading(true); setResult(null);

    try {
      const response = await fetch(`${API_URL}/api/scan/auto`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(scanData)
      });
      if (!response.ok) throw new Error("Erreur serveur.");
      const data = await response.json();
      
      const trustScore = 100 - data.score;
      setResult({ ...data, trustScore });
      
      setLoading(false); setView('result');
    } catch (error) {
      alert("Erreur : " + error.message); setLoading(false);
    }
  };

  const reset = () => { 
      setView('home'); setResult(null); 
      setDetectedFields({ siren: false, price: false, year: false, member: false });
      setScanData({ description: '', autoviza: '', siren: '', extractedPrice: null, extractedYear: null, accountYear: null });
  };

  const getVerdict = (score) => {
      if (score < 40) return { label: "DANGER IMMÉDIAT", sub: "Ne contactez pas ce vendeur.", color: "bg-red-600", textColor: "text-red-600", icon: <BadgeAlert className="w-12 h-12 text-white/90"/> };
      if (score < 70) return { label: "RISQUE ÉLEVÉ", sub: "Prudence extrême requise.", color: "bg-orange-500", textColor: "text-orange-600", icon: <FileWarning className="w-12 h-12 text-white/90"/> };
      return { label: "CONFIANCE", sub: "Annonce saine.", color: "bg-emerald-500", textColor: "text-emerald-500", icon: <CheckCircle className="w-12 h-12 text-white/90"/> };
  };

  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 text-slate-900 font-sans">
      <Loader2 className="w-16 h-16 text-indigo-600 animate-spin mb-6" />
      <h2 className="text-2xl font-bold text-slate-800">Expertise en cours...</h2>
      <p className="text-slate-500 mt-2 font-medium">Analyse croisée des données</p>
    </div>
  );

  if (view === 'result' && result) {
    const verdict = getVerdict(result.trustScore);
    const uniqueDetails = result.details.filter((v,i,a)=>a.findIndex(t=>(t.label===v.label))===i);
    const fatalError = uniqueDetails.find(d => d.type === 'fatal');

    return (
    <div className="min-h-screen bg-slate-100 flex justify-center p-6 font-sans text-slate-900 overflow-y-auto">
      <div className="w-full max-w-5xl bg-white rounded-[2rem] shadow-2xl overflow-hidden flex flex-col lg:flex-row h-fit my-auto border border-white/60">
        
        {/* COLONNE GAUCHE : SCOREBOARD */}
        <div className={`lg:w-1/3 p-10 flex flex-col justify-between ${verdict.color} relative overflow-hidden`}>
            <div className="relative z-10 text-center lg:text-left">
                <div className="inline-flex p-3 bg-white/20 rounded-2xl backdrop-blur-md mb-6 shadow-inner ring-1 ring-white/30">
                    {verdict.icon}
                </div>
                <h1 className="text-4xl font-black tracking-tight leading-none mb-2 text-white">{verdict.label}</h1>
                <p className="text-white/90 text-lg font-medium leading-snug">{verdict.sub}</p>
                <div className="mt-10 bg-white/20 rounded-2xl p-5 backdrop-blur-md border border-white/10 shadow-lg text-white">
                    <span className="block text-xs font-bold uppercase tracking-widest opacity-80 mb-1">Score de Confiance</span>
                    <span className="text-6xl font-black">{result.trustScore}<span className="text-3xl opacity-60">/100</span></span>
                </div>
            </div>
            <button onClick={reset} className={`mt-12 w-full bg-white ${verdict.textColor} font-bold py-4 rounded-xl shadow-xl hover:shadow-2xl hover:scale-[1.02] transition-all flex items-center justify-center gap-2`}>
                <ArrowLeft className="w-5 h-5" /> Nouvelle recherche
            </button>
        </div>

        {/* COLONNE DROITE : DÉTAILS */}
        <div className="lg:w-2/3 p-10 space-y-10 overflow-y-auto">

            {/* FATAL ERROR (Si présente) */}
            {fatalError && (
                <div className="bg-red-50 rounded-[2rem] p-8 border-2 border-red-100 shadow-inner">
                    <div className="flex items-center gap-3 mb-6 text-red-600">
                        <Split className="w-8 h-8"/>
                        <h2 className="text-xl font-black uppercase tracking-wide">Incohérence Critique</h2>
                    </div>
                    <div className="flex flex-col sm:flex-row items-center gap-6">
                        <div className="flex-1 w-full bg-white p-4 rounded-xl border border-red-100 text-center shadow-sm">
                            <p className="text-xs font-bold text-slate-400 uppercase mb-1">Annonce</p>
                            <p className="text-xl font-black text-slate-800 uppercase">{scanData.description.match(/Modèle[\s\n]+([a-zA-Z0-9éè]+)/i)?.[1] || "Modèle A"}</p>
                            <p className="text-sm font-medium text-slate-500">{scanData.extractedYear}</p>
                        </div>
                        <div className="p-2 bg-red-100 rounded-full text-red-500 font-bold"><X className="w-6 h-6"/></div>
                        <div className="flex-1 w-full bg-white p-4 rounded-xl border-2 border-red-500 text-center shadow-md relative">
                            <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">INCOHÉRENT</div>
                            <p className="text-xs font-bold text-slate-400 uppercase mb-1">Rapport</p>
                            <p className="text-xl font-black text-slate-800 uppercase">{scanData.autoviza.match(/logo [a-z]+ ([a-z0-9]+)/i)?.[1] || "Modèle B"}</p>
                            <p className="text-sm font-medium text-slate-500">Non conforme</p>
                        </div>
                    </div>
                    <p className="mt-6 text-sm text-red-700 font-medium text-center">{fatalError.desc}</p>
                </div>
            )}

            {/* AUTRES DANGERS */}
            {!fatalError && uniqueDetails.length > 0 && (
                <section>
                    <h3 className="text-xs font-extrabold text-red-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4"/> Points de Vigilance
                    </h3>
                    <div className="space-y-3">
                        {uniqueDetails.map((item, i) => (
                            <div key={i} className="flex gap-4 p-4 rounded-2xl bg-orange-50 border border-orange-100 items-start hover:shadow-md transition">
                                <div className="mt-1 p-1 bg-orange-100 rounded-full text-orange-600"><AlertTriangle className="w-4 h-4"/></div>
                                <div>
                                    <h4 className="font-bold text-slate-800 text-sm">{item.label}</h4>
                                    <p className="text-sm text-slate-600 mt-1 leading-relaxed">{item.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* IDENTITÉ */}
            <section>
                <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2"><User className="w-4 h-4"/> Identité du Vendeur</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 flex flex-col gap-1">
                        <span className="text-xs font-bold text-slate-400 uppercase">Statut</span>
                        <span className={`font-bold ${result.isPro ? 'text-indigo-600' : 'text-slate-600'}`}>{result.isPro ? "Professionnel" : "Particulier"}</span>
                    </div>
                    {result.isPro ? (
                        <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 md:col-span-2">
                            <div className="flex justify-between items-start mb-2"><span className="text-xs font-bold text-slate-400 uppercase">Société</span>{result.mapsLink && <a href={result.mapsLink} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-blue-600 hover:underline">Voir sur Maps ↗</a>}</div>
                            <div className="font-bold text-gray-800 text-lg mb-1">{result.positives.find(p => p.label === "Dirigeant")?.desc || "Nom non public"}</div>
                        </div>
                    ) : (
                        <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 flex flex-col gap-1">
                            <span className="text-xs font-bold text-slate-400 uppercase">Compte</span>
                            <span className="font-bold text-slate-800 text-sm">{scanData.accountYear ? `Membre depuis ${scanData.accountYear}` : "Date inconnue"}</span>
                        </div>
                    )}
                </div>
            </section>

            {/* HISTORIQUE */}
            {result.history && result.history.length > 0 && (
                <section>
                    <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2"><History className="w-4 h-4"/> Historique</h3>
                    <div className="ml-2 pl-6 border-l-2 border-slate-200 space-y-6">
                        {result.history.slice(0, 3).map((line, i) => (
                            <div key={i} className="relative group">
                                <div className={`absolute -left-[31px] top-1 w-4 h-4 rounded-full border-2 border-white shadow-md transition-transform group-hover:scale-110 ${line.includes('Ouvert') || line.includes('Actuel') ? 'bg-emerald-500' : 'bg-slate-300'}`}></div>
                                <p className="text-sm font-medium text-slate-700 bg-slate-50 inline-block px-3 py-1 rounded-lg">{line}</p>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* POSITIFS */}
            {result.positives.length > 0 && (
                <section className="pt-6 border-t border-slate-100">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {result.positives.filter(p => !p.label.includes("Dirigeant")).map((item, i) => (
                            <div key={i} className="flex items-center gap-3 text-sm text-emerald-800 bg-emerald-50 border border-emerald-100 p-3 rounded-xl">
                                <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0"/>
                                <span className="font-medium">{item.label}</span>
                            </div>
                        ))}
                    </div>
                </section>
            )}

        </div>
      </div>
    </div>
    );
  }

  // --- HOME ---
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex items-center justify-center p-4">
        <div className="w-full max-w-3xl">
            <div className="text-center mb-12">
                <div className="inline-flex p-5 bg-black rounded-3xl text-white shadow-2xl mb-6 transform -rotate-3 hover:rotate-0 transition duration-300"><Shield className="w-12 h-12"/></div>
                <h1 className="text-6xl font-black text-slate-900 tracking-tighter mb-4">LeFauxCoin</h1>
                <p className="text-xl text-slate-500 font-medium max-w-lg mx-auto">L'intelligence artificielle qui détecte les arnaques automobiles avant vous.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white rounded-[2rem] shadow-xl p-8 border border-white/50 hover:shadow-2xl transition-shadow duration-300">
                    <div className="flex items-center gap-3 mb-4 text-indigo-600"><div className="p-2 bg-indigo-50 rounded-xl"><FileWarning className="w-6 h-6"/></div><h2 className="font-bold text-lg">1. L'Annonce</h2></div>
                    <div className="relative"><textarea className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-slate-100 focus:border-indigo-500 focus:bg-white outline-none text-slate-700 text-sm h-48 resize-none transition-all font-medium" placeholder="Collez l'annonce..." value={scanData.description} onChange={handleDescriptionChange}></textarea><div className="absolute bottom-3 right-3 flex gap-2 pointer-events-none">{detectedFields.siren && <span className="bg-emerald-500 text-white px-2 py-1 rounded-lg text-[10px] font-bold shadow animate-in zoom-in">SIREN OK</span>}{detectedFields.price && <span className="bg-emerald-500 text-white px-2 py-1 rounded-lg text-[10px] font-bold shadow animate-in zoom-in">PRIX OK</span>}</div></div>
                </div>
                <div className="flex flex-col gap-6">
                    <div className="bg-white rounded-[2rem] shadow-xl p-8 border border-white/50 flex-1 transition-all duration-300">
                        <div className="flex items-center gap-3 mb-4 text-slate-400"><div className="p-2 bg-slate-50 rounded-xl"><FileText className="w-6 h-6"/></div><h2 className="font-bold text-lg">2. Rapport (Optionnel)</h2></div>
                        <textarea className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-slate-100 focus:border-slate-400 focus:bg-white outline-none text-slate-700 text-sm h-32 resize-none transition-all font-medium placeholder:text-slate-400" placeholder="Collez le rapport Autoviza..." value={scanData.autoviza} onChange={(e) => setScanData({...scanData, autoviza: e.target.value})}></textarea>
                    </div>
                    <button onClick={launchScan} className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xl font-bold py-6 rounded-[2rem] shadow-xl shadow-indigo-200 hover:shadow-2xl transition-all transform active:scale-[0.98] flex items-center justify-center gap-3 group">Lancer l'Audit <ArrowRight className="w-6 h-6 group-hover:translate-x-1 transition-transform"/></button>
                </div>
            </div>
        </div>
    </div>
  );
};

export default ScamScanner;
```