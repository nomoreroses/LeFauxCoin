// Fichier: server.js
// VERSION : COMPATIBILITÉ RENDER HOSTPORT + CROSS-CHECK + NAF

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const argus = require('./argusEngine'); 

// --- CONFIGURATION ---
// Fonction pour formater l'URL Python correctement
// Render envoie parfois juste "host:port" via la propriété hostport
const getPythonUrl = () => {
    let url = process.env.PYTHON_API_URL || "http://127.0.0.1:8000";
    // Si l'URL ne commence pas par http, on l'ajoute (cas Render hostport)
    if (!url.startsWith('http')) {
        url = `http://${url}`;
    }
    return url;
};

const CONFIG = {
    PORT: process.env.PORT || 5000,
    PYTHON_API_URL: getPythonUrl(),
    PYTHON_ENDPOINT: "/predict", 
    UPLOAD_DIR: path.join(__dirname, 'uploads'),
    TIMEOUTS: { IA: 3000, GOUV: 3000 }
};

// --- RÉFÉRENTIEL NAF AUTOMOBILE (Division 45) ---
const AUTO_NAF_CODES = {
    "45.11Z": "Commerce de voitures et de véhicules automobiles légers",
    "45.19Z": "Commerce d'autres véhicules automobiles",
    "45.20A": "Entretien et réparation de véhicules automobiles légers",
    "45.20B": "Entretien et réparation d'autres véhicules automobiles",
    "45.31Z": "Commerce de gros d'équipements automobiles",
    "45.32Z": "Commerce de détail d'équipements automobiles",
    "45.40Z": "Commerce et réparation de motocycles"
};

// --- LISTE MARQUES PRINCIPALES (Pour Cross-Check) ---
const CAR_BRANDS = [
    "MERCEDES-BENZ", "ALFA ROMEO", "LAND ROVER", "VOLKSWAGEN", "CHEVROLET", "MITSUBISHI", 
    "CITROEN", "PEUGEOT", "RENAULT", "PORSCHE", "HYUNDAI", "TOYOTA", "SUZUKI", "NISSAN", 
    "JAGUAR", "SUBARU", "ABARTH", "LANCIA", "LEXUS", "TESLA", "SMART", "SKODA", "MAZDA", 
    "HONDA", "VOLVO", "DACIA", "DODGE", "JEEP", "MINI", "SEAT", "AUDI", "FORD", "OPEL", 
    "FIAT", "BMW", "KIA", "DS"
];

const app = express();
app.use(cors());
// Augmentation de la limite pour supporter les gros copier-coller
app.use(express.json({ limit: '10mb' })); 
app.use('/uploads', express.static(CONFIG.UPLOAD_DIR));

// --- CONFIG UPLOAD ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(CONFIG.UPLOAD_DIR)) fs.mkdirSync(CONFIG.UPLOAD_DIR, { recursive: true });
    cb(null, CONFIG.UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const safeName = path.basename(file.originalname).replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, Date.now() + '-' + safeName);
  },
});
const upload = multer({ storage });

let listings = [];

// Chargement moteur Argus
argus.loadData().catch(err => console.error("🔥 Echec chargement Argus.", err));


// --- FONCTIONS UTILITAIRES (SCANNER) ---

const cleanAutovizaText = (rawText) => {
    if (!rawText) return "";
    let text = rawText;
    text = text.replace(/Afin d’éviter toute modification.*?sur un lien sécurisé\./gs, "");
    const endMarker = text.indexOf("A propos des données du rapport");
    if (endMarker !== -1) text = text.substring(0, endMarker);
    return text.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').toLowerCase().trim();
};

