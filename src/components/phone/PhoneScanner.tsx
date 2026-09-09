import React, { useState, useRef, useEffect } from 'react';
import jsQR from 'jsqr';
import {
  Camera,
  ArrowRight,
  RefreshCw,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  Wifi,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { sound } from '../../audio/soundEngine.ts';

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
  const [code, setCode] = useState(initialCode);
  const [isScanning, setIsScanning] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [manualHost, setManualHost] = useState('');
  const [manualPort, setManualPort] = useState('3000');

  // Camera states
  const [hasCamera, setHasCamera] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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
    if (!isScanning) return;

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
        setCameraError('تعذر الوصول للكاميرا. يمكنك إدخال رمز الغرفة يدوياً.');
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
        const qrResult = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert',
        });

        if (qrResult && qrResult.data) {
          sound.playClick();
          const raw = qrResult.data.trim();

          // 1. Try URL parsing: http://192.168.1.5:3000/?mode=phone&room=A7K3&host=192.168.1.5
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

          // 2. Try JSON parsing: {"host":"192.168.1.5","port":3000,"room":"A7K3"}
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
  }, [isScanning, onConnect]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = code.toUpperCase().trim();
    if (clean.length >= 3) {
      sound.playClick();
      onConnect({
        roomCode: clean,
        host: manualHost.trim() || undefined,
        port: manualPort ? Number(manualPort) : 3000,
      });
    }
  };

  // Convert technical/raw error to clear, friendly user message
  const getFriendlyError = (err: string | null): string => {
    if (!err) return '';
    if (err.includes('full') || err.includes('ممتلئة')) {
      return 'الغرفة ممتلئة بالكامل (الحد الأقصى 4 لاعبين).';
    }
    if (err.includes('not found') || err.includes('inactive') || err.includes('لا يوجد')) {
      return 'لا يوجد مستضيف بهذه الغرفة أو رمز الغرفة غير صحيح.';
    }
    if (err.includes('invalid') || err.includes('رمز الغرفة')) {
      return 'رمز الغرفة غير صحيح. تحقق من الرمز الظاهر على شاشة التلفاز.';
    }
    return 'تأكد أن الهاتف والتلفاز متصلان بنفس شبكة الـ Wi-Fi.';
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
            <span>TIRI BRK CONTROLLER • جهاز التحكم</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-black font-['Chakra_Petch'] tracking-wide text-white">
            انضم إلى جلسة التلفاز
          </h1>
          <p className="text-slate-400 text-xs leading-relaxed">
            اتصل بالتلفاز عبر الشبكة المحلية LAN بدون إنترنت
          </p>
        </div>

        {/* Global Connection / Error Notice */}
        {connectionError && (
          <div className="w-full p-3.5 rounded-2xl bg-red-500/15 border border-red-500/40 text-red-200 text-xs flex items-center gap-2.5 text-right dir-rtl">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <div className="flex-1">
              <span className="font-bold block mb-0.5">تنبيه الاتصال:</span>
              <span>{getFriendlyError(connectionError)}</span>
            </div>
          </div>
        )}

        {/* Connecting Status */}
        {isConnecting && (
          <div className="w-full p-3.5 rounded-2xl bg-cyan-500/15 border border-cyan-500/40 text-cyan-200 text-xs flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
            <span className="font-bold">جارٍ الاتصال بالتلفاز عبر الشبكة المحلية...</span>
          </div>
        )}

        {/* 1. Camera QR Scanner View or Toggle Button */}
        {isScanning ? (
          <div className="w-full flex flex-col items-center space-y-2.5">
            <div className="relative w-full aspect-square max-w-[240px] bg-slate-900 rounded-3xl overflow-hidden border-2 border-emerald-500/60 shadow-[0_0_30px_rgba(16,185,129,0.25)] flex items-center justify-center">
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
                  <div className="absolute inset-6 border-2 border-dashed border-emerald-400/80 rounded-2xl pointer-events-none animate-pulse flex items-center justify-center">
                    <div className="w-10 h-0.5 bg-emerald-400 shadow-[0_0_12px_#34d399] animate-bounce" />
                  </div>
                </>
              ) : (
                <div className="p-4 flex flex-col items-center justify-center text-center space-y-2">
                  <Camera className="w-8 h-8 text-slate-600" />
                  <p className="text-xs text-slate-400">{cameraError || 'الكاميرا غير متاحة'}</p>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400">وجه الكاميرا نحو رمز QR على التلفاز</span>
              <button
                type="button"
                onClick={() => setIsScanning(false)}
                className="text-[11px] text-cyan-400 hover:text-cyan-300 font-bold underline cursor-pointer"
              >
                إيقاف الكاميرا
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setIsScanning(true)}
            className="w-full py-3.5 rounded-2xl bg-slate-900 border-2 border-emerald-500/50 hover:border-emerald-400 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg hover:shadow-emerald-500/20 transition-all cursor-pointer"
          >
            <Camera className="w-5 h-5 text-emerald-400" />
            <span>📷 مسح رمز QR من التلفاز</span>
          </button>
        )}

        {/* Divider */}
        <div className="w-full flex items-center gap-3 my-1">
          <div className="flex-1 h-px bg-slate-800" />
          <span className="text-xs text-slate-500 font-bold uppercase">أو أدخل الكود</span>
          <div className="flex-1 h-px bg-slate-800" />
        </div>

        {/* 2. Room Code Input Form */}
        <form onSubmit={handleManualSubmit} className="w-full bg-slate-900/90 border border-slate-800 rounded-3xl p-5 text-left space-y-4 shadow-xl">
          <div>
            <label className="text-[11px] text-slate-400 block mb-1 font-bold text-center">
              ROOM CODE • رمز الغرفة
            </label>
            <input
              id="input-room-code"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="A7K3"
              maxLength={8}
              className="w-full px-4 py-3 rounded-2xl bg-slate-950 border-2 border-slate-700 text-white font-mono text-center text-2xl font-black tracking-widest focus:outline-none focus:border-cyan-400 shadow-inner"
            />
          </div>

          <button
            id="btn-submit-room-code"
            type="submit"
            disabled={code.trim().length < 3 || isConnecting}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-cyan-500 via-blue-600 to-cyan-500 hover:from-cyan-400 hover:to-cyan-400 text-white font-black text-base font-['Chakra_Petch'] tracking-widest transition-all disabled:opacity-40 cursor-pointer flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(56,189,248,0.3)] active:scale-[0.98]"
          >
            <span>انضمام • JOIN</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          {/* Advanced Network Toggle (Only for rare network isolation cases) */}
          <div className="pt-2 border-t border-slate-800/80">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full flex items-center justify-between text-[11px] text-slate-400 hover:text-slate-300 font-medium cursor-pointer"
            >
              <span>إعدادات متقدمة للـ IP (اختياري)</span>
              {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {showAdvanced && (
              <div className="mt-3 space-y-2 text-xs">
                <input
                  id="input-manual-host-ip"
                  type="text"
                  value={manualHost}
                  onChange={(e) => setManualHost(e.target.value)}
                  placeholder="Host IP (مثلاً: 192.168.1.5)"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
                />
                <input
                  id="input-manual-host-port"
                  type="number"
                  value={manualPort}
                  onChange={(e) => setManualPort(e.target.value)}
                  placeholder="Port (3000)"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
                />
              </div>
            )}
          </div>
        </form>

        {/* Switch back to TV mode link */}
        <button
          id="btn-scanner-switch-tv"
          onClick={onSwitchToTv}
          className="text-xs text-slate-500 hover:text-slate-300 transition-colors cursor-pointer pt-1"
        >
          تريد استضافة اللعبة على هذا الجهاز؟ التبديل إلى وضع التلفاز (TV)
        </button>
      </div>
    </div>
  );
};
