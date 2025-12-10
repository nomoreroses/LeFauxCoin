// db.js
const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'patterns.json');

// Données initiales si le fichier n'existe pas
const SEED_DATA = {
    phrases: [
        "Le Prix Négociable dans la limite raisonnable",
        "Véhicule roule tous les jours",
        "Pas sérieux s'abstenir",
        "paiement uniquement par mandat cash",
        "Je suis actuellement à l'étranger",
        "Premier contact par mail uniquement",
        "Toi ouvrant" // Faute d'orthographe fréquente
    ],
    phones: ["0644", "0756", "0757", "0780"] // Préfixes OnOff / Transatel
};

// Charge la DB
const loadDB = () => {
    if (!fs.existsSync(DB_FILE)) {
        fs.writeFileSync(DB_FILE, JSON.stringify(SEED_DATA, null, 2));
        return SEED_DATA;
    }
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
};

const getPatterns = () => loadDB();

module.exports = { getPatterns };