const analyzeStaticRules = (data) => {
    let score = 0;
    let details = [];
    const descLower = (data.description || "").toLowerCase();

    const RISK_PATTERNS = [
        { words: ["western union", "mandat cash", "coupon pcs"], score: 30, label: "Paiement Anonyme", type: "danger" },
        { words: ["à l'étranger", "transporteur", "livreur"], score: 20, label: "Indisponibilité Vendeur", type: "warning" },
        { words: ["don", "malentendant"], score: 20, label: "Ingénierie Sociale", type: "warning" },
        { words: ["whatsapp", "mail", "gmail"], score: 15, label: "Sortie de Plateforme", type: "warning" }
    ];

    RISK_PATTERNS.forEach(pattern => {
        const foundWord = pattern.words.find(w => new RegExp(`\\b${w}\\b`, 'i').test(descLower));
        if (foundWord) {
            score += pattern.score;
            details.push({ label: pattern.label, desc: `Terme suspect: "${foundWord}"`, type: pattern.type });
        }
    });

    const price = parseInt(data.extractedPrice);
    const year = parseInt(data.extractedYear);

    if (price && price < 1000) {
        score += 25;
        details.push({ label: "Prix Suspect", desc: "Véhicule < 1000€.", type: "danger" });
    }
    if (year && price && year > 2018 && price < 5000) {
        score += 50;
        details.push({ label: "Aberration", desc: `Année ${year} à ${price}€ impossible.`, type: "danger" });
    }
    if (data.accountYear === new Date().getFullYear()) {
        score += 10;
        details.push({ label: "Compte Récent", desc: "Profil créé cette année.", type: "warning" });
    }

    return { score, details };
};

const analyzeHistoryText = (rawText, description) => {
    if (!rawText || rawText.length < 20) return { score: 0, details: [] };
    
    let score = 0;
    let details = [];
    const cleanText = cleanAutovizaText(rawText);
    const cleanDesc = (description || "").toLowerCase();

    // 1. CROSS-CHECK VÉHICULE (Marque)
    let brandInReport = null;
    
    for (const brand of CAR_BRANDS) {
        const regex = new RegExp(`\\b${brand}\\b`, 'i');
        if (regex.test(cleanText)) {
            brandInReport = brand;
            break; 
        }
    }

    if (brandInReport) {
        const regexDesc = new RegExp(`\\b${brandInReport}\\b`, 'i');
        const normalizedDesc = cleanDesc.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const normalizedBrand = brandInReport.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const regexNorm = new RegExp(`\\b${normalizedBrand}\\b`, 'i');

        if (!regexDesc.test(cleanDesc) && !regexNorm.test(normalizedDesc)) {
            score += 100;
            details.unshift({
                label: "Incohérence Véhicule",
                desc: `Le rapport concerne une ${brandInReport}, mais cette marque semble absente de votre annonce. Le rapport ne correspond pas au véhicule vendu !`,
                type: "danger"
            });
        }
    }

    // 2. Détection Usage PRO
    const checkUsageStatus = (keyword, label) => {
        const index = cleanText.indexOf(keyword);
        if (index !== -1) {
            const context = cleanText.substring(index, index + 120); 
            if (!context.includes("pas d'usage") && !context.includes("aucun usage") && !context.includes("néant")) {
                score += 25;
                details.push({ label: `Ex-${label}`, desc: "Usage professionnel détecté.", type: "warning" });
            }
        }
    };

    checkUsageStatus("auto-école", "Auto-école");
    checkUsageStatus("taxi/vtc", "Taxi/VTC");
    checkUsageStatus("location courte-durée", "Location");

    // 3. Importation
    if (cleanText.includes("importation") && !cleanText.includes("pas d'importation")) {
        score += 30;
        details.push({ label: "Véhicule Importé", desc: "Origine étrangère confirmée.", type: "warning" });
    }

    // 4. Trou d'historique (Priorité)
    const gapRegex = /période sans informations.*?(\d+)\s*ans/i;
    const gapMatch = cleanText.match(gapRegex);
    
    if ((gapMatch && parseInt(gapMatch[1]) >= 2) || (cleanText.includes("15 ans") && cleanText.includes("sans information"))) {
        const years = gapMatch ? parseInt(gapMatch[1]) : 15;
        score += 50;
        details.unshift({
            label: "Trou d'Historique Critique",
            desc: `⚠️ ${years} ans sans suivi ! Manipulation très probable.`,
            type: "danger"
        });
    }

    // 5. Accident / VGE
    if ((cleanText.includes("procédure vge") || cleanText.includes("gravement endommagé")) && !cleanText.includes("néant")) {
        score += 100;
        details.unshift({ label: "ÉPAVE (VGE)", desc: "Véhicule déclaré épave.", type: "danger" });
    }

    return { score, details };
};

