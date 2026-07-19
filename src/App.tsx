import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowUpFromLine, Disc3, Radio, ExternalLink, Info, X, Sliders } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { openUrl } from "@tauri-apps/plugin-opener";
import { searchSpotifyTrack, getMusicBrainzData, searchiTunesTrack } from "./api";

export default function App() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [sensitivity, setSensitivity] = useState(100);
  const [smoothing, setSmoothing] = useState(60);
  const [vfdFont, setVfdFont] = useState<"pixel" | "vfd" | "dot" | "digital">("pixel");
  const [vfdScrollSteps, setVfdScrollSteps] = useState(false);
  
  const [eqPreset, setEqPreset] = useState("FLAT");
  const [bassBoost, setBassBoost] = useState(false);
  const [analyzerStyle, setAnalyzerStyle] = useState("BARS");
  const [isMuted, setIsMuted] = useState(false);
  const [vfdScrollMode, setVfdScrollMode] = useState(true);
  const [themeColor, setThemeColor] = useState("blue");
  
  const [songData, setSongData] = useState({
    title: "WAITING FOR MEDIA",
    artist: "PLAY SOMETHING ON OS",
    source_app: "",
    thumbnail_base64: "",
    bpm: 128,
    valence: 0.65,
    credits: { year: 2026 }
  });

  const [volume, setVolume] = useState(0.5);
  const [vfdCycleIndex, setVfdCycleIndex] = useState(0);
  const [bands32, setBands32] = useState<number[]>(Array(32).fill(0));
  const [bands16, setBands16] = useState<number[]>(Array(16).fill(0));

  useEffect(() => {
    const cycleInterval = setInterval(() => {
      setVfdCycleIndex(prev => prev + 1);
    }, 3000);
    return () => clearInterval(cycleInterval);
  }, []);

  const [apiData, setApiData] = useState<{
    spotifyUrl?: string;
    albumArtUrl?: string;
    releaseYear?: string;
    genres?: string[];
    albumName?: string;
  }>({});

  useEffect(() => {
    if (songData.title === "WAITING FOR MEDIA") return;
    setVfdCycleIndex(0);
    
    let isMounted = true;
    const loadApiData = async () => {
      setApiData({}); // reset
      const isSpotify = songData.source_app.toLowerCase().includes("spotify");
      
      let spUrl, spArt, year, genres: string[] = [], albumName;
      
      const iTunesData = await searchiTunesTrack(songData.title, songData.artist);
      if (iTunesData) {
        spArt = iTunesData.albumArtUrl;
        year = iTunesData.releaseYear;
        albumName = iTunesData.albumName;
        if (iTunesData.genre) {
          genres.push(iTunesData.genre);
        }
      }
      
      if (isSpotify || import.meta.env.VITE_SPOTIFY_CLIENT_ID) {
         const spData = await searchSpotifyTrack(songData.title, songData.artist);
         if (spData) {
           spUrl = spData.url;
           if (spData.albumArtUrl) spArt = spData.albumArtUrl;
           if (spData.releaseYear) year = spData.releaseYear;
         }
      }

      if (genres.length === 0) {
        const mbData = await getMusicBrainzData(songData.title, songData.artist);
        if (mbData) {
          if (!year) year = mbData.releaseYear;
          genres = mbData.genres;
        }
      }

      if (isMounted) {
        setApiData({
          spotifyUrl: spUrl,
          albumArtUrl: spArt,
          releaseYear: year,
          genres,
          albumName
        });
      }
    };
    loadApiData();

    return () => { isMounted = false; };
  }, [songData.title, songData.artist, songData.source_app]);

  useEffect(() => {
    let isFetching = false;
    const fetchMediaInfo = async () => {
      if (isFetching) return;
      isFetching = true;
      try {
        const info: any = await invoke("get_current_media_info");
        if (info && info.title) {
          setSongData(prev => {
            return {
              ...prev,
              title: info.title,
              artist: info.artist || "UNKNOWN ARTIST",
              source_app: info.source_app || "",
              thumbnail_base64: info.thumbnail_base64 || "",
            };
          });
        } else {
          setSongData(prev => ({
            ...prev,
            title: "WAITING FOR MEDIA",
            artist: "PLAY SOMETHING ON OS",
            source_app: "",
            thumbnail_base64: ""
          }));
        }
      } catch (e) {
        console.error("fetchMediaInfo error:", e);
        setSongData(prev => ({
          ...prev,
          title: "ERROR: " + String(e),
          artist: "CHECK CONSOLE",
          source_app: "",
          thumbnail_base64: ""
        }));
      } finally {
        isFetching = false;
      }
    };

    const fetchVolume = async () => {
      try {
        const vol: number = await invoke("get_system_volume");
        setVolume(vol);
      } catch (e) {}
    };

    const fetchVisualizerSettings = async () => {
      try {
        const settings: [number, number] = await invoke("get_visualizer_settings");
        setSensitivity(settings[0]);
        setSmoothing(settings[1]);
      } catch (e) {
        console.error("Failed to load visualizer settings:", e);
      }
    };

    fetchMediaInfo();
    fetchVolume();
    fetchVisualizerSettings();
    const interval = setInterval(fetchMediaInfo, 1000);

    const unlistenAudio = listen("audio-spectrum", (event: any) => {
      if (event.payload) {
        setBands16(event.payload.bands16);
        setBands32(event.payload.bands32);
      }
    });

    return () => {
      clearInterval(interval);
      unlistenAudio.then(f => f());
    };
  }, []);

  const handlePlayPause = async () => {
    setIsPlaying(!isPlaying);
    try {
      if (isPlaying) {
        await invoke("media_pause");
      } else {
        await invoke("media_play");
      }
    } catch (e) {}
  };

  const handleSkipNext = async () => {
    try { await invoke("media_skip_next"); } catch (e) {}
  };

  const handleSkipPrev = async () => {
    try { await invoke("media_skip_previous"); } catch (e) {}
  };

  const adjustVolume = async (stepDelta: number) => {
    const currentSteps = Math.round(volume * 35);
    const nextSteps = Math.max(0, Math.min(35, currentSteps + stepDelta));
    const newVol = nextSteps / 35;
    setVolume(newVol);
    try {
      await invoke("set_system_volume", { level: newVol });
    } catch (err) { 
      console.error("Volume error:", err); 
    }
  };

  const handleVolumeScroll = async (e: React.WheelEvent) => {
    const direction = e.deltaY > 0 ? -1 : 1;
    await adjustVolume(direction);
  };

  const handleSensitivityChange = async (val: number) => {
    setSensitivity(val);
    try {
      await invoke("set_visualizer_settings", { sensitivity: val, smoothing });
    } catch (e) {
      console.error("Failed to save sensitivity:", e);
    }
  };

  const handleSmoothingChange = async (val: number) => {
    setSmoothing(val);
    try {
      await invoke("set_visualizer_settings", { sensitivity, smoothing: val });
    } catch (e) {
      console.error("Failed to save smoothing:", e);
    }
  };

  const handlePowerOff = async () => {
    try {
      await getCurrentWindow().close();
    } catch (e) { 
      console.error("Power off error:", e); 
      alert("Power off error: " + e);
    }
  };

  const toggleExpand = async () => {
    const nextState = !isExpanded;
    try {
      const win = getCurrentWindow();
      if (nextState) {
        // Just resize first to ensure it works. 
        await win.setSize(new LogicalSize(800, 840));
        setIsExpanded(true);
      } else {
        setIsExpanded(false);
        setTimeout(async () => {
          await win.setSize(new LogicalSize(800, 450));
        }, 500); 
      }
    } catch (e) {
      console.error("Window resize error:", e);
      alert("Resize error: " + e);
      // Fallback: still trigger the animation even if resize fails
      setIsExpanded(nextState);
    }
  };

  const isSpotifyMode = songData.source_app.toLowerCase().includes("spotify");

  const getThemeTextClass = () => {
    switch (themeColor) {
      case 'cyan': return 'text-cyan-400';
      case 'green': return 'text-emerald-400';
      case 'orange': return 'text-orange-400';
      default: return 'text-blue-400';
    }
  };

  const getThemeAccentClass = () => {
    switch (themeColor) {
      case 'cyan': return 'accent-cyan-500';
      case 'green': return 'accent-emerald-500';
      case 'orange': return 'accent-orange-500';
      default: return 'accent-blue-500';
    }
  };

  const getThemeBgClass = () => {
    switch (themeColor) {
      case 'cyan': return 'bg-cyan-500';
      case 'green': return 'bg-emerald-500';
      case 'orange': return 'bg-orange-500';
      default: return 'bg-blue-600';
    }
  };

  const getThemeGradientClass = () => {
    switch (themeColor) {
      case 'cyan': return 'from-cyan-500/30 to-blue-900/40';
      case 'green': return 'from-green-500/20 to-emerald-900/40';
      case 'orange': return 'from-orange-500/30 to-red-900/40';
      default: return 'from-indigo-500 to-purple-600';
    }
  };
  const handleOpenBrowser = async () => {
    try {
      const query = encodeURIComponent(`${songData.title} ${songData.artist}`);
      await openUrl(`https://www.google.com/search?q=${query}`);
    } catch (e) {
      console.error(e);
    }
  };

  // Heisei VFD Visualizer logic (16-band)
  const renderDpxBand = (val: number) => {
    // val is 0.0 ~ 1.0. We have 16 blocks vertically.
    const activeBlocks = Math.round(val * 16);
    return [...Array(16)].map((_, j) => {
      const isActive = j < activeBlocks;
      const isTop = j >= 13; // top 3 blocks show highlight
      
      let baseClass = "bg-sky-950/10";
      let activeClass = "";
      
      if (themeColor === "blue") {
        activeClass = isTop ? "bg-cyan-300 shadow-[0_0_3px_rgba(34,211,238,0.8)]" : "bg-sky-400 shadow-[0_0_3px_rgba(56,189,248,0.8)]";
      } else if (themeColor === "cyan") {
        activeClass = isTop ? "bg-amber-300 shadow-[0_0_3px_rgba(251,191,36,0.8)]" : "bg-cyan-400 shadow-[0_0_3px_rgba(34,211,238,0.8)]";
      } else if (themeColor === "green") {
        activeClass = isTop ? "bg-yellow-300 shadow-[0_0_3px_rgba(253,224,71,0.8)]" : "bg-emerald-400 shadow-[0_0_3px_rgba(52,211,153,0.8)]";
      } else { // orange
        activeClass = isTop ? "bg-red-400 shadow-[0_0_3px_rgba(248,113,113,0.8)]" : "bg-orange-400 shadow-[0_0_3px_rgba(251,146,60,0.8)]";
      }
      
      if (analyzerStyle === 'WAVE') {
        const isPeak = j === activeBlocks - 1;
        return (
          <div 
            key={j}
            className={`w-full h-1 ${isPeak ? activeClass : 'bg-transparent'}`}
          />
        );
      }
      
      return (
        <div 
          key={j}
          className={`w-full h-1 ${isActive ? activeClass : baseClass}`}
        />
      );
    });
  };

  const getVfdFontFamily = () => {
    switch (vfdFont) {
      case "pixel": return "'VT323', monospace";
      case "vfd": return "'Share Tech Mono', monospace";
      case "dot": return "'DotGothic16', sans-serif";
      case "digital": return "'Orbitron', sans-serif";
      default: return "'VT323', monospace";
    }
  };

  const vfdLines = [songData.artist];
  if (apiData.albumName) {
    vfdLines.push(`ALBUM: ${apiData.albumName}`);
  }
  if (apiData.genres && apiData.genres.length > 0) {
    vfdLines.push(`GENRE: ${apiData.genres[0]}`);
  }
  const currentVfdLine = vfdLines[vfdCycleIndex % vfdLines.length] || songData.artist;

  const symBands32 = [...bands32.slice(0, 16), ...[...bands32.slice(0, 16)].reverse()];
  const symBands16 = [...bands16.slice(0, 8), ...[...bands16.slice(0, 8)].reverse()];

  const vfdTitleText = songData.title.toUpperCase();
  const isVfdTitleLong = vfdScrollMode && vfdTitleText.length > 20;
  const vfdDisplayTitle = vfdScrollMode ? vfdTitleText : vfdTitleText.slice(0, 16);

  return (
    <div className="w-screen h-screen flex flex-col justify-end items-center p-2 bg-transparent select-none overflow-hidden" style={{ perspective: "1500px" }}>
      
      {/* Modern Pop-up Display (Slides up from behind the 2DIN unit) */}
      <motion.div 
        initial={{ y: 400, opacity: 0, rotateX: 30 }}
        animate={{ 
          y: isExpanded ? 0 : 400, 
          opacity: isExpanded ? 1 : 0,
          rotateX: isExpanded ? 0 : 30
        }}
        transition={{ type: "spring", stiffness: 90, damping: 20 }}
        className="w-[790px] h-[390px] mb-2 rounded-xl relative z-0 flex flex-col p-6 shadow-2xl overflow-hidden border border-white/20 origin-bottom"
        style={{
          background: "linear-gradient(135deg, rgba(20,20,30,0.95) 0%, rgba(10,10,15,0.98) 100%)",
          backdropFilter: "blur(20px)"
        }}
        data-tauri-drag-region="true"
      >
         {/* Sleek Modern UI */}
         <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-500/10 via-transparent to-transparent pointer-events-none"></div>
         
         <div className="flex w-full h-full gap-8 relative z-10 pointer-events-none">
            {/* Album Art Area */}
            <div className={`w-64 h-64 rounded-2xl bg-gradient-to-br ${getThemeGradientClass()} shadow-[0_10px_30px_rgba(0,0,0,0.5)] flex items-center justify-center relative overflow-hidden`}>
               {(apiData.albumArtUrl || songData.thumbnail_base64) ? (
                 <img src={apiData.albumArtUrl || songData.thumbnail_base64} alt="Album Art" className="w-full h-full object-cover" />
               ) : (
                 <Disc3 size={80} className="text-white/20 animate-[spin_4s_linear_infinite]" />
               )}
               <div className="absolute inset-0 shadow-[inset_0_0_20px_rgba(0,0,0,0.5)] rounded-2xl pointer-events-none"></div>
            </div>
            
            {/* Track Info & Visualizer Area */}
            <div className="flex-1 flex flex-col justify-center">
               <div className="flex items-center justify-between mb-2 pointer-events-auto">
                  <div className={`flex items-center gap-2 font-semibold tracking-wider text-sm ${getThemeTextClass()}`}>
                    <Radio size={16} className="animate-pulse" /> NOW PLAYING {isSpotifyMode && "ON SPOTIFY"}
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => {
                        setShowSettings(!showSettings);
                        if (showDetails) setShowDetails(false);
                      }} 
                      className={`p-1.5 hover:bg-white/10 rounded-md transition-colors ${showSettings ? getThemeTextClass() : 'text-white/40'}`}
                      title="Visualizer Settings"
                    >
                      <Sliders size={16} />
                    </button>
                    <button 
                      onClick={() => {
                        setShowDetails(!showDetails);
                        if (showSettings) setShowSettings(false);
                      }} 
                      className={`p-1.5 hover:bg-white/10 rounded-md transition-colors ${showDetails ? getThemeTextClass() : 'text-white/40'}`}
                      title="Toggle Details"
                    >
                      {showDetails ? <X size={16} /> : <Info size={16} />}
                    </button>
                  </div>
               </div>
               
               {showSettings ? (
                  <div className="flex-1 flex flex-col justify-center animate-in fade-in slide-in-from-bottom-4 duration-300 pointer-events-auto">
                     <h3 className="text-white/50 text-xs font-bold uppercase tracking-widest mb-3">Visualizer Settings</h3>
                     
                     <div className="space-y-4 max-w-md">
                        {/* Sensitivity Slider */}
                        <div className="flex flex-col gap-1.5">
                           <div className="flex justify-between text-sm text-white/80">
                              <span>Sensitivity (感度)</span>
                              <span className={`font-mono ${getThemeTextClass()}`}>{sensitivity}%</span>
                           </div>
                           <input 
                              type="range" 
                              min="10" 
                              max="400" 
                              value={sensitivity} 
                              onChange={(e) => handleSensitivityChange(Number(e.target.value))}
                              className={`w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer ${getThemeAccentClass()} no-drag`}
                           />
                           <div className="flex justify-between text-[10px] text-white/40">
                              <span>Low (10%)</span>
                              <span>High (400%)</span>
                           </div>
                        </div>

                        <div className="flex flex-col gap-1.5">
                           <div className="flex justify-between text-sm text-white/80">
                              <span>Smoothing (応答性・滑らかさ)</span>
                              <span className={`font-mono ${getThemeTextClass()}`}>{smoothing}%</span>
                           </div>
                           <input 
                              type="range" 
                              min="0" 
                              max="95" 
                              value={smoothing} 
                              onChange={(e) => handleSmoothingChange(Number(e.target.value))}
                              className={`w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer ${getThemeAccentClass()} no-drag`}
                           />
                           <div className="flex justify-between text-[10px] text-white/40">
                              <span>Fast (0%)</span>
                              <span>Smooth (95%)</span>
                           </div>
                        </div>

                        {/* VFD Display Settings */}
                        <div className="border-t border-white/10 pt-4 mt-2 flex flex-col gap-3">
                           <h4 className="text-white/40 text-[10px] font-bold uppercase tracking-widest">VFD Display Settings</h4>
                           
                           {/* Font Selector */}
                           <div className="flex flex-col gap-1.5">
                              <span className="text-sm text-white/80">Display Font (フォント)</span>
                              <div className="grid grid-cols-4 gap-1.5 text-xs">
                                 {[
                                    { id: 'pixel', name: 'Pixel' },
                                    { id: 'vfd', name: 'VFD' },
                                    { id: 'dot', name: 'Retro Dot' },
                                    { id: 'digital', name: 'Digital' }
                                 ].map(f => (
                                    <button
                                       key={f.id}
                                       onClick={() => setVfdFont(f.id as any)}
                                       className={`py-1.5 rounded-md font-semibold text-center border transition-all ${
                                          vfdFont === f.id 
                                             ? `bg-white/10 border-current ${getThemeTextClass()} shadow-md` 
                                             : 'bg-white/5 border-white/5 text-white/60 hover:bg-white/10 hover:text-white'
                                       }`}
                                    >
                                       {f.name}
                                    </button>
                                 ))}
                              </div>
                           </div>

                           {/* Scroll Mode Toggle */}
                           <div className="flex items-center justify-between mt-1 text-sm">
                              <span className="text-white/80">Scroll Style (流れ方)</span>
                              <div className="flex gap-1.5 bg-white/5 p-0.5 rounded-md border border-white/5">
                                 <button
                                    onClick={() => setVfdScrollSteps(false)}
                                    className={`px-3 py-1 rounded text-xs font-semibold ${!vfdScrollSteps ? `${getThemeBgClass()} text-white shadow-md` : 'text-white/60 hover:text-white'}`}
                                 >
                                    Smooth
                                 </button>
                                 <button
                                    onClick={() => setVfdScrollSteps(true)}
                                    className={`px-3 py-1 rounded text-xs font-semibold ${vfdScrollSteps ? `${getThemeBgClass()} text-white shadow-md` : 'text-white/60 hover:text-white'}`}
                                 >
                                    Retro Steps
                                 </button>
                              </div>
                           </div>
                        </div>

                     </div>
                  </div>
               ) : showDetails ? (
                  <div className="flex-1 flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-300 pointer-events-auto">
                     <h3 className="text-white/50 text-xs font-bold uppercase tracking-widest mb-1">Track Details</h3>
                     <h1 className="text-2xl font-bold text-white mb-1" style={{ fontFamily: "'Inter', sans-serif" }}>{songData.title}</h1>
                     <h2 className="text-lg text-white/70 mb-4" style={{ fontFamily: "'Inter', sans-serif" }}>{songData.artist}</h2>
                     
                     <div className="space-y-2 text-sm text-white/80 mb-4">
                        <p><span className="text-white/40">Source:</span> <span className="capitalize">{songData.source_app}</span></p>
                        {apiData.albumName && <p><span className="text-white/40">Album:</span> {apiData.albumName}</p>}
                        {apiData.releaseYear && <p><span className="text-white/40">Year:</span> {apiData.releaseYear}</p>}
                        {apiData.genres && apiData.genres.length > 0 && (
                            <p><span className="text-white/40">Genres:</span> {apiData.genres.join(", ")}</p>
                        )}
                     </div>
                     
                     <button onClick={handleOpenBrowser} className={`flex items-center justify-center gap-2 w-max px-4 py-2 rounded-full font-bold text-sm ${getThemeBgClass()} text-white transition-colors hover:brightness-110`}>
                        <ExternalLink size={16} /> Search on Google
                      </button>
                  </div>
               ) : (
                  <>
                     <h1 className="text-4xl font-bold text-white mb-2 leading-tight drop-shadow-lg" style={{ fontFamily: "'Inter', sans-serif" }}>
                       {songData.title}
                     </h1>
                     <h2 className={`text-xl text-white/70 ${!apiData.albumName && !apiData.releaseYear && !apiData.genres?.length ? 'mb-8' : 'mb-2'}`} style={{ fontFamily: "'Inter', sans-serif" }}>
                       {songData.artist}
                     </h2>

                     {/* Metadata Tags */}
                     {(apiData.albumName || apiData.releaseYear || (apiData.genres && apiData.genres.length > 0)) && (
                       <div className="flex gap-2 mb-6 pointer-events-none">
                         {apiData.albumName && (
                           <span className="px-2 py-0.5 rounded-full text-xs font-medium border border-white/10 bg-white/5 text-white/80 max-w-[200px] truncate" title={apiData.albumName}>
                             {apiData.albumName}
                           </span>
                         )}
                         {apiData.releaseYear && (
                           <span className="px-2 py-0.5 rounded-full text-xs font-medium border border-white/10 bg-white/5 text-white/80">
                             {apiData.releaseYear}
                           </span>
                         )}
                         {apiData.genres?.map(g => (
                           <span key={g} className="px-2 py-0.5 rounded-full text-xs font-medium border border-white/10 bg-white/5 text-white/80 capitalize">
                             {g}
                           </span>
                         ))}
                       </div>
                     )}

                     {/* Smooth Modern Visualizer */}
                     <div className="w-full h-24 flex items-end justify-between gap-1 opacity-80 pointer-events-none">
                         {symBands32.map((val, i) => (
                             <motion.div
                                 key={`32-${i}`}
                                 animate={{ height: `${Math.min(100, Math.max(10, val * 100))}%` }}
                                 transition={{ type: "spring", stiffness: 300, damping: 20 }}
                                 className={`w-full rounded-t-sm ${getThemeBgClass()}`}
                             />
                         ))}
                     </div>
                  </>
               )}
            </div>
         </div>
      </motion.div>

      {/* Retro 2DIN Faceplate (Kenwood DPX-440 Recreation) */}
      <div 
        data-tauri-drag-region="true"
        className="w-[790px] h-[430px] silver-bezel relative z-10 flex flex-col p-1.5 transform-gpu select-none"
      >
        {/* Top CD Slot & Eject Row */}
        <div className="w-full flex items-center justify-between px-3 h-8 bg-gradient-to-b from-transparent to-black/30 pointer-events-auto">
          {/* Brand Logo & Model */}
          <div className="flex items-center gap-2">
            <button 
              onClick={handlePowerOff} 
              className="w-4 h-4 rounded-full border border-red-950 bg-red-950/80 hover:bg-red-900 text-red-500 hover:text-red-400 flex items-center justify-center text-[8px] font-bold active:scale-95 transition-transform"
              title="Power Off"
            >
              ⏻
            </button>
            <span className="font-serif font-black italic text-base tracking-wider text-neutral-300 leading-none">KENWOOD</span>
            <span className="text-[7px] text-[#9ca3af] font-semibold uppercase tracking-widest leading-none">CD CASSETTE DSP RECEIVER DPX-440</span>
          </div>
          
          {/* CD Slot */}
          <div className="flex-1 max-w-[320px] mx-auto h-4 cd-slot relative flex items-center justify-center">
            {/* Green glowing LED slit in the center */}
            <div className="w-16 h-0.5 cd-led"></div>
          </div>

          {/* CD Eject Button */}
          <button 
            onClick={toggleExpand} 
            className="px-2 py-0.5 text-[8px] border border-neutral-600 rounded bg-gradient-to-b from-neutral-700 to-neutral-900 text-neutral-300 font-bold active:scale-95 transition-transform flex items-center gap-1 shadow-md hover:bg-neutral-800"
          >
            <ArrowUpFromLine size={10} className={isExpanded ? "rotate-180 transition-transform" : "transition-transform"} /> EJECT
          </button>
        </div>

        {/* Main Panel Row (Inside Silver Bezel, inset dark faceplate) */}
        <div className="flex-1 dark-faceplate p-2 flex gap-2.5 items-stretch relative overflow-hidden">
          
          {/* Left Button Column: AUD, Volume Up, Volume Down, ATT/CLK */}
          <div className="w-16 flex flex-col justify-between py-2 pointer-events-auto select-none">
            <button className="dpx-side-btn h-10 text-[9px] font-bold text-center leading-none" title="Audio Adjust">
              AUD
            </button>
            <div className="flex flex-col gap-3 my-2">
              <button 
                onClick={() => adjustVolume(1)} 
                className="dpx-side-btn h-14 flex flex-col items-center justify-center gap-1.5"
                title="Volume Up"
              >
                <span className="text-[11px]">▲</span>
                <span className="text-[8px] font-bold">VOL</span>
              </button>
              <button 
                onClick={() => adjustVolume(-1)} 
                className="dpx-side-btn h-14 flex flex-col items-center justify-center gap-1.5"
                title="Volume Down"
              >
                <span className="text-[8px] font-bold">VOL</span>
                <span className="text-[11px]">▼</span>
              </button>
            </div>
            <button 
              onClick={async () => {
                const newMute = !isMuted;
                setIsMuted(newMute);
                try {
                  await invoke("set_system_volume", { level: newMute ? 0 : volume });
                } catch (e) {}
              }} 
              className={`dpx-side-btn h-10 flex flex-col items-center justify-center leading-none ${isMuted ? 'text-red-400 font-bold' : ''}`}
              title="Attenuator / Clock"
            >
              <span className="text-[9px]">ATT</span>
              <span className="text-[7px] opacity-75">CLK</span>
            </button>
          </div>

          {/* Center Screen Cutout Frame & Cassette Slot Container */}
          <div className="flex-1 flex flex-col gap-2 min-w-0">
            {/* VFD Screen Frame */}
            <div className="flex-1 screen-frame p-1 flex items-stretch min-w-0">
              {/* Blue VFD Screen */}
              <div 
                onWheel={handleVolumeScroll}
                className="flex-1 heisei-vfd vfd-grid p-2.5 flex flex-col justify-between select-none relative pointer-events-auto cursor-ns-resize min-w-0"
                title="Scroll to change volume"
              >
                {/* Screen Top Status Area */}
                <div 
                  className="flex justify-between items-start text-[9px] font-semibold tracking-wider"
                  style={{ fontFamily: getVfdFontFamily() }}
                >
                  <div className="flex gap-2.5">
                    <span className={`px-1 border border-sky-500/20 text-[8px] ${themeColor === 'blue' ? 'glow-blue' : themeColor === 'cyan' ? 'glow-cyan' : themeColor === 'green' ? 'glow-green' : 'glow-orange'}`}>DSP</span>
                    <span className={`px-1 border border-emerald-500/20 text-[8px] ${bassBoost ? 'glow-green' : 'text-emerald-500/20'}`}>LOUD</span>
                    <span className={`px-1 border border-sky-500/20 text-[8px] ${themeColor === 'blue' ? 'glow-blue' : themeColor === 'cyan' ? 'glow-cyan' : themeColor === 'green' ? 'glow-green' : 'glow-orange'}`}>{eqPreset}</span>
                  </div>
                  <div className={`text-[9px] ${themeColor === 'blue' ? 'glow-blue' : themeColor === 'cyan' ? 'glow-cyan' : themeColor === 'green' ? 'glow-green' : 'glow-orange'} flex items-center gap-1`}>
                    <span>{isPlaying ? "DISC ▶" : "PAUSE ❚❚"}</span>
                    {isMuted && <span className="text-red-400 font-bold text-[8px] px-0.5 border border-red-500/30">MUTE</span>}
                  </div>
                </div>

                {/* Scrolling Text / Title */}
                <div className="flex flex-col mt-0.5 min-w-0 w-full">
                  {isVfdTitleLong ? (
                    <div className="w-full overflow-hidden whitespace-nowrap relative select-none py-1">
                      <div 
                        className={`inline-block animate-marquee text-3xl tracking-widest uppercase leading-tight ${themeColor === 'blue' ? 'glow-blue' : themeColor === 'cyan' ? 'glow-cyan' : themeColor === 'green' ? 'glow-green' : 'glow-orange'}`}
                        style={{ 
                          fontFamily: getVfdFontFamily(),
                          animation: `marquee 15s ${vfdScrollSteps ? 'steps(30, end)' : 'linear'} infinite`
                        }}
                      >
                        <span>{vfdDisplayTitle}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
                        <span>{vfdDisplayTitle}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
                      </div>
                    </div>
                  ) : (
                    <div 
                      className={`text-3xl tracking-widest truncate uppercase leading-tight ${themeColor === 'blue' ? 'glow-blue' : themeColor === 'cyan' ? 'glow-cyan' : themeColor === 'green' ? 'glow-green' : 'glow-orange'}`}
                      style={{ fontFamily: getVfdFontFamily() }}
                    >
                      {vfdDisplayTitle}
                    </div>
                  )}
                  <div 
                    className={`text-[11px] tracking-wider uppercase ${themeColor === 'blue' ? 'glow-blue' : themeColor === 'cyan' ? 'glow-cyan' : themeColor === 'green' ? 'glow-green' : 'glow-orange'} opacity-85 mt-0.5 flex justify-between items-center w-full min-w-0 gap-2`}
                    style={{ fontFamily: getVfdFontFamily() }}
                  >
                    <span className="truncate flex-1 min-w-0">{currentVfdLine.toUpperCase()}</span>
                    <span className="text-[10px] opacity-75 font-mono shrink-0">VOL: {Math.round(volume * 35)}</span>
                  </div>
                </div>

                {/* Symmetrical visualizer */}
                <div className="h-28 w-full flex items-end justify-between gap-[3px] mt-1.5 opacity-90">
                  {symBands16.map((val, i) => (
                    <div key={i} className="flex-1 flex flex-col-reverse gap-[1px]">
                      {renderDpxBand(val)}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Cassette Deck Face */}
            <div className="h-16 screen-frame p-1 flex items-stretch">
              <div className="flex-1 bg-[#101114] border border-black/40 rounded-lg flex flex-col justify-center items-center shadow-[inset_0_4px_12px_rgba(0,0,0,0.95)] px-6 relative overflow-hidden">
                {/* Horizontal Slit for Cassette */}
                <div className="w-full h-3.5 bg-[#050506] rounded border border-neutral-900 shadow-[inset_0_3px_6px_rgba(0,0,0,1)] relative flex items-center justify-between px-6">
                  {/* Cassette Guide Rails */}
                  <div className="w-3 h-0.5 bg-neutral-800 rounded-sm"></div>
                  <div className="w-1.5 h-1.5 rounded-full bg-neutral-900 shadow-[inset_0_1px_1px_rgba(0,0,0,0.8)]"></div>
                  <div className="w-1.5 h-1.5 rounded-full bg-neutral-900 shadow-[inset_0_1px_1px_rgba(0,0,0,0.8)]"></div>
                  <div className="w-3 h-0.5 bg-neutral-800 rounded-sm"></div>
                  
                  {/* Insert Glow */}
                  <div className="absolute inset-0 bg-cyan-400/5 hover:bg-cyan-400/10 pointer-events-none transition-colors"></div>
                </div>
                {/* Retro Silk Screen Text */}
                <div className="flex justify-between w-full text-[7px] text-neutral-500 font-semibold tracking-widest mt-1 font-sans select-none opacity-80 px-2">
                  <span>◀ AUTO REVERSE ▶</span>
                  <span className="text-[6px] text-neutral-600 font-bold">FULL LOGIC CONTROL</span>
                  <span>DOLBY B-C NR</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Button Column: FM+, Seek Up/Down, AM-, Play/Pause */}
          <div className="w-16 flex flex-col justify-between py-2 pointer-events-auto select-none">
            <button 
              onClick={() => setThemeColor(prev => prev === 'blue' ? 'cyan' : prev === 'cyan' ? 'green' : prev === 'green' ? 'orange' : 'blue')}
              className="dpx-side-btn h-10 text-[9px] font-bold text-center leading-none" 
              title="Change Theme Color"
            >
              FM+
            </button>
            <div className="flex flex-col gap-3 my-2">
              <button 
                onClick={handleSkipPrev} 
                className="dpx-side-btn h-14 flex flex-col items-center justify-center gap-1"
                title="Seek/Track Previous"
              >
                <span className="text-[11px]">◀◀</span>
                <span className="text-[7px] font-bold">SEEK</span>
              </button>
              <button 
                onClick={handleSkipNext} 
                className="dpx-side-btn h-14 flex flex-col items-center justify-center gap-1"
                title="Seek/Track Next"
              >
                <span className="text-[7px] font-bold">SEEK</span>
                <span className="text-[11px]">▶▶</span>
              </button>
            </div>
            <button 
              onClick={handlePlayPause}
              className="dpx-side-btn h-10 flex flex-col items-center justify-center leading-none text-[#10b981]"
              title="Play / Pause"
            >
              <span className="text-[9px] font-bold">{isPlaying ? "PAUSE" : "PLAY"}</span>
              <span className="text-[7px] opacity-75">{isPlaying ? "❚❚" : "▶"}</span>
            </button>
          </div>
          
        </div>

        {/* Bottom Presets Row */}
        <div className="w-full h-10 bg-gradient-to-t from-transparent to-black/20 flex items-center justify-between px-3 gap-2 pointer-events-auto mt-0.5">
          {/* Small bottom left keys: DSP OFF, DSP DEMO */}
          <div className="flex gap-1.5">
            <button 
              onClick={() => {
                setBassBoost(prev => !prev);
              }}
              className="px-2 py-1 text-[8px] font-bold border border-neutral-600 rounded bg-gradient-to-b from-neutral-800 to-neutral-900 text-neutral-300 active:scale-95 transition-transform"
              title="Toggle DSP Off"
            >
              DSP OFF
            </button>
            <button 
              onClick={() => {
                setThemeColor('green');
                setEqPreset('ROCK');
                setBassBoost(true);
              }}
              className="px-2 py-1 text-[8px] font-bold border border-neutral-600 rounded bg-gradient-to-b from-neutral-800 to-neutral-900 text-[#22d3ee] active:scale-95 transition-transform"
              title="DSP Demo"
            >
              DEMO
            </button>
          </div>

          {/* Presets 1 to 6 */}
          <div className="flex-1 flex justify-center gap-2 max-w-[440px]">
            <button onClick={() => setVfdScrollMode(p => !p)} className="dpx-preset-btn flex-1 py-1.5 text-[10px] font-bold text-center" title="Toggle Title Scroll">
              1 TIME
            </button>
            <button onClick={() => setThemeColor(prev => prev === 'blue' ? 'cyan' : prev === 'cyan' ? 'green' : prev === 'green' ? 'orange' : 'blue')} className="dpx-preset-btn flex-1 py-1.5 text-[10px] font-bold text-center" title="Cycle Theme Colors">
              2 SCN
            </button>
            <button onClick={() => setBassBoost(p => !p)} className={`dpx-preset-btn flex-1 py-1.5 text-[10px] font-bold text-center ${bassBoost ? 'border-emerald-500 text-emerald-600' : ''}`} title="Toggle Heavy Bass (LOUD)">
              3 RDM
            </button>
            <button 
              onClick={() => {
                const presets = ['FLAT', 'ROCK', 'POP', 'JAZZ', 'VOCAL'];
                const nextIdx = (presets.indexOf(eqPreset) + 1) % presets.length;
                setEqPreset(presets[nextIdx]);
              }} 
              className="dpx-preset-btn flex-1 py-1.5 text-[10px] font-bold text-center" 
              title="Cycle Equalizer Presets"
            >
              4 REF
            </button>
            <button 
              onClick={() => {
                setAnalyzerStyle(prev => prev === 'BARS' ? 'PEAK' : prev === 'PEAK' ? 'WAVE' : 'BARS');
              }} 
              className="dpx-preset-btn flex-1 py-1.5 text-[10px] font-bold text-center"
              title="Change Visualizer Drawing Style"
            >
              5 D.SCRN
            </button>
            <button 
              onClick={async () => {
                const newMute = !isMuted;
                setIsMuted(newMute);
                try {
                  await invoke("set_system_volume", { level: newMute ? 0 : volume });
                } catch (e) {}
              }} 
              className={`dpx-preset-btn flex-1 py-1.5 text-[10px] font-bold text-center ${isMuted ? 'text-red-500 font-bold' : ''}`} 
              title="Mute volume"
            >
              6 M.RDM
            </button>
          </div>

          {/* Translucent Green-Cyan SRC Button */}
          <button 
            onClick={handlePlayPause}
            className="w-16 h-7 text-[9px] font-black tracking-wider uppercase translucent-src rounded flex items-center justify-center shadow-md active:scale-95 transition-transform"
            title="Source Play / Pause"
          >
            SRC
          </button>
        </div>
      </div>
    </div>
  );
}
