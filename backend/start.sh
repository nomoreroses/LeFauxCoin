#!/bin/bash

echo "=================================================="
echo "🚗 DÉMARRAGE DE LA STACK LOCALE 'EXPERT ARGUS'"
echo "=================================================="

# 1. Vérification du CSV
if [ ! -f "MA_COTE_ARGUS_OFFICIELLE.csv" ]; then
    echo "❌ ERREUR : 'MA_COTE_ARGUS_OFFICIELLE.csv' manquant !"
    exit 1
fi
echo "✅ CSV trouvé."

# 2. Installation Node (FORCE pour être sûr)
echo "📦 Vérification dépendances Node..."
npm install express cors body-parser --no-audit --silent

# 3. Installation Python
echo "🐍 Vérification dépendances Python..."
pip install flask flask-cors > /dev/null 2>&1

# Gestion arrêt propre
cleanup() {
    echo ""
    echo "🛑 Arrêt des services..."
    kill $PYTHON_PID 2>/dev/null
    exit
}
trap cleanup SIGINT

# 4. Lancement IA (Python)
echo "🚀 Lancement Python (IA) sur port 8000..."
python3 api_ia.py &
PYTHON_PID=$!
sleep 2

# 5. Lancement Serveur Principal (Node)
# Port 5001 pour éviter conflit AirPlay Mac
export PORT=5001

echo "🚀 Lancement Node (Principal) sur port $PORT..."
echo "=================================================="
echo "🟢 TOUT EST VERT !"
echo "👉 Backend Principal : http://127.0.0.1:5001"
echo "👉 Microservice IA   : http://127.0.0.1:8000"
echo "=================================================="

node server.js