const fetchAiPrediction = async (payload) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.TIMEOUTS.IA);
    try {
        console.log(`🤖 Appel IA vers: ${CONFIG.PYTHON_API_URL}${CONFIG.PYTHON_ENDPOINT}`);
        const response = await fetch(`${CONFIG.PYTHON_API_URL}${CONFIG.PYTHON_ENDPOINT}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (!response.ok) return null;
        return await response.json();
    } catch (e) { 
        console.error("Erreur Fetch IA:", e.message);
        return null; 
    }
};

const fetchCompanyData = async (siren) => {
    if (!siren || !/^\d{9}$/.test(siren)) return null;
    try {
        const res = await fetch(`https://recherche-entreprises.api.gouv.fr/search?q=${siren}`);
        if (res.ok) {
            const data = await res.json();
            if (data.results && data.results.length > 0) {
                return data.results[0];
            }
        }
    } catch (e) { console.error("Erreur API Gouv", e); }
    return null;
};


// --- ROUTES API ---

app.get('/api/listings', (req, res) => {
  res.json(listings);
});

app.post('/api/listings', upload.single('image'), (req, res) => {
  const { title, price } = req.body;
  const image = req.file ? `/uploads/${req.file.filename}` : null;
  const newListing = { id: Date.now(), title, price, image, date: new Date() };
  listings.push(newListing);
  res.status(201).json(newListing);
});

app.post('/api/argus/filters', (req, res) => {
    try {
        const dataset = argus.getOptions(req.body);
        res.json({
            Marques: !req.body.Marque ? argus.getUniqueValues(dataset, 'Marque') : [],
            Modeles: argus.getUniqueValues(dataset, 'Modele'),
            Annees: argus.getUniqueValues(dataset, 'Annee'),
            Energies: argus.getUniqueValues(dataset, 'Energie'),
            Boites: argus.getUniqueValues(dataset, 'Boite'),
            Puissances: argus.getUniqueValues(dataset, 'Puissance'),
            Finitions: argus.getUniqueValues(dataset, 'Finition')
        });
    } catch (error) { res.status(500).json({ error: "Erreur serveur Argus" }); }
});

app.post('/api/argus/estimate', (req, res) => {
    try {
        const { criteria, km } = req.body;
        if (!criteria || !km) return res.status(400).json({ error: "Critères ou KM manquants" });
        const result = argus.calculatePrice(criteria, parseInt(km));
        if (result) res.json(result);
        else res.status(404).json({ error: "Cote introuvable" });
    } catch (error) { res.status(500).json({ error: "Erreur calcul Argus" }); }
});

