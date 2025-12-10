# Fichier: api_ia.py
# Tech Lead Refactoring: API Flask Robuste avec validation stricte et Logging

import logging
from flask import Flask, request, jsonify
from flask_cors import CORS
import re
import random  # Utilisé pour le mock en attendant le chargement du modèle réel

# --- CONFIGURATION DU LOGGING (Indispensable pour le debug) ---
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - [%(levelname)s] - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
# Autoriser les requêtes Cross-Origin (Node -> Python)
CORS(app, resources={r"/*": {"origins": "*"}})

# --- SIMULATION ML (MOCK ENGINE) ---
# En production, vous feriez ici : model = joblib.load('model.pkl')
def mock_predict_price(data):
    """
    Logique de repli (Fallback) pour simuler une IA
    en attendant que le modèle Scikit-Learn soit connecté.
    """
    try:
        base_price = 10000
        
        # 1. Extraction des features
        description = data.get('description', '').lower()
        price_input = data.get('extractedPrice')
        year_input = data.get('extractedYear')
        
        # 2. Logique heuristique simple
        score_modifier = 1.0
        
        # Mots clés valorisants
        if 'excellent état' in description or 'très bon état' in description:
            score_modifier += 0.1
        if 'contrôle technique ok' in description or 'ct ok' in description:
            score_modifier += 0.05
            
        # Mots clés dévalorisants
        if 'à débattre' in description:
            score_modifier -= 0.05
        if 'dans l\'état' in description or 'sans ct' in description:
            score_modifier -= 0.3
            
        # Ajustement par année (si dispo)
        if year_input:
            age = 2025 - int(year_input)
            # Dépréciation simple
            depreciation = max(0, age * 0.05) 
            score_modifier -= depreciation

        # Si un prix est fourni, l'IA "estime" autour de ce prix pour l'instant
        # pour éviter des incohérences visuelles majeures dans la démo
        if price_input and isinstance(price_input, (int, float)):
            estimated = price_input * (1.0 + random.uniform(-0.15, 0.15)) # Écart étendu pour plus de variation
        else:
            estimated = base_price * score_modifier

        return round(max(500, estimated)) # Plancher à 500€

    except Exception as e:
        logger.error(f"Erreur dans le calcul heuristique: {str(e)}")
        return None

# --- ROUTES API ---

@app.route('/health', methods=['GET'])
def health_check():
    """Route de diagnostic pour vérifier que le serveur est vivant."""
    return jsonify({"status": "healthy", "service": "Python AI Engine"}), 200

@app.route('/predict', methods=['POST'])
def predict():
    """
    Endpoint principal appelé par Node.js.
    Attend un JSON : { description, extractedPrice, extractedYear, ... }
    Renvoie : { prediction: int, confidence: float }
    """
    try:
        # 1. Validation de l'entrée
        if not request.is_json:
            logger.warning("Reçu requête non-JSON")
            return jsonify({"error": "Format JSON attendu"}), 400
        
        data = request.get_json()
        logger.info(f"🔮 Nouvelle demande de prédiction reçue. Données partielles: {list(data.keys())}")

        # 2. Prédiction (Simulation ou Modèle Réel)
        prediction_val = mock_predict_price(data)
        
        if prediction_val is None:
             return jsonify({"error": "Impossible de calculer une estimation"}), 422

        # 3. Calcul de confiance (Simulé de manière réaliste)
        
        confidence_metric = 0.95 # Valeur de base haute
        
        # PÉNALITÉS RÉALISTES (pour forcer la variation de la confiance)
        if not data.get('extractedYear'):
            # Si l'IA n'a pas l'année, la confiance chute lourdement
            confidence_metric -= 0.30 
        if not data.get('extractedPrice'):
            # Si pas de prix, la prédiction est incertaine
            confidence_metric -= 0.15 
        
        # La confiance varie maintenant en fonction de la qualité des données reçues.
        confidence_score = max(0.40, min(0.99, confidence_metric))


        response = {
            "prediction": prediction_val,
            "confidence": confidence_score,
            "meta": {
                "model_version": "v1.1-advanced-mock",
                "confidence_source": "Heuristique de pénalité (À remplacer par predict_proba)"
            }
        }
        
        logger.info(f"✅ Prédiction réussie: {prediction_val}€ (Confiance: {confidence_score:.2f})")
        return jsonify(response), 200

    except Exception as e:
        logger.error(f"🔥 Erreur Critique Serveur: {str(e)}", exc_info=True)
        return jsonify({"error": "Erreur interne du serveur IA"}), 500

# --- POINT D'ENTRÉE ---
if __name__ == '__main__':
    # Configuration explicite du port 8000 pour matcher server.js
    logger.info("🚀 Démarrage du moteur IA sur le port 8000...")
    
    # Debug=True permet le rechargement auto, mais attention en prod
    # Host='0.0.0.0' est nécessaire pour être accessible si dockerisé, 
    # mais '127.0.0.1' est plus sûr pour du dev local strict.
    app.run(host='127.0.0.1', port=8000, debug=True)