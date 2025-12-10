import React, { useState } from 'react';
import { 
  CheckCircle, ArrowLeft, X, 
  MapPin, ExternalLink, Sparkles, Loader2, 
  Building2, Calendar, Euro, History, FileText, BadgeAlert, AlertTriangle,
  Database, TrendingUp, Info, Eye, Lock, ShieldCheck, HelpCircle, Shield, ShieldAlert, ShieldX,
  User, Search, Zap, Activity
} from 'lucide-react';

// --- CONFIGURATION DYNAMIQUE (Prod/Dev) ---
// En Prod : URL relative (le backend sert le frontend)
// En Dev  : URL locale explicite
const API_URL = import.meta.env.PROD ? '' : 'http://127.0.0.1:5000';

const ScamScanner = () => {
  const [view, setView] = useState('home'); 
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  
  const [detectedFields, setDetectedFields] = useState({ siren: false, price: false, year: false, member: false });
  const [scanData, setScanData] = useState({ description: '', autoviza: '', siren: '', extractedPrice: null, extractedYear: null, accountYear: null });
  
  const [inputErrors, setInputErrors] = useState({ description: null, autoviza: null });

  // --- LOGIC ---

  const isJustAnUrl = (text) => {
      const trimmed = text.trim();
      return /^(https?:\/\/|www\.)/i.test(trimmed) && !trimmed.includes('\n') && trimmed.length < 200;
  };

  const handleDescriptionChange = (e) => {
    const text = e.target.value;
    
    if (isJustAnUrl(text)) {
        setInputErrors(prev => ({ ...prev, description: "⚠️ Veuillez copier le TEXTE de l'annonce, pas le lien URL." }));
    } else {
        setInputErrors(prev => ({ ...prev, description: null }));
    }

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

  const handleAutovizaChange = (e) => {
      const text = e.target.value;
      if (isJustAnUrl(text)) {
          setInputErrors(prev => ({ ...prev, autoviza: "⚠️ Copiez le contenu du rapport, pas le lien." }));
      } else {
          setInputErrors(prev => ({ ...prev, autoviza: null }));
      }
      setScanData({...scanData, autoviza: text});
  };

  const launchScan = async () => {
    if (!scanData.description) return alert("Veuillez coller l'annonce pour commencer.");
    if (inputErrors.description || inputErrors.autoviza) return alert("Veuillez corriger les erreurs de saisie (pas de lien URL).");
    
    setLoading(true); 
    setResult(null);

    try {
        const response = await fetch(`${API_URL}/api/scan/auto`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(scanData)
        });

        if (!response.ok) {
            throw new Error(`Erreur HTTP: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        setResult(data); 
        setView('result');

    } catch (error) {
        console.error("Erreur détaillée Scan:", error);
        let msg = error.message;
        if (msg.includes("Failed to fetch")) {
            msg = "Impossible de contacter le serveur (Port 5000). Vérifiez qu'il est bien lancé.";
        }
        alert(`Erreur de connexion : ${msg}`);
    } finally {
        setLoading(false);
    }
  };

  const reset = () => { 
      setView('home'); setResult(null); 
      setDetectedFields({ siren: false, price: false, year: false, member: false });
      setScanData({ description: '', autoviza: '', siren: '', extractedPrice: null, extractedYear: null, accountYear: null });
      setInputErrors({ description: null, autoviza: null });
  };

  // --- UI HELPERS & MAPPING ---
  
  const getVerdictInfo = (color) => {
      switch(color) {
          case 'emerald': return { 
              label: "ANNONCE FIABLE", 
              sub: "Feu vert, vous pouvez avancer.", 
              gradient: "from-emerald-600/30 to-emerald-900/30", 
              border: "border-emerald-500/50",
              textColor: "text-emerald-400",
              icon: <ShieldCheck className="w-12 h-12 text-emerald-400"/> 
          };
          case 'lime': return { 
              label: "TRÈS PROBABLE", 
              sub: "Quelques points mineurs.", 
              gradient: "from-lime-600/30 to-lime-900/30", 
              border: "border-lime-500/50",
              textColor: "text-lime-400",
              icon: <ShieldCheck className="w-12 h-12 text-lime-400"/> 
          };
          case 'yellow': return { 
              label: "ATTENTION", 
              sub: "Soyez vigilant, points flous.", 
              gradient: "from-yellow-600/30 to-yellow-900/30", 
              border: "border-yellow-500/50",
              textColor: "text-yellow-400",
              icon: <AlertTriangle className="w-12 h-12 text-yellow-400"/> 
          };
          case 'orange': return { 
              label: "RISQUÉ", 
              sub: "Indices compromettants.", 
              gradient: "from-orange-600/30 to-orange-900/30", 
              border: "border-orange-500/50",
              textColor: "text-orange-400",
              icon: <ShieldAlert className="w-12 h-12 text-orange-400"/> 
          };
          case 'red': 
          default: return { 
              label: "ARNAQUE", 
              sub: "Ne contactez pas ce vendeur.", 
              gradient: "from-red-600/30 to-red-900/30", 
              border: "border-red-500/50",
              textColor: "text-red-400",
              icon: <ShieldX className="w-12 h-12 text-red-500"/> 
          };
      }
  };

  const formatAge = (months) => {
      if (!months) return "Inconnue";
      const years = Math.floor(months / 12);
      const remainingMonths = months % 12;
      if (years > 0) return `${years} an${years > 1 ? 's' : ''} ${remainingMonths} mois`;
      return `${remainingMonths} mois`;
  };

  const TrustGauge = ({ score, colorClass }) => {
      const radius = 80;
      const circumference = 2 * Math.PI * radius;
      const trust = 100 - score; 
      const strokeDashoffset = circumference - (trust / 100) * circumference;

      let strokeColor = "#ef4444"; 
      if (trust > 40) strokeColor = "#f97316"; 
      if (trust > 60) strokeColor = "#eab308"; 
      if (trust > 80) strokeColor = "#10b981"; 

      return (
          <div className="relative flex items-center justify-center">
              <svg className="transform -rotate-90 w-52 h-52">
                  <circle className="text-white/10" strokeWidth="16" stroke="currentColor" fill="transparent" r={radius} cx="104" cy="104" />
                  <circle stroke={strokeColor} strokeWidth="16" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap="round" fill="transparent" r={radius} cx="104" cy="104" className="transition-all duration-1000 ease-out" />
              </svg>
              <div className="absolute flex flex-col items-center">
                  <span className="text-5xl font-black text-white tracking-tighter">{trust}%</span>
                  <span className="text-xs uppercase font-bold text-white/50 tracking-widest mt-1">FIABILITÉ</span>
              </div>
          </div>
      );
  };

  // --- LOADING VIEW ---
  if (loading) return (
    <div className="h-screen flex flex-col items-center justify-center text-center relative overflow-hidden bg-[#0a0a0c] text-white">
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/20 via-transparent to-transparent"></div>
      <div className="glass-panel p-12 rounded-3xl flex flex-col items-center animate-pulse border border-white/10">
        <Loader2 className="w-16 h-16 text-indigo-500 animate-spin mb-8" />
        <h2 className="text-2xl font-bold text-white tracking-tight">Analyse en cours...</h2>
        <p className="text-slate-400 mt-2 text-sm">Vérification des bases de données et calcul des risques.</p>
      </div>
    </div>
  );

  // --- RESULT VIEW (DASHBOARD) ---
  if (view === 'result' && result) {
    const rawVerdict = result.ux_verdict || { color: 'red' };
    const ui = getVerdictInfo(rawVerdict.color);
    const uniqueDetails = (result.details || []).filter((v,i,a)=>a.findIndex(t=>(t.label===v.label))===i);

    let priceComparisonUI = null;
    if (scanData.extractedPrice && result.argus && result.argus.cote_officielle) {
        const ratio = scanData.extractedPrice / result.argus.cote_officielle;
        const percent = Math.round((1 - ratio) * 100);
        
        if (ratio < 0.7) {
            priceComparisonUI = { color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20", icon: BadgeAlert, text: "Prix Suspect", sub: `-${percent}% sous la cote` };
        } else if (ratio < 0.85) {
            priceComparisonUI = { color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/20", icon: AlertTriangle, text: "Prix Très Bas", sub: `-${percent}% sous la cote` };
        } else {
            priceComparisonUI = { color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20", icon: CheckCircle, text: "Prix Cohérent", sub: "Conforme au marché" };
        }
    }

    const googleMapsUrl = result.company?.address 
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(result.company.address)}` 
        : null;

    return (
    <div className="min-h-screen font-sans text-slate-200 p-6 relative bg-[#0a0a0c] flex flex-col">
       <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none fixed"></div>
       <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-indigo-900/10 to-transparent pointer-events-none fixed"></div>

      {/* HEADER */}
      <div className="flex items-center justify-between mb-8 z-10 px-2">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <ShieldCheck className="w-6 h-6 text-white"/>
             </div>
             <div>
                 <h1 className="font-bold text-xl text-white tracking-tight leading-none">LeFauxCoin</h1>
                 <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Rapport de Sécurité</p>
             </div>
          </div>
          <button onClick={reset} className="px-5 py-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-semibold transition flex items-center gap-2 hover:border-white/20">
              <ArrowLeft className="w-4 h-4"/> Nouvelle Analyse
          </button>
      </div>

      {/* MAIN DASHBOARD GRID */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0 z-10 pb-4">
        
        {/* COL 1: VERDICT */}
        <div className={`lg:col-span-4 relative overflow-hidden rounded-[2.5rem] bg-gradient-to-b ${ui.gradient} border border-white/5 p-8 flex flex-col items-center justify-center text-center shadow-2xl`}>
            <div className="mb-10 transform hover:scale-105 transition-transform duration-500 cursor-default">
                <TrustGauge score={result.score} colorClass={ui.textColor} />
            </div>
            <div className="mb-2">
                <h2 className={`text-4xl font-black tracking-tight uppercase ${ui.textColor} drop-shadow-lg`}>{ui.label}</h2>
                <div className={`h-1 w-20 mx-auto mt-4 rounded-full ${ui.textColor.replace('text-', 'bg-')}`}></div>
                <p className="text-white/70 text-lg font-medium mt-4 max-w-[80%] mx-auto leading-relaxed">{ui.sub}</p>
            </div>
        </div>

        {/* COL 2: DATA & FACTS */}
        <div className="lg:col-span-4 flex flex-col gap-6">
            <div className="bg-[#13131a] border border-white/5 p-6 rounded-[2rem] flex-1 flex flex-col justify-center relative overflow-hidden">
                <div className="absolute top-0 right-0 p-3 opacity-10"><Euro className="w-24 h-24 text-white"/></div>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-2 relative z-10">
                    <Database className="w-4 h-4 text-indigo-500"/> Analyse Financière
                </h3>
                <div className="space-y-6 relative z-10">
                    <div className="flex justify-between items-end">
                        <div>
                            <p className="text-slate-400 text-xs font-medium mb-1">PRIX ANNONCE</p>
                            <p className="text-3xl font-black text-white tracking-tight">{scanData.extractedPrice?.toLocaleString()} €</p>
                        </div>
                        {priceComparisonUI && (
                            <div className={`px-3 py-1.5 rounded-lg border flex items-center gap-2 ${priceComparisonUI.bg} ${priceComparisonUI.border}`}>
                                <priceComparisonUI.icon className={`w-4 h-4 ${priceComparisonUI.color}`}/>
                                <span className={`text-xs font-bold ${priceComparisonUI.color}`}>{priceComparisonUI.text}</span>
                            </div>
                        )}
                    </div>
                    <div className="pt-6 border-t border-white/5 flex justify-between items-end group/tooltip relative">
                        <div>
                            <p className="text-indigo-300/70 text-xs font-medium mb-1 flex items-center gap-1 cursor-help">
                                COTE ESTIMÉE <HelpCircle className="w-3 h-3"/>
                            </p>
                            <div className="absolute bottom-full left-0 mb-2 hidden group-hover/tooltip:block z-50 w-64 p-3 bg-[#1e1e26] text-xs text-slate-300 rounded-xl shadow-xl border border-white/10 pointer-events-none">
                                Estimation basée sur les données du marché de l'occasion (Leboncoin/LaCentrale), pas la cote officielle Argus™.
                            </div>
                            <p className="text-2xl font-bold text-indigo-100">
                                {result.argus?.cote_officielle ? result.argus.cote_officielle.toLocaleString() + ' €' : '---'}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-[#13131a] border border-white/5 p-6 rounded-[2rem] flex-[1.2] flex flex-col relative overflow-hidden">
                <div className="absolute top-0 right-0 p-3 opacity-10"><Building2 className="w-24 h-24 text-white"/></div>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-2 relative z-10">
                    <User className="w-4 h-4 text-indigo-500"/> Identité Vendeur
                </h3>
                <div className="space-y-6 relative z-10 flex-1">
                    <div className="flex items-center gap-4">
                        {result.isPro 
                            ? <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30 text-indigo-400"><Building2 className="w-6 h-6"/></div>
                            : <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-slate-400"><Lock className="w-6 h-6"/></div>
                        }
                        <div>
                            <p className="text-white font-bold text-base">{result.isPro ? "Vendeur Professionnel" : "Vendeur Particulier"}</p>
                            <div className="flex items-center gap-2 mt-1">
                                <History className="w-3 h-3 text-slate-500"/>
                                <p className="text-xs text-slate-400 font-medium">
                                    {result.company?.ageBoiteMois 
                                        ? formatAge(result.company.ageBoiteMois) + " d'ancienneté"
                                        : (scanData.accountYear ? `Compte de ${scanData.accountYear}` : "Ancienneté inconnue")}
                                </p>
                            </div>
                        </div>
                    </div>
                    {result.company?.exists && (
                        <div className="space-y-4 pt-4 border-t border-white/5">
                            <div>
                                <p className="text-[10px] text-slate-500 font-bold mb-1 uppercase tracking-wider">Entreprise</p>
                                <p className="text-white font-bold text-sm truncate" title={result.company.name}>{result.company.name}</p>
                                <p className="text-indigo-400/80 text-xs mt-0.5 truncate">{result.company.nafLabel}</p>
                            </div>
                            <div className="relative group/map">
                                <p className="text-[10px] text-slate-500 font-bold mb-1 uppercase tracking-wider flex items-center gap-1">
                                    Siège Social <HelpCircle className="w-3 h-3 cursor-help"/>
                                </p>
                                <div className="absolute bottom-full left-0 mb-2 hidden group-hover/map:block z-50 w-64 p-3 bg-[#1e1e26] text-xs text-slate-300 rounded-xl shadow-xl border border-white/10 pointer-events-none">
                                    Attention : Un garage automobile domicilié dans un immeuble résidentiel ou une zone HLM est un indice de risque négatif.
                                </div>
                                <a href={googleMapsUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:text-white text-slate-400 transition cursor-pointer">
                                    <MapPin className="w-3.5 h-3.5"/>
                                    <span className="text-xs truncate underline decoration-dotted underline-offset-2">{result.company.address}</span>
                                </a>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>

        {/* COL 3: ANALYSE DÉTAILLÉE */}
        <div className="lg:col-span-4 bg-[#13131a] border border-white/5 p-6 rounded-[2rem] flex flex-col overflow-hidden relative">
            <div className="absolute top-0 right-0 p-3 opacity-10"><Eye className="w-24 h-24 text-white"/></div>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-2 relative z-10">
                <ShieldCheck className="w-4 h-4 text-indigo-500"/> Rapport d'Inspection
            </h3>
            <div className="flex-1 overflow-y-auto pr-2 space-y-3 scrollbar-hide relative z-10">
                {uniqueDetails.length > 0 ? (
                    uniqueDetails.map((item, i) => (
                        <div key={i} className={`p-4 rounded-2xl border flex gap-4 transition-all hover:translate-x-1 ${
                            item.type === 'danger' 
                            ? 'bg-red-500/5 border-red-500/20' 
                            : 'bg-orange-500/5 border-orange-500/10'
                        }`}>
                            <div className={`mt-1 p-2 rounded-xl h-fit ${item.type === 'danger' ? 'bg-red-500/20 text-red-400' : 'bg-orange-500/20 text-orange-400'}`}>
                                {item.type === 'danger' ? <BadgeAlert className="w-5 h-5"/> : <Info className="w-5 h-5"/>}
                            </div>
                            <div>
                                <h4 className={`text-sm font-bold mb-1 ${item.type === 'danger' ? 'text-red-200' : 'text-orange-200'}`}>
                                    {item.label}
                                </h4>
                                <p className="text-xs text-slate-400 leading-relaxed font-medium">{item.desc}</p>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-50">
                        <CheckCircle className="w-16 h-16 text-emerald-500 mb-4"/>
                        <p className="text-emerald-200 font-medium">Aucune anomalie détectée</p>
                        <p className="text-xs text-slate-500 mt-2">L'annonce semble saine sur tous les points contrôlés.</p>
                    </div>
                )}
                {result.history && result.history.length > 0 && (
                    <div className="mt-8 pt-6 border-t border-white/5">
                        <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-4 block flex items-center gap-2">
                            <History className="w-3 h-3"/> Points Historiques
                        </span>
                        <div className="space-y-3">
                            {result.history.map((h, i) => (
                                <div key={i} className="text-xs text-slate-400 pl-3 border-l-2 border-indigo-500/30 py-1 leading-relaxed">
                                    {h.replace(/⚠️|⛔|✅/g, '').trim()}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>

      </div>
    </div>
    );
  }

  // --- HOME PAGE (CENTERED MODERN LAYOUT - RESPONSIVE & SCROLLABLE) ---
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#0a0a0c] overflow-auto relative font-sans py-12">
        
        {/* Background Effects */}
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none fixed"></div>
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-indigo-600/10 rounded-full blur-[150px] pointer-events-none fixed"></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-purple-600/10 rounded-full blur-[150px] pointer-events-none fixed"></div>

        <div className="w-full max-w-5xl px-6 relative z-10 flex flex-col items-center">
            
            {/* Header Brand */}
            <div className="text-center mb-10 animate-in slide-in-from-bottom-4 duration-700">
                <div className="inline-flex items-center justify-center w-24 h-24 bg-white/5 rounded-[2rem] border border-white/10 backdrop-blur-xl shadow-2xl mb-6 transform hover:scale-105 transition-transform duration-500">
                    <img src="/logo.jpg" alt="Logo" className="w-full h-full object-cover opacity-90 rounded-[2rem]"/>
                </div>
                <h1 className="text-6xl md:text-7xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white via-white to-slate-500 mb-4 drop-shadow-xl">
                    LeFauxCoin
                </h1>
                <p className="text-xl text-slate-400 font-medium max-w-2xl mx-auto leading-relaxed">
                    L'intelligence artificielle de référence pour sécuriser vos achats automobiles. Détectez les arnaques instantanément.
                </p>
            </div>

            {/* Main Action Card */}
            <div className="w-full bg-white/5 border border-white/10 backdrop-blur-2xl rounded-[2.5rem] p-2 shadow-2xl animate-in slide-in-from-bottom-8 duration-1000 delay-100 ring-1 ring-white/5">
                
                {/* Status Bar */}
                <div className="px-8 py-4 flex justify-between items-center border-b border-white/5 bg-black/20 rounded-t-[2rem]">
                    <div className="flex gap-2">
                        <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/50"></div>
                        <div className="w-3 h-3 rounded-full bg-yellow-500/20 border border-yellow-500/50"></div>
                        <div className="w-3 h-3 rounded-full bg-emerald-500/20 border border-emerald-500/50"></div>
                    </div>
                    <div className="flex gap-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                        <span className="flex items-center gap-1"><ShieldCheck className="w-3 h-3"/> Sécurisé</span>
                        <span className="flex items-center gap-1"><Activity className="w-3 h-3"/> Temps réel</span>
                    </div>
                </div>

                <div className="p-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
                    
                    {/* Left: Description */}
                    <div className="space-y-2">
                        <div className="flex justify-between items-center px-1">
                            <label className="text-xs font-bold text-indigo-300 uppercase tracking-widest">1. Annonce (Obligatoire)</label>
                            {inputErrors.description && <span className="text-[10px] text-red-400 font-bold animate-pulse">{inputErrors.description}</span>}
                        </div>
                        <textarea 
                            className={`w-full p-5 rounded-2xl h-48 bg-black/40 border border-white/10 text-sm text-slate-300 font-medium placeholder:text-slate-600 focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/10 transition-all resize-none shadow-inner ${inputErrors.description ? 'border-red-500/50' : ''}`}
                            placeholder="Copiez ici le titre et la description complète de l'annonce..."
                            value={scanData.description} 
                            onChange={handleDescriptionChange}
                        ></textarea>
                    </div>

                    {/* Right: Autoviza & Button */}
                    <div className="flex flex-col gap-6">
                        <div className="space-y-2 flex-1">
                            <div className="flex justify-between items-center px-1">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">2. Rapport Autoviza (Optionnel)</label>
                                {inputErrors.autoviza && <span className="text-[10px] text-red-400 font-bold animate-pulse">{inputErrors.autoviza}</span>}
                            </div>
                            <textarea 
                                className={`w-full p-5 rounded-2xl h-32 bg-black/40 border border-white/10 text-sm text-slate-300 font-medium placeholder:text-slate-600 focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/10 transition-all resize-none shadow-inner ${inputErrors.autoviza ? 'border-red-500/50' : ''}`}
                                placeholder="Collez le contenu du rapport historique si disponible..."
                                value={scanData.autoviza} 
                                onChange={handleAutovizaChange}
                            ></textarea>
                        </div>

                        <button 
                            onClick={launchScan} 
                            className="w-full relative group overflow-hidden bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-base font-bold py-4 rounded-2xl shadow-xl shadow-indigo-500/20 hover:shadow-indigo-500/40 hover:scale-[1.01] transition-all duration-300 active:scale-[0.99] border border-white/10 mt-6"
                        >
                            <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                            <span className="flex items-center justify-center gap-3 relative z-10">
                                <Sparkles className="w-5 h-5 text-white"/> Lancer l'analyse
                            </span>
                        </button>
                    </div>

                </div>
            </div>

            {/* Footer Trust Badges */}
            <div className="mt-12 flex gap-12 opacity-30 grayscale hover:grayscale-0 transition-all duration-500">
                <div className="flex flex-col items-center gap-2">
                    <ShieldCheck className="w-8 h-8 text-white"/>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-white">Analyse Sémantique</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                    <Database className="w-8 h-8 text-white"/>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-white">Base Argus & Gouv</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                    <Zap className="w-8 h-8 text-white"/>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-white">Moteur IA Python</span>
                </div>
            </div>

        </div>
    </div>
  );
};

const Badge = ({ active, icon, text }) => (
    <div className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all duration-500 border border-white/5 ${active ? 'bg-indigo-500/20 text-indigo-300 shadow-lg shadow-indigo-500/20 border-indigo-500/30' : 'bg-[#13131a] text-slate-600'}`}>
        {icon} <span>{text}</span>
    </div>
);

export default ScamScanner;