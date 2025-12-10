#!/bin/bash

# Fonction de nettoyage propre à la sortie
cleanup() {
    echo ""
    echo "🛑 ARRET D'URGENCE : Nettoyage des processus..."
    # On tue les processus enfants du script
    pkill -P $$ 
    exit
}
# Intercepte CTRL+C
trap cleanup SIGINT

echo "=================================================="
echo "🧹 NETTOYAGE PRÉVENTIF DES PORTS (KILL -9)"
echo "=================================================="

# On force la libération des ports (Mac/Linux)
# lsof -ti:PORT renvoie l'ID du processus, xargs kill -9 le tue violemment
lsof -ti:8000 | xargs kill -9 2>/dev/null && echo "💀 Port 8000 (Python) libéré."
lsof -ti:5000 | xargs kill -9 2>/dev/null && echo "💀 Port 5000 (Node) libéré."
lsof -ti:5173 | xargs kill -9 2>/dev/null && echo "💀 Port 5173 (React) libéré."

echo "--------------------------------------------------"
echo "🚀 DÉMARRAGE DE LA STACK LEFAUXCOIN"
echo "--------------------------------------------------"

# 1. IA SERVICE (PYTHON)
echo "🐍 [1/3] Lancement IA (Port 8000)..."
cd ai_service
# Vérification/Création Venv si absent
if [ ! -d "venv" ]; then 
    echo "⚠️  Venv introuvable, création..."
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt > /dev/null 2>&1
else
    source venv/bin/activate
fi

# Lancement en tâche de fond (&)
python api_ia.py &
IA_PID=$!
cd ..

# Petite pause pour laisser Python démarrer
sleep 3

# 2. BACKEND (NODE)
echo "🟢 [2/3] Lancement Backend (Port 5000)..."
cd backend
# Installation silencieuse si node_modules manque
if [ ! -d "node_modules" ]; then npm install > /dev/null 2>&1; fi

export PYTHON_API_URL="http://127.0.0.1:8000"
node server.js &
BACKEND_PID=$!
cd ..

sleep 2

# 3. CLIENT (REACT)
echo "🔵 [3/3] Lancement Frontend (Port 5173)..."
cd client
# Installation silencieuse si node_modules manque
if [ ! -d "node_modules" ]; then npm install > /dev/null 2>&1; fi

# Vérification présence script dev
if ! grep -q '"dev":' package.json; then
    echo "❌ ERREUR CRITIQUE : Le script 'dev' manque dans client/package.json !"
    cleanup
fi

npm run dev &
FRONTEND_PID=$!
cd ..

echo "=================================================="
echo "✅ SYSTÈMES OPÉRATIONNELS"
echo "👉 Frontend : http://localhost:5173"
echo "👉 Backend  : http://localhost:5000"
echo "👉 IA       : http://localhost:8000"
echo "=================================================="
echo "Appuyez sur CTRL+C pour tout arrêter."

# Attente infinie pour garder le script actif
wait