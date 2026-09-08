import React, { useState, useRef, useEffect } from 'react';
import jsQR from 'jsqr';
import { Camera, KeyRound, ArrowRight, AlertCircle, RefreshCw, Smartphone } from 'lucide-react';
import { sound } from '../../audio/soundEngine.ts';

interface PhoneScannerProps {
  initialCode?: string;
  onConnect: (roomCode: string) => void;
  onSwitchToTv: () => void;
}

export const PhoneScanner: React.FC<PhoneScannerProps> = ({
  initialCode = '',
  onConnect,
  onSwitchToTv,
}) => {
  const [manualCode, setManualCode] = useState(initialCode);
  const [hasCamera, setHasCamera] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Auto-connect if initial code was provided in URL (?mode=phone&room=XXXX)
  useEffect(() => {
    if (initialCode && initialCode.trim().length >= 3) {
      onConnect(initialCode.toUpperCase().trim());
    }
  }, [initialCode, onConnect]);

  // Camera stream for scanning QR code
  useEffect(() => {
    let stream: MediaStream | null = null;
    let animId: number;

    const startCamera = async () => {
      try {
        setCameraError(null);
        setIsScanning(true);
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
        setCameraError('Camera unavailable or permission denied. Please enter the room code manually.');
        setIsScanning(false);
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
          // Extract room parameter from URL or direct code
          let extractedCode = code.data.trim();
          try {
            const url = new URL(code.data);
            const roomParam = url.searchParams.get('room');
            if (roomParam) extractedCode = roomParam;
          } catch {
            // Not a URL, treat as raw code
          }

          if (extractedCode) {
            onConnect(extractedCode.toUpperCase());
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
  }, [onConnect]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = manualCode.toUpperCase().trim();
    if (clean.length >= 3) {
      sound.playClick();
      onConnect(clean);
    }
  };

  return (
    <div
      id="phone-scanner-screen"
      className="fixed inset-0 bg-[#090d16] text-white flex flex-col p-6 select-none overflow-y-auto items-center justify-center"
    >
      <div className="absolute inset-0 opacity-15 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none" />

      <div className="relative max-w-sm w-full flex flex-col items-center text-center space-y-6 z-10">
        {/* Header */}
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold">
            <Smartphone className="w-3.5 h-3.5" />
            PHONE GAMEPAD
          </div>
          <h1 className="text-3xl font-black font-['Chakra_Petch'] tracking-wide">
            JOIN TV SESSION
          </h1>
          <p className="text-slate-400 text-xs md:text-sm">
            Point your camera at the QR code shown on the TV screen.
          </p>
        </div>

        {/* Camera Viewfinder */}
        <div className="relative w-full aspect-square max-w-[280px] bg-slate-900 rounded-3xl overflow-hidden border-2 border-slate-700 shadow-[0_0_40px_rgba(0,0,0,0.6)] flex items-center justify-center">
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
                <div className="w-12 h-0.5 bg-emerald-400 shadow-[0_0_12px_#34d399] animate-bounce" />
              </div>
            </>
          ) : (
            <div className="p-6 flex flex-col items-center justify-center text-center space-y-3">
              <Camera className="w-12 h-12 text-slate-600" />
              <p className="text-xs text-slate-400 leading-relaxed">
                {cameraError || 'Camera unavailable'}
              </p>
            </div>
          )}
        </div>

        {/* Fallback Manual Room Code Entry */}
        <div className="w-full bg-slate-900/90 border border-slate-800 rounded-2xl p-4 text-left space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
            <KeyRound className="w-4 h-4 text-cyan-400" />
            <span>OR ENTER ROOM CODE MANUALLY</span>
          </div>

          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <input
              id="input-manual-room-code"
              type="text"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value.toUpperCase())}
              placeholder="e.g. 7942"
              maxLength={8}
              className="flex-1 px-4 py-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-center text-lg font-bold tracking-widest focus:outline-none focus:border-cyan-400"
            />
            <button
              id="btn-submit-room-code"
              type="submit"
              disabled={manualCode.trim().length < 3}
              className="px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-all disabled:opacity-40 cursor-pointer flex items-center justify-center"
            >
              <ArrowRight className="w-5 h-5" />
            </button>
          </form>
        </div>

        {/* Switch back to TV mode link */}
        <button
          id="btn-scanner-switch-tv"
          onClick={onSwitchToTv}
          className="text-xs text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
        >
          Need to host the game on this device? Switch to TV Mode
        </button>
      </div>
    </div>
  );
};
