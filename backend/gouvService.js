const axios = require('axios');

const checkEntrepriseGratuit = async (siren) => {
    // Nettoyage
    const cleanSiren = siren.replace(/\s+/g, '');

    if (!cleanSiren || cleanSiren.length !== 9 || isNaN(cleanSiren)) {
        return { valid: false, error: "Format SIREN invalide (9 chiffres)" };
    }

    try {
        // On demande les infos administratives ET les établissements
        const url = `https://recherche-entreprises.api.gouv.fr/search?q=${cleanSiren}&include_admin=true`;
        const response = await axios.get(url);
        const results = response.data.results;

        if (results.length === 0) {
            return { exists: false, risk: 'HIGH', msg: "SIREN inconnu dans la base nationale." };
        }

        const company = results[0];
        const siege = company.siege;
        
        // --- 1. DÉTECTION "AUTO SERVICES" (Volatilité) ---
        // On vérifie si l'entreprise déménage souvent
        const dateCreationBoite = new Date(company.date_creation);
        const dateCreationSiege = new Date(siege.date_creation);
        const now = new Date();

        // Ancienneté en mois
        const ageBoiteMois = (now - dateCreationBoite) / (1000 * 60 * 60 * 24 * 30);
        const ageSiegeMois = (now - dateCreationSiege) / (1000 * 60 * 60 * 24 * 30);

        // ALGORITHME : 
        // Si l'entreprise a plus de 1 an MAIS est à cette adresse depuis moins de 6 mois
        // C'est suspect pour un garage (qui a besoin d'infrastructures lourdes)
        const isVolatile = ageBoiteMois > 12 && ageSiegeMois < 6;

        // --- 2. LIEN GOOGLE MAPS ---
        const fullAddress = `${siege.numero_voie || ''} ${siege.type_voie || ''} ${siege.libelle_voie}, ${siege.code_postal} ${siege.libelle_commune}`;
        const mapsLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`;

        // --- 3. CALCUL DU RISQUE ---
        let riskScore = 0;
        let details = [];

        // A. Statut Administratif
        if (company.etat_administratif === 'C') {
            riskScore += 100;
            details.push({ type: 'danger', label: "ENTREPRISE FERMÉE", desc: "Cette société est radiée (Cessée)." });
        }

        // B. Activité (Code NAF)
        const codeNaf = company.activite_principale;
        // 45 = Commerce Auto. Si c'est 43 (BTP) ou 96 (Services), c'est louche.
        if (!codeNaf.startsWith('45')) {
            riskScore += 25;
            details.push({ type: 'warning', label: "Activité Douteuse", desc: `Code NAF: ${codeNaf}. Ce n'est pas déclaré comme un garage auto.` });
        }

        // C. Instabilité Géographique (Le piège pour Auto Services)
        if (isVolatile) {
            riskScore += 35; // Score élevé car très suspect
            details.push({ 
                type: 'warning', 
                label: "Adresse Instable", 
                desc: `⚠️ ATTENTION : Cette société existe depuis ${Math.floor(ageBoiteMois)} mois mais vient d'arriver à cette adresse il y a seulement ${Math.floor(ageSiegeMois)} mois. Vérifiez le lieu.` 
            });
        }

        // D. Adresse incomplète (Domiciliation ?)
        if (!siege.numero_voie) {
            riskScore += 10;
            details.push({ type: 'info', label: "Adresse Imprécise", desc: "Aucun numéro de rue déclaré (Souvent une simple boîte aux lettres)." });
        }

        return {
            exists: true,
            valid: true,
            riskScore,
            mapsLink,
            address: fullAddress,
            details
        };

    } catch (error) {
        console.error("Erreur Gouv:", error.message);
        return { valid: false, error: "Erreur connexion API État" };
    }
};

module.exports = { checkEntrepriseGratuit };