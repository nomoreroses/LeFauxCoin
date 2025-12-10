const mongoose = require('mongoose');

// Schéma pour les phrases/patterns d'arnaque connus
const PatternSchema = new mongoose.Schema({
  text: { type: String, required: true, unique: true },
  type: { type: String, enum: ['phrase', 'phone'], default: 'phrase' },
  riskLevel: { type: Number, default: 100 } // 100 = Arnaque sure
});

const Pattern = mongoose.model('Pattern', PatternSchema);

// Fonction pour initialiser la DB avec vos données si elle est vide
const seedDatabase = async () => {
  const count = await Pattern.countDocuments();
  if (count === 0) {
    const seeds = [
      { text: "Le Prix Négociable dans la limite raisonnable", type: 'phrase' },
      { text: "Véhicule roule tous les jours j'ai pas de problème particulier", type: 'phrase' },
      { text: "Pas sérieux s'abstenir", type: 'phrase' },
      { text: "paiement uniquement par mandat cash", type: 'phrase' },
      { text: "0644", type: 'phone' }, // OnOff
      { text: "0756", type: 'phone' }
    ];
    await Pattern.insertMany(seeds);
    console.log("Base de données initialisée avec les patterns par défaut.");
  }
};

module.exports = { Pattern, seedDatabase };