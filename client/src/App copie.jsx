import React, { useState } from 'react';
import { 
  Shield, AlertOctagon, CheckCircle, ArrowRight, ArrowLeft, X, 
  MapPin, FileWarning, ExternalLink, Sparkles, Loader2, Zap, 
  User, Building2, Calendar, Euro, History, FileText, BadgeAlert, Split, AlertTriangle,
  Database, TrendingUp, Info, Eye
} from 'lucide-react';

const API_URL = "http://localhost:5001";

const ScamScanner = () => {
  const [view, setView] = useState('home'); 
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  
  const [detectedFields, setDetectedFields] = useState({ siren: false, price: false, year: false, member: false });
  const [scanData, setScanData] = useState({ description: '', autoviza: '', siren: '', extractedPrice: null, extractedYear: null, accountYear: null });

  const handleDescriptionChange = (e) => {
    const text = e.target.value;
    let newData = { ...scanData, description: text };
    let newDetected = { ...detectedFields };

    const sirenMatch = text.match(/(?:SIREN|siren|SIRET|siret)[\s\D]*([\d\s]{9,15})/i);
    if (sirenMatch && sirenMatch[1]) {
        const cleanSiren = sirenMatch[1].replace(/\s/g, '').substring(0, 9);
        if (cleanSiren.length === 9) { newData.siren = cleanSiren; newDetected.siren = true; }
    }
    
    const priceRegex = /([\d\s.,]{2,10})\s?[€eE]/g;
    const priceMatches = [...text.matchAll(priceRegex)];
    if (priceMatches.length > 0) {
        for (const match of priceMatches) {
            const rawNumber = match[1].replace(/[^0-9]/g, '');
            const val = parseInt(rawNumber);
            if (!isNaN(val) && val > 500 && val < 300000) {
                newData.extractedPrice = val;
                newDetected.price = true;
                break;
            }
        }
    }

    const yearMatches = [...text.matchAll(/\b(199\d|20[0-2]\d)\b/g)];
    const currentYear = new Date().getFullYear();
    if (yearMatches.length > 0) {
        let bestYear = parseInt(yearMatches[0][0]);
        if (yearMatches.length > 1) {
            const olderYear = yearMatches.find(m => parseInt(m[0]) !== currentYear && parseInt(m[0]) !== currentYear + 1);
            if (olderYear) bestYear = parseInt(olderYear[0]);
        }
        newData.extractedYear = bestYear;
        newDetected.year = true;
    }

    const memberMatch = text.match(/Membre depuis.*?(\d{4})/i);
    if (memberMatch && memberMatch[1]) {
        newData.accountYear = parseInt(memberMatch[1]);
        newDetected.member = true;
    }

    setScanData(newData);
    setDetectedFields(newDetected);
  };

  const launchScan = async () => {
    if (!scanData.description) return alert("Collez l'annonce d'abord !");
    
    setLoading(true); 
    setResult(null);

    try {
        const response = await fetch(`${API_URL}/api/scan/auto`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(scanData)
        });

        if (!response.ok) throw new Error(`Erreur HTTP: ${response.status}`);
        const data = await response.json();

        const trustScore = 100 - (data.score || 0);
        setResult({ ...data, trustScore });
        setView('result');

    } catch (error) {
        console.error(error);
        alert(`Erreur de connexion : ${error.message}`);
    } finally {
        setLoading(false);
    }
  };

  const reset = () => { 
      setView('home'); setResult(null); 
      setDetectedFields({ siren: false, price: false, year: false, member: false });
      setScanData({ description: '', autoviza: '', siren: '', extractedPrice: null, extractedYear: null, accountYear: null });
  };

  const getVerdict = (score) => {
      if (score < 40) return { label: "DANGER", sub: "Risque très élevé.", color: "bg-red-600", textColor: "text-red-600", icon: <BadgeAlert className="w-12 h-12 text-white/90"/> };
      if (score < 75) return { label: "PRUDENCE", sub: "Quelques doutes.", color: "bg-orange-500", textColor: "text-orange-600", icon: <FileWarning className="w-12 h-12 text-white/90"/> };
      return { label: "CONFIANCE", sub: "Semble légitime.", color: "bg-emerald-500", textColor: "text-emerald-500", icon: <CheckCircle className="w-12 h-12 text-white/90"/> };
  };

