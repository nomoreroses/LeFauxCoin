const axios = require('axios');

const checkSirenReal = async (siren) => {
  if (!siren || siren.length < 9) return null;

  try {
    const token = process.env.PAPPERS_API_TOKEN;
    const url = `https://api.pappers.fr/v2/entreprise?siren=${siren}&api_token=${token}`;
    
    const response = await axios.get(url);
    const data = response.data;

    // Analyse réelle des données juridiques
    const isRadiated = data.radiation || data.statut_rcs === 'Radié';
    const activity = data.activite_principale?.code; // Code NAF (ex: 45.11Z pour garage)

    // Vérification cohérence Garage (Codes NAF commence par 45)
    const isGarage = activity && activity.startsWith('45');

    return {
      exists: true,
      name: data.nom_entreprise || data.denomination,
      status: isRadiated ? 'RADIÉ' : 'ACTIF',
      risk: isRadiated ? 'HIGH' : (isGarage ? 'LOW' : 'MEDIUM'), // Risque si actif mais pas un garage
      details: `Activité: ${data.activite_principale?.libelle} (${activity})`
    };

  } catch (error) {
    if (error.response && error.response.status === 404) {
      return { exists: false, risk: 'HIGH', details: "SIREN inexistant chez Pappers/INSEE" };
    }
    console.error("Erreur API Pappers:", error.message);
    return { exists: null, risk: 'UNKNOWN', details: "Erreur connexion API légale" };
  }
};

module.exports = { checkSirenReal };