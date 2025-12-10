const { Pattern } = require('./models');

const analyzeContent = async (text, phone) => {
  let score = 0;
  let details = [];
  let detectedPatterns = [];

  // Récupérer tous les patterns de la DB
  const dbPatterns = await Pattern.find({});

  // 1. Analyse Texte (Fuzzy match simple)
  if (text) {
    const cleanText = text.toLowerCase().replace(/\s+/g, ' ');
    
    for (const p of dbPatterns.filter(p => p.type === 'phrase')) {
      const cleanPattern = p.text.toLowerCase().replace(/\s+/g, ' ');
      if (cleanText.includes(cleanPattern)) {
        score = 100; // Max score direct
        detectedPatterns.push(p.text);
        details.push({
          label: "Signature Textuelle (Database)",
          type: "danger",
          desc: "Texte identifié dans notre base de données d'arnaques.",
          evidence: `Match: "${p.text.substring(0, 30)}..."`
        });
      }
    }
  }

  // 2. Analyse Téléphone
  if (phone) {
    for (const p of dbPatterns.filter(p => p.type === 'phone')) {
      if (phone.startsWith(p.text)) {
        score += 40;
        details.push({
          label: "Numéro Virtuel Suspect",
          type: "warning",
          desc: "Préfixe souvent associé aux numéros jetables (OnOff/Transatel).",
          evidence: `Préfixe: ${p.text}`
        });
      }
    }
  }

  // Cap score
  return { score: Math.min(score, 100), details };
};

module.exports = { analyzeContent };