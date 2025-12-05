import React, { useState } from 'react';
import { 
  Shield, AlertOctagon, CheckCircle, ArrowRight, ArrowLeft, X, 
  MapPin, FileWarning, ExternalLink, Sparkles, Loader2, Zap, 
  User, Building2, Calendar, Euro, History, FileText, BadgeAlert, Split, AlertTriangle,
  Database, TrendingUp, TrendingDown
} from 'lucide-react';

const API_URL = "http://localhost:5000"; // Mettez l'URL de votre serveur (ex: https://lefauxcoin.onrender.com)

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

  const launchScan = async () => {
    if (!scanData.description && !scanData.siren && !scanData.autoviza) return alert("Collez au moins l'annonce.");
    
    setLoading(true); 
    setResult(null);

    try {
        const response = await fetch(`${API_URL}/api/scan/auto`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(scanData)
        });

        if (!response.ok) throw new Error("Erreur serveur");
        const data = await response.json();
        
        const trustScore = 100 - data.score;
        setResult({ ...data, trustScore });
        setView('result');

    } catch (error) {
        console.error(error);
        alert("Erreur de connexion au serveur.");
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
      <h2 className="text-2xl font-bold text-slate-800 animate-pulse">Analyse Approfondie...</h2>
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

            {/* BLOC ARGUS (PRIX MARCHÉ) - NOUVEAU */}
            {result.argus && result.argus.type !== 'neutral' && (
              <div className={`p-6 rounded-2xl border-2 shadow-sm ${
                  result.argus.type === 'scam' ? 'bg-red-50 border-red-200 text-red-900' :
                  result.argus.type === 'bad_deal' ? 'bg-orange-50 border-orange-200 text-orange-900' :
                  result.argus.type === 'good_deal' ? 'bg-green-50 border-green-200 text-emerald-900' :
                  'bg-slate-50 border-slate-200 text-slate-800'
              }`}>
                  <div className="flex items-center gap-3 mb-3">
                      <div className={`p-2 rounded-full ${
                          result.argus.type === 'scam' ? 'bg-red-100 text-red-600' :
                          result.argus.type === 'good_deal' ? 'bg-green-100 text-green-600' :
                          'bg-orange-100 text-orange-600'
                      }`}>
                          {result.argus.type === 'scam' ? <AlertOctagon className="w-6 h-6"/> : 
                           result.argus.type === 'good_deal' ? <CheckCircle className="w-6 h-6"/> : 
                           result.argus.type === 'bad_deal' ? <TrendingDown className="w-6 h-6"/> :
                           <Euro className="w-6 h-6"/>}
                      </div>
                      <div>
                          <h3 className="text-lg font-black uppercase tracking-tight">Analyse Prix du Marché</h3>
                          <p className="text-xs font-bold opacity-70 uppercase">{result.argus.voiture || "Véhicule identifié"}</p>
                      </div>
                  </div>
                  
                  <p className="text-lg font-bold leading-snug mb-2">{result.argus.message}</p>
                  
                  {result.argus.cote_officielle && (
                      <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/60 rounded-lg text-sm font-semibold border border-black/5">
                          <Database className="w-4 h-4 opacity-50"/>
                          Cote estimée : {result.argus.cote_officielle} €
                      </div>
                  )}
              </div>
            )}

            {/* AUTRES DANGERS */}
            {uniqueDetails.length > 0 && (
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
                    <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 flex flex-col gap-1">
                        <span className="text-xs font-bold text-slate-400 uppercase">Ancienneté</span>
                        <span className="font-bold text-slate-800 text-sm">{scanData.accountYear ? `Membre depuis ${scanData.accountYear}` : "Date inconnue"}</span>
                    </div>
                </div>
            </section>

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
                <span className="flex items-center gap-2"><Database className="w-4 h-4"/> Base Argus</span>
                <span className="flex items-center gap-2"><Shield className="w-4 h-4"/> 100% Local</span>
            </div>
        </div>
    </div>
  );
};

export default ScamScanner;