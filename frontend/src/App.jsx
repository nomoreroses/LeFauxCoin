import React, { useState } from 'react';
import { 
  Shield, AlertOctagon, CheckCircle, ArrowRight, ArrowLeft, X, 
  MapPin, FileWarning, ExternalLink, Sparkles, Loader2, Zap, 
  User, Building2, Calendar, Euro, History, FileText, BadgeAlert, Split, AlertTriangle,
  Database
} from 'lucide-react';

// ✅ URL CORRIGÉE FINALE
const API_URL = "https://lefauxcoin.onrender.com";

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

    const sirenMatch = text.match(/(?:SIREN|siren|SIRET|siret)(?:[\s\D]*)([\d\s]{9,15})/i);
    if (sirenMatch && sirenMatch[1]) {
        const cleanSiren = sirenMatch[1].replace(/\s/g, '').substring(0, 9);
        if (cleanSiren.length === 9) { newData.siren = cleanSiren; newDetected.siren = true; }
    }
    
    const priceMatch = text.match(/(?:\n|^)\s*(\d[\d\s]{1,9}?)\s?€/);
    if (priceMatch && priceMatch[1]) {
        const cleanPrice = parseInt(priceMatch[1].replace(/[\s.]/g, '').replace(',', '.'));
        if (!isNaN(cleanPrice) && cleanPrice > 100 && cleanPrice < 200000) { newData.extractedPrice = cleanPrice; newDetected.price = true; }
    }
    const yearMatch = text.match(/(?:Année|modele|de)?\s?\b(20[0-2][0-9])\b/i);
    if (yearMatch && yearMatch[1]) { newData.extractedYear = parseInt(yearMatch[1]); newDetected.year = true; }

    const memberMatch = text.match(/Membre depuis\s+(?:janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)?\s?(\d{4})/i);
    if (memberMatch && memberMatch[1]) {
        newData.accountYear = parseInt(memberMatch[1]);
        newDetected.member = true;
    }

    setScanData(newData);
    setDetectedFields(newDetected);
  };

  // --- LOGIQUE DE SCAN AVEC RETRY (Spécial Render Gratuit) ---
  const launchScan = async () => {
    if (!scanData.description && !scanData.siren && !scanData.autoviza) return alert("Collez au moins l'annonce.");
    
    setLoading(true); 
    setResult(null);

    const tryFetch = async (retries = 2) => {
        try {
            console.log("Tentative de connexion à:", `${API_URL}/api/scan/auto`);
            
            const response = await fetch(`${API_URL}/api/scan/auto`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(scanData),
                signal: AbortSignal.timeout(45000)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Erreur HTTP: ${response.status} - ${errorText}`);
            }
            
            return await response.json();

        } catch (error) {
            console.warn("Echec tentative:", error);
            if (retries > 0) {
                console.log("Serveur endormi... nouvelle tentative dans 3s.");
                await new Promise(r => setTimeout(r, 3000));
                return tryFetch(retries - 1);
            }
            throw error;
        }
    };

    try {
        const data = await tryFetch(); 
        
        if(data.verdict === "ERREUR") throw new Error("Erreur interne du serveur d'analyse.");

        const trustScore = 100 - data.score;
        setResult({ ...data, trustScore });
        setView('result');

    } catch (error) {
        console.error(error);
        alert(`Erreur de connexion : ${error.message}. Vérifiez votre connexion ou réessayez.`);
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
      if (score < 40) return { label: "DANGER IMMÉDIAT", sub: "Ne contactez pas ce vendeur.", color: "bg-red-600", textColor: "text-red-600", icon: <BadgeAlert className="w-12 h-12 text-white/90"/> };
      if (score < 70) return { label: "RISQUE ÉLEVÉ", sub: "Prudence extrême requise.", color: "bg-orange-500", textColor: "text-orange-600", icon: <FileWarning className="w-12 h-12 text-white/90"/> };
      return { label: "CONFIANCE", sub: "Annonce saine.", color: "bg-emerald-500", textColor: "text-emerald-500", icon: <CheckCircle className="w-12 h-12 text-white/90"/> };
  };

  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 text-slate-900 font-sans p-4 text-center">
      <Loader2 className="w-16 h-16 text-indigo-600 animate-spin mb-6" />
      <h2 className="text-2xl font-bold text-slate-800">Analyse en cours...</h2>
      <p className="text-slate-500 mt-2 font-medium">L'IA interroge les bases de données via le serveur...</p>
      <p className="text-xs text-slate-400 mt-8 max-w-md">Note : Si le serveur est en veille, cela peut prendre jusqu'à 30 secondes.</p>
    </div>
  );

  if (view === 'result' && result) {
    const verdict = getVerdict(result.trustScore);
    const uniqueDetails = result.details.filter((v,i,a)=>a.findIndex(t=>(t.label===v.label))===i);
    const fatalError = uniqueDetails.find(d => d.type === 'fatal');

    return (
    <div className="min-h-screen bg-slate-100 flex justify-center p-6 font-sans text-slate-900 overflow-y-auto">
      <div className="w-full max-w-5xl bg-white rounded-[2rem] shadow-2xl overflow-hidden flex flex-col lg:flex-row h-fit my-auto border border-white/60">
        
        {/* COLONNE GAUCHE : SCOREBOARD */}
        <div className={`lg:w-1/3 p-10 flex flex-col justify-between ${verdict.color} relative overflow-hidden`}>
            <div className="relative z-10 text-center lg:text-left">
                <div className="inline-flex p-3 bg-white/20 rounded-2xl backdrop-blur-md mb-6 shadow-inner ring-1 ring-white/30">
                    {verdict.icon}
                </div>
                <h1 className="text-4xl font-black tracking-tight leading-none mb-2 text-white">{verdict.label}</h1>
                <p className="text-white/90 text-lg font-medium leading-snug">{verdict.sub}</p>
                <div className="mt-10 bg-white/20 rounded-2xl p-5 backdrop-blur-md border border-white/10 shadow-lg text-white">
                    <span className="block text-xs font-bold uppercase tracking-widest opacity-80 mb-1">Score de Confiance</span>
                    <span className="text-6xl font-black">{result.trustScore}<span className="text-3xl opacity-60">/100</span></span>
                </div>
            </div>
            <button onClick={reset} className={`mt-12 w-full bg-white ${verdict.textColor} font-bold py-4 rounded-xl shadow-xl hover:shadow-2xl hover:scale-[1.02] transition-all flex items-center justify-center gap-2`}>
                <ArrowLeft className="w-5 h-5" /> Nouvelle recherche
            </button>
        </div>

        {/* COLONNE DROITE : DÉTAILS */}
        <div className="lg:w-2/3 p-10 space-y-10 overflow-y-auto">

            {/* FATAL ERROR (Si présente) */}
            {fatalError && (
                <div className="bg-red-50 rounded-[2rem] p-8 border-2 border-red-100 shadow-inner">
                    <div className="flex items-center gap-3 mb-6 text-red-600">
                        <Split className="w-8 h-8"/>
                        <h2 className="text-xl font-black uppercase tracking-wide">Incohérence Critique</h2>
                    </div>
                    <div className="flex flex-col sm:flex-row items-center gap-6">
                        <div className="flex-1 w-full bg-white p-4 rounded-xl border border-red-100 text-center shadow-sm">
                            <p className="text-xs font-bold text-slate-400 uppercase mb-1">Annonce</p>
                            <p className="text-xl font-black text-slate-800 uppercase">{scanData.description.match(/Modèle[\s\n]+([a-zA-Z0-9éè]+)/i)?.[1] || "Modèle A"}</p>
                            <p className="text-sm font-medium text-slate-500">{scanData.extractedYear}</p>
                        </div>
                        <div className="p-2 bg-red-100 rounded-full text-red-500 font-bold"><X className="w-6 h-6"/></div>
                        <div className="flex-1 w-full bg-white p-4 rounded-xl border-2 border-red-500 text-center shadow-md relative">
                            <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">INCOHÉRENT</div>
                            <p className="text-xs font-bold text-slate-400 uppercase mb-1">Rapport</p>
                            <p className="text-xl font-black text-slate-800 uppercase">{scanData.autoviza.match(/logo [a-z]+ ([a-z0-9]+)/i)?.[1] || "Modèle B"}</p>
                            <p className="text-sm font-medium text-slate-500">Non conforme</p>
                        </div>
                    </div>
                    <p className="mt-6 text-sm text-red-700 font-medium text-center">{fatalError.desc}</p>
                </div>
            )}

            {/* AUTRES DANGERS */}
            {!fatalError && uniqueDetails.length > 0 && (
                <section>
                    <h3 className="text-xs font-extrabold text-red-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4"/> Points de Vigilance
                    </h3>
                    <div className="space-y-3">
                        {uniqueDetails.map((item, i) => (
                            <div key={i} className="flex gap-4 p-4 rounded-2xl bg-orange-50 border border-orange-100 items-start hover:shadow-md transition">
                                <div className="mt-1 p-1 bg-orange-100 rounded-full text-orange-600"><AlertTriangle className="w-4 h-4"/></div>
                                <div>
                                    <h4 className="font-bold text-slate-800 text-sm">{item.label}</h4>
                                    <p className="text-sm text-slate-600 mt-1 leading-relaxed">{item.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* IDENTITÉ */}
            <section>
                <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2"><User className="w-4 h-4"/> Identité du Vendeur</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 flex flex-col gap-1">
                        <span className="text-xs font-bold text-slate-400 uppercase">Statut</span>
                        <span className={`font-bold ${result.isPro ? 'text-indigo-600' : 'text-slate-600'}`}>{result.isPro ? "Professionnel" : "Particulier"}</span>
                    </div>
                    {result.isPro ? (
                        <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 md:col-span-2">
                            <div className="flex justify-between items-start mb-2"><span className="text-xs font-bold text-slate-400 uppercase">Société</span>{result.mapsLink && <a href={result.mapsLink} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-blue-600 hover:underline">Voir sur Maps ↗</a>}</div>
                            <div className="font-bold text-gray-800 text-lg mb-1">{result.positives.find(p => p.label === "Dirigeant")?.desc || "Nom non public"}</div>
                        </div>
                    ) : (
                        <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 flex flex-col gap-1">
                            <span className="text-xs font-bold text-slate-400 uppercase">Compte</span>
                            <span className="font-bold text-slate-800 text-sm">{scanData.accountYear ? `Membre depuis ${scanData.accountYear}` : "Date inconnue"}</span>
                        </div>
                    )}
                </div>
            </section>

            {/* HISTORIQUE */}
            {result.history && result.history.length > 0 && (
                <section>
                    <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2"><History className="w-4 h-4"/> Historique</h3>
                    <div className="ml-2 pl-6 border-l-2 border-slate-200 space-y-6">
                        {result.history.slice(0, 3).map((line, i) => (
                            <div key={i} className="relative group">
                                <div className={`absolute -left-[31px] top-1 w-4 h-4 rounded-full border-2 border-white shadow-md transition-transform group-hover:scale-110 ${line.includes('Ouvert') || line.includes('Actuel') ? 'bg-emerald-500' : 'bg-slate-300'}`}></div>
                                <p className="text-sm font-medium text-slate-700 bg-slate-50 inline-block px-3 py-1 rounded-lg">{line}</p>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* POSITIFS */}
            {result.positives.length > 0 && (
                <section className="pt-6 border-t border-slate-100">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {result.positives.filter(p => !p.label.includes("Dirigeant")).map((item, i) => (
                            <div key={i} className="flex items-center gap-3 text-sm text-emerald-800 bg-emerald-50 border border-emerald-100 p-3 rounded-xl">
                                <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0"/>
                                <span className="font-medium">{item.label}</span>
                            </div>
                        ))}
                    </div>
                </section>
            )}

        </div>
      </div>
    </div>
    );
  }

  // --- HOME ---
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex items-center justify-center p-4">
        <div className="w-full max-w-3xl">
            <div className="text-center mb-12">
                <div className="inline-flex p-5 bg-black rounded-3xl text-white shadow-2xl mb-6 transform -rotate-3 hover:rotate-0 transition duration-300"><Shield className="w-12 h-12"/></div>
                <h1 className="text-6xl font-black text-slate-900 tracking-tighter mb-4">LeFauxCoin</h1>
                <p className="text-xl text-slate-500 font-medium max-w-lg mx-auto">L'intelligence artificielle qui détecte les arnaques automobiles avant vous.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white rounded-[2rem] shadow-xl p-8 border border-white/50 hover:shadow-2xl transition-shadow duration-300">
                    <div className="flex items-center gap-3 mb-4 text-indigo-600"><div className="p-2 bg-indigo-50 rounded-xl"><FileWarning className="w-6 h-6"/></div><h2 className="font-bold text-lg">1. L'Annonce</h2></div>
                    <div className="relative"><textarea className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-slate-100 focus:border-indigo-500 focus:bg-white outline-none text-slate-700 text-sm h-48 resize-none transition-all font-medium" placeholder="Collez l'annonce..." value={scanData.description} onChange={handleDescriptionChange}></textarea><div className="absolute bottom-3 right-3 flex gap-2 pointer-events-none">{detectedFields.siren && <span className="bg-emerald-500 text-white px-2 py-1 rounded-lg text-[10px] font-bold shadow animate-in zoom-in">SIREN OK</span>}{detectedFields.price && <span className="bg-emerald-500 text-white px-2 py-1 rounded-lg text-[10px] font-bold shadow animate-in zoom-in">PRIX OK</span>}</div></div>
                </div>
                <div className="flex flex-col gap-6">
                    <div className="bg-white rounded-[2rem] shadow-xl p-8 border border-white/50 flex-1 transition-all duration-300">
                        <div className="flex items-center gap-3 mb-4 text-slate-400"><div className="p-2 bg-slate-50 rounded-xl"><FileText className="w-6 h-6"/></div><h2 className="font-bold text-lg">2. Rapport (Optionnel)</h2></div>
                        <textarea className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-slate-100 focus:border-slate-400 focus:bg-white outline-none text-slate-700 text-sm h-32 resize-none transition-all font-medium placeholder:text-slate-400" placeholder="Collez le rapport Autoviza..." value={scanData.autoviza} onChange={(e) => setScanData({...scanData, autoviza: e.target.value})}></textarea>
                    </div>
                    <button onClick={launchScan} className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xl font-bold py-6 rounded-[2rem] shadow-xl shadow-indigo-200 hover:shadow-2xl transition-all transform active:scale-[0.98] flex items-center justify-center gap-3 group">Lancer l'Audit <ArrowRight className="w-6 h-6 group-hover:translate-x-1 transition-transform"/></button>
                </div>
            </div>
            
            <div className="mt-12 flex justify-center gap-8 text-slate-400 text-xs font-bold uppercase tracking-widest">
                <span className="flex items-center gap-2"><Sparkles className="w-4 h-4"/> Analyse IA</span>
                <span className="flex items-center gap-2"><Database className="w-4 h-4"/> Base INSEE</span>
                <span className="flex items-center gap-2"><Shield className="w-4 h-4"/> 100% Local</span>
            </div>
        </div>
    </div>
  );
};

export default ScamScanner;