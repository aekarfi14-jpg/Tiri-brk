import React, { useState, useRef, useEffect } from 'react';
import jsQR from 'jsqr';
import {
  Camera,
  KeyRound,
  ArrowRight,
  RefreshCw,
  Smartphone,
  Search,
  Wifi,
  Tv,
  CheckCircle2,
  AlertCircle,
  Radio,
} from 'lucide-react';
import { sound } from '../../audio/soundEngine.ts';
import { discoverLanHosts, DiscoveredHost, isNativeAndroid } from '../../network/nativeServer.ts';

export interface PhoneConnectionPayload {
  roomCode: string;
  host?: string;
  port?: number;
}

interface PhoneScannerProps {
  initialCode?: string;
  connectionError?: string | null;
  isConnecting?: boolean;
  onConnect: (payload: PhoneConnectionPayload) => void;
  onSwitchToTv: () => void;
}

export const PhoneScanner: React.FC<PhoneScannerProps> = ({
  initialCode = '',
  connectionError,
  isConnecting = false,
  onConnect,
  onSwitchToTv,
}) => {
  const [activeTab, setActiveTab] = useState<'scan' | 'search' | 'manual'>('scan');
  const [manualCode, setManualCode] = useState(initialCode);
  const [manualHost, setManualHost] = useState('');
  const [manualPort, setManualPort] = useState('3000');

  // Camera states
  const [hasCamera, setHasCamera] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Discovery states
  const [isSearchingLan, setIsSearchingLan] = useState(false);
  const [discoveredHosts, setDiscoveredHosts] = useState<DiscoveredHost[]>([]);
  const [searchAttempted, setSearchAttempted] = useState(false);

  // Auto-connect if initial code was provided in URL (?mode=phone&room=XXXX&host=YYYY)
  useEffect(() => {
    if (initialCode && initialCode.trim().length >= 3) {
      const urlParams = new URLSearchParams(window.location.search);
      const hostParam = urlParams.get('host') || undefined;
      const portParam = urlParams.get('port') ? Number(urlParams.get('port')) : undefined;
      onConnect({
        roomCode: initialCode.toUpperCase().trim(),
        host: hostParam,
        port: portParam,
      });
    }
  }, [initialCode, onConnect]);

  // Camera stream for scanning QR code
  useEffect(() => {
    if (activeTab !== 'scan') return;

    let stream: MediaStream | null = null;
    let animId: number;

    const startCamera = async () => {
      try {
        setCameraError(null);
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute('playsinline', 'true');
          await videoRef.current.play();
          scanFrame();
        }
      } catch (err: any) {
        console.warn('Camera access error:', err);
        setHasCamera(false);
        setCameraError('Camera unavailable or permission denied. Please use LAN Search or manual entry.');
      }
    };

    const scanFrame = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
        animId = requestAnimationFrame(scanFrame);
        return;
      }

      const ctx = canvas.getContext('2d');
      if (ctx) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert',
        });

        if (code && code.data) {
          sound.playClick();
          const raw = code.data.trim();

          // 1. Try parsing JSON payload: {"host":"192.168.1.25","port":3000,"room":"ABCD"}
          try {
            const parsed = JSON.parse(raw);
            if (parsed && (parsed.room || parsed.roomCode)) {
              onConnect({
                roomCode: (parsed.room || parsed.roomCode).toUpperCase().trim(),
                host: parsed.host || undefined,
                port: parsed.port ? Number(parsed.port) : 3000,
              });
              return;
            }
          } catch {
            // Not JSON
          }

          // 2. Try parsing URL: ws://192.168.1.25:3000/ws?room=ABCD or http://.../?room=ABCD&host=...
          try {
            const url = new URL(raw);
            const roomParam = url.searchParams.get('room');
            const hostParam = url.searchParams.get('host') || url.hostname;
            const portParam = url.port ? Number(url.port) : 3000;
            if (roomParam) {
              onConnect({
                roomCode: roomParam.toUpperCase().trim(),
                host: hostParam && hostParam !== 'localhost' ? hostParam : undefined,
                port: portParam,
              });
              return;
            }
          } catch {
            // Not URL
          }

          // 3. Raw room code fallback
          if (raw.length >= 3 && raw.length <= 8) {
            onConnect({ roomCode: raw.toUpperCase() });
            return;
          }
        }
      }

      animId = requestAnimationFrame(scanFrame);
    };

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      cancelAnimationFrame(animId);
    };
  }, [activeTab, onConnect]);

  // LAN Discovery Handler (UDP Broadcast on LAN / Hotspot)
  const handleStartLanDiscovery = async () => {
    sound.playClick();
    setIsSearchingLan(true);
    setSearchAttempted(true);
    try {
      const found = await discoverLanHosts();
      setDiscoveredHosts(found);
    } catch (err) {
      console.warn('Discovery error:', err);
    } finally {
      setIsSearchingLan(false);
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = manualCode.toUpperCase().trim();
    if (clean.length >= 3) {
      sound.playClick();
      onConnect({
        roomCode: clean,
        host: manualHost.trim() || undefined,
        port: manualPort ? Number(manualPort) : 3000,
      });
    }
  };

  return (
    <div
      id="phone-scanner-screen"
      className="fixed inset-0 bg-[#090d16] text-white flex flex-col p-5 select-none overflow-y-auto items-center justify-center"
    >
      <div className="absolute inset-0 opacity-15 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none" />

      <div className="relative max-w-sm w-full flex flex-col items-center text-center space-y-4 z-10">
        {/* Header */}
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold">
            <Smartphone className="w-3.5 h-3.5" />
            WIRELESS GAMEPAD • CONTROLLER
          </div>
          <h1 className="text-2xl md:text-3xl font-black font-['Chakra_Petch'] tracking-wide">
            JOIN TV SESSION
          </h1>
          <p className="text-slate-400 text-xs leading-relaxed">
            Connect to the TV host on your local Wi-Fi or Hotspot network. Zero internet required!
          </p>
        </div>

        {/* Global Connection / Error Banner */}
        {connectionError && (
          <div className="w-full p-3 rounded-2xl bg-red-500/15 border border-red-500/40 text-red-300 text-xs flex items-center gap-2 text-left">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <div className="flex-1">
              <span className="font-bold block">Connection Notice:</span>
              <span>{connectionError}</span>
            </div>
          </div>
        )}

        {/* Connecting Spinner Status */}
        {isConnecting && (
          <div className="w-full p-3.5 rounded-2xl bg-cyan-500/15 border border-cyan-500/40 text-cyan-200 text-xs flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
            <span className="font-bold">Connecting to TV Host across LAN...</span>
          </div>
        )}

        {/* 3 Connection Modes Tabs */}
        <div className="w-full grid grid-cols-3 gap-1 p-1 bg-slate-900 border border-slate-800 rounded-2xl">
          <button
            type="button"
            onClick={() => setActiveTab('scan')}
            className={`py-2 px-1 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'scan'
                ? 'bg-emerald-600 text-white shadow-lg'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            Scan QR
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('search');
              if (!searchAttempted) handleStartLanDiscovery();
            }}
            className={`py-2 px-1 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'search'
                ? 'bg-cyan-600 text-white shadow-lg'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            LAN Search
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('manual')}
            className={`py-2 px-1 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'manual'
                ? 'bg-purple-600 text-white shadow-lg'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            Room Code
          </button>
        </div>

        {/* TAB 1: Camera QR Scanner */}
        {activeTab === 'scan' && (
          <div className="w-full flex flex-col items-center space-y-3">
            <div className="relative w-full aspect-square max-w-[260px] bg-slate-900 rounded-3xl overflow-hidden border-2 border-slate-700 shadow-[0_0_30px_rgba(0,0,0,0.6)] flex items-center justify-center">
              {hasCamera ? (
                <>
                  <video
                    ref={videoRef}
                    className="w-full h-full object-cover"
                    playsInline
                    muted
                  />
                  <canvas ref={canvasRef} className="hidden" />

                  {/* Scanning reticle */}
                  <div className="absolute inset-8 border-2 border-dashed border-emerald-400/80 rounded-2xl pointer-events-none animate-pulse flex items-center justify-center">
                    <div className="w-10 h-0.5 bg-emerald-400 shadow-[0_0_12px_#34d399] animate-bounce" />
                  </div>
                </>
              ) : (
                <div className="p-5 flex flex-col items-center justify-center text-center space-y-2">
                  <Camera className="w-10 h-10 text-slate-600" />
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {cameraError || 'Camera unavailable'}
                  </p>
                </div>
              )}
            </div>
            <span className="text-[11px] text-slate-400">
              Point at the QR on TV to instantly receive host IP, port & room.
            </span>
          </div>
        )}

        {/* TAB 2: LAN Discovery / Auto Search */}
        {activeTab === 'search' && (
          <div className="w-full bg-slate-900/90 border border-slate-800 rounded-3xl p-5 flex flex-col space-y-4 text-left">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wifi className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-bold text-slate-200">
                  DISCOVER LOCAL HOSTS
                </span>
              </div>
              <button
                type="button"
                onClick={handleStartLanDiscovery}
                disabled={isSearchingLan}
                className="px-3 py-1.5 rounded-xl bg-cyan-600/30 hover:bg-cyan-600/50 border border-cyan-500/40 text-xs font-bold text-cyan-300 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSearchingLan ? 'animate-spin' : ''}`} />
                {isSearchingLan ? 'Searching...' : 'Search LAN'}
              </button>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Broadcasts local discovery packets over your Wi-Fi or Hotspot to find the TV host automatically.
            </p>

            {/* Discovery results list */}
            {discoveredHosts.length > 0 ? (
              <div className="space-y-2">
                {discoveredHosts.map((h, i) => (
                  <button
                    key={`${h.host}-${h.port}-${i}`}
                    type="button"
                    onClick={() => {
                      sound.playClick();
                      onConnect({
                        roomCode: h.room || '7942',
                        host: h.host,
                        port: h.port,
                      });
                    }}
                    className="w-full p-3.5 rounded-2xl bg-cyan-950/40 border-2 border-cyan-500/50 hover:border-cyan-400 transition-all flex items-center justify-between text-left cursor-pointer shadow-lg hover:shadow-cyan-500/20"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-cyan-500/20 flex items-center justify-center text-cyan-300">
                        <Tv className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-white flex items-center gap-1.5">
                          <span>TV HOST FOUND</span>
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        </div>
                        <div className="text-xs text-slate-400 font-mono">
                          {h.host}:{h.port} • Room {h.room || 'READY'}
                        </div>
                      </div>
                    </div>
                    <ArrowRight className="w-5 h-5 text-cyan-400" />
                  </button>
                ))}
              </div>
            ) : searchAttempted && !isSearchingLan ? (
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-center space-y-2">
                <Radio className="w-6 h-6 text-slate-600 mx-auto" />
                <p className="text-xs text-slate-400">
                  No TV host responded yet. Ensure your phone and TV are connected to the same Wi-Fi or Hotspot, or scan the QR code.
                </p>
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-center space-y-2">
                <RefreshCw className="w-5 h-5 text-cyan-400 animate-spin mx-auto" />
                <p className="text-xs text-cyan-300">
                  Listening for TV Host discovery packets...
                </p>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: Fallback Manual Entry (Room Code + Optional IP) */}
        {activeTab === 'manual' && (
          <div className="w-full bg-slate-900/90 border border-slate-800 rounded-3xl p-5 text-left space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
              <KeyRound className="w-4 h-4 text-purple-400" />
              <span>ENTER ROOM CODE & HOST IP</span>
            </div>

            <form onSubmit={handleManualSubmit} className="space-y-3">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1 font-semibold">
                  ROOM CODE (Shown on TV)
                </label>
                <input
                  id="input-manual-room-code"
                  type="text"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value.toUpperCase())}
                  placeholder="e.g. 7942"
                  maxLength={8}
                  className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-center text-lg font-bold tracking-widest focus:outline-none focus:border-purple-400"
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1 font-semibold">
                  HOST IP ADDRESS (Optional on same LAN)
                </label>
                <div className="flex gap-2">
                  <input
                    id="input-manual-host-ip"
                    type="text"
                    value={manualHost}
                    onChange={(e) => setManualHost(e.target.value)}
                    placeholder="e.g. 192.168.1.25 or 192.168.43.1"
                    className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:border-purple-400"
                  />
                  <input
                    id="input-manual-host-port"
                    type="number"
                    value={manualPort}
                    onChange={(e) => setManualPort(e.target.value)}
                    placeholder="3000"
                    className="w-20 px-2 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-xs text-center focus:outline-none focus:border-purple-400"
                  />
                </div>
                <span className="text-[10px] text-slate-500 block mt-1">
                  Tip: If using Phone Hotspot, TV host IP is usually 192.168.43.X or 192.168.43.1.
                </span>
              </div>

              <button
                id="btn-submit-room-code"
                type="submit"
                disabled={manualCode.trim().length < 3}
                className="w-full py-3.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-black text-sm font-['Chakra_Petch'] tracking-wider transition-all disabled:opacity-40 cursor-pointer flex items-center justify-center gap-2 shadow-lg hover:shadow-purple-500/30"
              >
                <span>CONNECT CONTROLLER</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </div>
        )}

        {/* Switch back to TV mode link */}
        <button
          id="btn-scanner-switch-tv"
          onClick={onSwitchToTv}
          className="text-xs text-slate-500 hover:text-slate-300 transition-colors cursor-pointer pt-2"
        >
          Need to host the game on this device? Switch to TV Mode
        </button>
      </div>
    </div>
  );
};