// ROUTE SCANNER INTELLIGENT
app.post('/api/scan/auto', async (req, res) => {
    try {
        const { description, autoviza, extractedPrice, siren } = req.body;
        if (!description) return res.status(400).json({ error: "Description requise" });

        const [staticResult, historyResult, aiResult, companyResult] = await Promise.all([
            Promise.resolve(analyzeStaticRules(req.body)),
            Promise.resolve(analyzeHistoryText(autoviza, description)),
            fetchAiPrediction(req.body),
            fetchCompanyData(siren)
        ]);

        let finalScore = staticResult.score + historyResult.score;
        let finalDetails = [...historyResult.details, ...staticResult.details];
        let companyInfo = { exists: false };
        let argusResult = { cote_officielle: null, message: "IA non disponible" };

        if (companyResult) {
            const ageMois = Math.floor((Date.now() - new Date(companyResult.date_creation).getTime()) / (1000 * 60 * 60 * 24 * 30));
            
            // Fix NAF
            let nafCode = companyResult.activite_principale;
            let rawLabel = companyResult.libelle_activite_principale;

            if (!nafCode && companyResult.unite_legale) {
                nafCode = companyResult.unite_legale.activite_principale;
                rawLabel = companyResult.unite_legale.libelle_activite_principale;
            }

            // Classification Métier
            let displayLabel = "Activité non précisée";
            let isAutoActivity = false;

            if (nafCode) {
                const formattedNaf = nafCode.replace(/\./g, ''); 
                
                if (AUTO_NAF_CODES[nafCode] || Object.keys(AUTO_NAF_CODES).some(k => k.replace(/\./g,'') === formattedNaf)) {
                    const officialLabel = AUTO_NAF_CODES[nafCode] || rawLabel;
                    displayLabel = `✅ Activité Auto Validée : ${officialLabel} (${nafCode})`;
                    isAutoActivity = true;
                } else if (nafCode.startsWith('45')) {
                    displayLabel = `✅ Activité Auto : ${rawLabel || "Commerce"} (${nafCode})`;
                    isAutoActivity = true;
                } else {
                    displayLabel = `⚠️ Activité Hors Auto : ${rawLabel || "Inconnue"} (${nafCode})`;
                    finalScore += 10;
                    finalDetails.push({
                        label: "Activité Atypique",
                        desc: `SIREN valide mais activité (${nafCode}) non liée à l'automobile.`,
                        type: "warning"
                    });
                }
            } else {
                displayLabel = "⚠️ Code Activité (NAF) Introuvable";
            }

            companyInfo = {
                exists: true,
                name: companyResult.nom_complet,
                address: companyResult.siege.adresse,
                ageBoiteMois: ageMois,
                naf: nafCode || "?",
                nafLabel: displayLabel
            };
            
            if (isAutoActivity) {
                finalScore -= 20;
                finalDetails.push({ label: "Pro Vérifié", desc: `${companyResult.nom_complet} (Secteur Auto)`, type: "success" });
            } else {
                finalScore -= 5;
            }
        }

        if (aiResult && aiResult.prediction) {
            argusResult = { cote_officielle: aiResult.prediction, message: `IA active` };
            if (extractedPrice && (extractedPrice / aiResult.prediction < 0.7)) {
                finalScore += 35;
                finalDetails.push({ label: "Prix Trop Bas", desc: "Écart suspect avec estimation IA.", type: "danger" });
            }
        } else if (extractedPrice) {
            argusResult.cote_officielle = Math.round(extractedPrice * 1.15);
        }

        finalScore = Math.max(0, Math.min(100, finalScore));

        // UX Verdict
        let ux_verdict;
        if (finalScore <= 10) ux_verdict = { letter: 'A', color: 'emerald', label: 'EXCELLENT' };
        else if (finalScore <= 30) ux_verdict = { letter: 'B', color: 'lime', label: 'BON' };
        else if (finalScore <= 50) ux_verdict = { letter: 'C', color: 'yellow', label: 'MOYEN' };
        else if (finalScore <= 75) ux_verdict = { letter: 'D', color: 'orange', label: 'PRUDENCE' };
        else ux_verdict = { letter: 'E', color: 'red', label: 'CRITIQUE' };

        const historyDisplay = historyResult.details.length > 0
            ? historyResult.details.map(d => `${d.type === 'danger' ? '⛔' : '⚠️'} ${d.desc}`)
            : (autoviza ? ["✅ Historique analysé : RAS"] : []);

        res.json({
            score: finalScore,
            ux_verdict: ux_verdict,
            details: finalDetails,
            isPro: companyInfo.exists,
            company: companyInfo,
            argus: argusResult,
            history: historyDisplay,
            mapsLink: companyInfo.address ? `http://googleusercontent.com/maps.google.com/?q=${encodeURIComponent(companyInfo.address)}` : null
        });

    } catch (error) {
        console.error("🔥 Error:", error);
        res.status(500).json({ error: "Erreur serveur" });
    }
});

// --- SERVING REACT FRONTEND (PRODUCTION) ---
// Ces lignes servent le build React quand on n'est pas sur une route API
app.use(express.static(path.join(__dirname, '../client/dist')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

app.listen(CONFIG.PORT, () => console.log(`🚀 Server running on ${CONFIG.PORT}`));