if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4 text-center">
      <Loader2 className="w-16 h-16 text-indigo-600 animate-spin mb-6" />
      <h2 className="text-2xl font-bold text-slate-800">Analyse en cours...</h2>
      <p className="text-slate-500 mt-2">Interrogation de l'IA et de la base Argus.</p>
    </div>
  );

  if (view === 'result' && result) {
    const verdict = getVerdict(result.trustScore);
    const uniqueDetails = (result.details || []).filter((v,i,a)=>a.findIndex(t=>(t.label===v.label))===i);

    return (
    <div className="min-h-screen bg-slate-100 flex justify-center p-6 font-sans text-slate-900 overflow-y-auto">
      <div className="w-full max-w-5xl bg-white rounded-[2rem] shadow-2xl overflow-hidden flex flex-col lg:flex-row h-fit my-auto border border-white/60">
        
        {/* COLONNE GAUCHE : VERDICT */}
        <div className={`lg:w-1/3 p-8 flex flex-col justify-between ${verdict.color} text-white`}>
            <div>
                <div className="inline-flex p-3 bg-white/20 rounded-2xl backdrop-blur-md mb-6 shadow-inner ring-1 ring-white/30">
                    {verdict.icon}
                </div>
                <h1 className="text-4xl font-black mb-2">{verdict.label}</h1>
                <p className="text-white/90 text-lg font-medium">{verdict.sub}</p>
                
                <div className="mt-8 bg-black/20 rounded-xl p-4 backdrop-blur-sm border border-white/10">
                    <span className="block text-xs font-bold uppercase opacity-80 mb-1">Score IA</span>
                    <span className="text-5xl font-black">{result.trustScore}<span className="text-2xl opacity-60">/100</span></span>
                </div>
            </div>
            
            <button onClick={reset} className={`mt-12 w-full bg-white ${verdict.textColor} font-bold py-4 rounded-xl shadow-xl hover:scale-[1.02] transition-all flex items-center justify-center gap-2`}>
                <ArrowLeft className="w-5 h-5" /> Nouvelle recherche
            </button>
        </div>

        {/* COLONNE DROITE : DÉTAILS */}
        <div className="lg:w-2/3 p-8 space-y-8 bg-slate-50/50">

            {/* BLOC ARGUS */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                        <Database className="w-6 h-6"/>
                    </div>
                    <div>
                         <h3 className="font-bold text-slate-800 text-lg">Analyse de Prix</h3>
                         {result.argus && result.argus.voiture && (
                            <p className="text-xs text-indigo-600 font-bold uppercase tracking-wide">
                                Modèle : {result.argus.voiture}
                            </p>
                         )}
                    </div>
                </div>

                {result.argus && result.argus.cote_officielle ? (
                    <div>
                        <p className="text-slate-700 font-medium mb-6 leading-relaxed">
                            {result.argus.message || "Analyse effectuée."}
                        </p>
                        
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-center">
                                <span className="block text-xs uppercase font-bold text-slate-400 mb-1">Prix Annonce</span>
                                <span className="block text-2xl font-black text-slate-900">
                                    {scanData.extractedPrice ? scanData.extractedPrice.toLocaleString() + ' €' : 'Non détecté'}
                                </span>
                            </div>
                            <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 text-center relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-1 bg-indigo-200 rounded-bl-lg">
                                    <TrendingUp className="w-3 h-3 text-indigo-700"/>
                                </div>
                                <span className="block text-xs uppercase font-bold text-indigo-400 mb-1">Cote Estimée</span>
                                <span className="block text-2xl font-black text-indigo-600">
                                    {result.argus.cote_officielle.toLocaleString()} €
                                </span>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="text-center p-4 bg-orange-50 rounded-xl border border-orange-100 text-orange-800 text-sm">
                        <AlertTriangle className="w-5 h-5 mx-auto mb-2"/>
                        {result.argus?.message || "Impossible de comparer le prix."}
                    </div>
                )}
            </div>

            {/* LISTE DES ALERTES */}
            {uniqueDetails.length > 0 && (
                <div>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <Eye className="w-4 h-4"/> Observations
                    </h3>
                    <div className="space-y-3">
                        {uniqueDetails.map((item, i) => (
                            <div key={i} className={`flex gap-4 p-4 rounded-xl border items-start ${
                                item.type === 'danger' ? 'bg-red-50 border-red-100 text-red-900' : 'bg-white border-slate-200'
                            }`}>
                                <div className={`mt-1 p-1 rounded-full ${
                                    item.type === 'danger' ? 'bg-red-200 text-red-700' : 'bg-slate-100 text-slate-500'
                                }`}>
                                    {item.type === 'danger' ? <X className="w-4 h-4"/> : <Info className="w-4 h-4"/>}
                                </div>
                                <div>
                                    <h4 className="font-bold text-sm">{item.label}</h4>
                                    <p className="text-sm opacity-80 mt-1">{item.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            
            {/* INFOS VENDEUR */}
            <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-white rounded-xl border border-slate-200">
                    <span className="text-xs text-slate-400 font-bold uppercase">Vendeur</span>
                    <p className={`font-bold ${result.isPro ? 'text-indigo-600' : 'text-slate-800'}`}>
                        {result.isPro ? "PRO DÉTECTÉ" : "PARTICULIER"}
                    </p>
                </div>
                <div className="p-4 bg-white rounded-xl border border-slate-200">
                    <span className="text-xs text-slate-400 font-bold uppercase">Ancienneté</span>
                    <p className="font-bold text-slate-800">
                        {scanData.accountYear ? `Depuis ${scanData.accountYear}` : "Non détectée"}
                    </p>
                </div>
            </div>

            {/* POINTS POSITIFS */}
            {result.positives && result.positives.length > 0 && (
                <div>
                    <h3 className="text-xs font-bold text-emerald-600 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <CheckCircle className="w-4 h-4"/> Points Positifs
                    </h3>
                    <div className="space-y-2">
                        {result.positives.map((item, i) => (
                            <div key={i} className="flex items-center gap-3 bg-emerald-50 border border-emerald-100 p-3 rounded-xl">
                                <CheckCircle className="w-4 h-4 text-emerald-600"/>
                                <div>
                                    <span className="font-bold text-sm text-slate-800">{item.label}</span>
                                    {item.desc && <span className="text-sm text-slate-600"> - {item.desc}</span>}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* HISTORIQUE VÉHICULE (si Autoviza fourni) */}
            {scanData.autoviza && (
                <div>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <History className="w-4 h-4"/> Historique Véhicule
                    </h3>
                    <div className="bg-white p-4 rounded-xl border border-slate-200">
                        <p className="text-sm text-slate-600 leading-relaxed">
                            {scanData.autoviza.substring(0, 300)}...
                        </p>
                    </div>
                </div>
            )}

            {/* HISTORIQUE ENTREPRISE */}
            {result.history && result.history.length > 0 && (
                <div>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <History className="w-4 h-4"/> Historique Entreprise
                    </h3>
                    <div className="space-y-2">
                        {result.history.map((line, i) => (
                            <div key={i} className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl text-sm">
                                <span className="font-mono text-xs text-slate-600">{line}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
                <a href={result.mapsLink} target="_blank" rel="noopener noreferrer" 
                   className="flex items-center justify-center gap-2 p-4 bg-blue-50 border border-blue-100 rounded-xl text-blue-700 font-bold hover:bg-blue-100 transition">
                    <MapPin className="w-5 h-5"/> Voir l'adresse sur Maps <ExternalLink className="w-4 h-4"/>
                </a>
            )}

        </div>
      </div>
    </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex items-center justify-center p-4">
        <div className="w-full max-w-3xl">
            <div className="text-center mb-10">
                <div className="inline-flex p-4 bg-black rounded-2xl text-white shadow-xl mb-4"><Shield className="w-10 h-10"/></div>
                <h1 className="text-4xl font-black text-slate-900 tracking-tight mb-2">LeFauxCoin <span className="text-indigo-600">Scanner</span></h1>
                <p className="text-slate-500 font-medium">L'outil de détection d'arnaques auto & leboncoin.</p>
            </div>

            <div className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 px-8 py-3 border-b border-slate-100 flex gap-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <span className={`flex items-center gap-1 ${detectedFields.price ? 'text-emerald-600' : ''}`}>
                        <Euro className="w-3 h-3"/> {detectedFields.price ? 'Prix détecté' : 'Prix ?'}
                    </span>
                    <span className={`flex items-center gap-1 ${detectedFields.year ? 'text-emerald-600' : ''}`}>
                        <Calendar className="w-3 h-3"/> {detectedFields.year ? 'Année détectée' : 'Année ?'}
                    </span>
                    <span className={`flex items-center gap-1 ${detectedFields.siren ? 'text-indigo-600' : ''}`}>
                        <Building2 className="w-3 h-3"/> {detectedFields.siren ? 'SIREN détecté' : 'Pas de SIREN'}
                    </span>
                </div>

                <div className="p-8 space-y-6">
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">1. Collez l'annonce entière ici</label>
                        <textarea 
                            className="w-full p-4 bg-slate-50 rounded-xl border-2 border-slate-100 focus:border-indigo-500 focus:bg-white outline-none text-slate-700 text-sm h-48 resize-none transition-all font-medium" 
                            placeholder="Copiez tout le texte de l'annonce LeBonCoin (Titre, Prix, Description, Vendeur...)" 
                            value={scanData.description} 
                            onChange={handleDescriptionChange}
                        ></textarea>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-slate-400 mb-2 flex items-center gap-2">
                            <FileText className="w-4 h-4"/>
                            2. Rapport Autoviza (Optionnel)
                        </label>
                        <textarea 
                            className="w-full p-4 bg-slate-50 rounded-xl border-2 border-slate-100 focus:border-slate-300 focus:bg-white outline-none text-slate-700 text-sm h-32 resize-none transition-all font-medium" 
                            placeholder="Collez le rapport d'historique Autoviza si disponible..." 
                            value={scanData.autoviza} 
                            onChange={(e) => setScanData({...scanData, autoviza: e.target.value})}
                        ></textarea>
                    </div>

                    <button 
                        onClick={launchScan} 
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-lg font-bold py-4 rounded-xl shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2"
                    >
                        <Sparkles className="w-5 h-5"/> Lancer l'analyse complète
                    </button>
                </div>
            </div>
            
            <div className="mt-8 text-center">
                 <p className="text-xs text-slate-400">Backend connecté sur : <span className="font-mono text-slate-600">{API_URL}</span></p>
            </div>
        </div>
    </div>
  );
};

export default ScamScanner;