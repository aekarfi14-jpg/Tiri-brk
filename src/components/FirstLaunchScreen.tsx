import React, { useState, useEffect } from 'react';
import { Tv, Smartphone, Shield, Sparkles, Volume2, VolumeX } from 'lucide-react';
import { sound } from '../audio/soundEngine.ts';

interface FirstLaunchScreenProps {
  onSelectMode: (mode: 'tv' | 'phone') => void;
}

export const FirstLaunchScreen: React.FC<FirstLaunchScreenProps> = ({ onSelectMode }) => {
  const [showSplash, setShowSplash] = useState(true);
  const [isMuted, setIsMuted] = useState(sound.getMuted());

  useEffect(() => {
    // Show splash screen for 1.5 seconds then transition to mode selection
    const timer = setTimeout(() => {
      setShowSplash(false);
      sound.playClick();
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  const handleModeClick = (mode: 'tv' | 'phone') => {
    sound.playClick();
    onSelectMode(mode);
  };

  const toggleSound = () => {
    const muted = sound.toggleMute();
    setIsMuted(muted);
  };

  if (showSplash) {
    return (
      <div
        id="splash-screen"
        className="fixed inset-0 bg-[#090d16] flex flex-col items-center justify-center p-6 text-white select-none z-50 overflow-hidden"
      >
        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:24px_24px]" />
        <div className="relative flex flex-col items-center text-center space-y-4 animate-in fade-in zoom-in-95 duration-700">
          <div className="p-4 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/40 shadow-[0_0_35px_rgba(56,189,248,0.25)]">
            <Shield className="w-16 h-16 text-cyan-400 animate-pulse" />
          </div>
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.3em] text-cyan-400 font-bold">
              LAN MULTIPLAYER SHOOTER
            </p>
            <h1 className="text-4xl md:text-5xl font-black tracking-tight font-['Chakra_Petch'] bg-gradient-to-r from-white via-slate-100 to-cyan-300 bg-clip-text text-transparent">
              TIRI BRK
            </h1>
            <p className="text-slate-400 text-sm">لعبة إطلاق نار محلية • التلفاز شاشة والهاتف يد تحكم</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      id="mode-select-screen"
      className="fixed inset-0 bg-[#090d16] flex flex-col items-center justify-center p-4 md:p-8 text-white select-none overflow-y-auto"
    >
      <div className="absolute inset-0 opacity-15 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:32px_32px]" />

      {/* Audio Mute toggle in top corner */}
      <button
        id="btn-toggle-sound"
        onClick={toggleSound}
        className="absolute top-6 right-6 p-3 rounded-xl bg-slate-800/80 border border-slate-700 hover:border-cyan-500 text-slate-300 hover:text-white transition-all cursor-pointer z-10"
        title={isMuted ? 'Unmute Sound' : 'Mute Sound'}
      >
        {isMuted ? <VolumeX className="w-5 h-5 text-red-400" /> : <Volume2 className="w-5 h-5 text-cyan-400" />}
      </button>

      <div className="relative max-w-2xl w-full flex flex-col items-center text-center space-y-8 z-10">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-semibold tracking-wider">
            <Sparkles className="w-3.5 h-3.5" />
            TIRI BRK • تيري برك
          </div>
          <h1 className="text-4xl md:text-6xl font-black font-['Chakra_Petch'] tracking-wide">
            اختر دور الجهاز
          </h1>
          <p className="text-slate-400 text-sm md:text-base max-w-md mx-auto">
            يعرض التلفاز شاشة اللعبة والخريطة، وتعمل الهواتف كأجهزة تحكم لاسلكية عبر شبكة Wi-Fi المحلية.
          </p>
        </div>

        {/* Two Large Choices: TV vs Phone */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-xl">
          {/* TV Choice */}
          <button
            id="btn-select-tv-mode"
            onClick={() => handleModeClick('tv')}
            className="group relative flex flex-col items-center justify-center p-8 rounded-3xl bg-gradient-to-b from-slate-800/90 to-slate-900/90 border-2 border-slate-700 hover:border-cyan-400 hover:shadow-[0_0_40px_rgba(56,189,248,0.3)] transition-all duration-300 text-left active:scale-[0.98] cursor-pointer"
          >
            <div className="p-5 rounded-2xl bg-cyan-500/10 group-hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 mb-5 transition-colors">
              <Tv className="w-12 h-12 group-hover:scale-110 transition-transform" />
            </div>
            <div className="text-center">
              <span className="text-2xl font-bold font-['Chakra_Petch'] tracking-wide block mb-1 text-white group-hover:text-cyan-300">
                📺 شاشة التلفاز (TV)
              </span>
              <p className="text-xs text-slate-400 leading-relaxed">
                تشغيل خريطة اللعبة ورمز QR واستضافة المباراة محلياً.
              </p>
            </div>
            <div className="mt-6 px-4 py-1.5 rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 text-xs font-bold tracking-wider uppercase">
              Host Screen
            </div>
          </button>

          {/* PHONE Choice */}
          <button
            id="btn-select-phone-mode"
            onClick={() => handleModeClick('phone')}
            className="group relative flex flex-col items-center justify-center p-8 rounded-3xl bg-gradient-to-b from-slate-800/90 to-slate-900/90 border-2 border-slate-700 hover:border-emerald-400 hover:shadow-[0_0_40px_rgba(16,185,129,0.3)] transition-all duration-300 text-left active:scale-[0.98] cursor-pointer"
          >
            <div className="p-5 rounded-2xl bg-emerald-500/10 group-hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 mb-5 transition-colors">
              <Smartphone className="w-12 h-12 group-hover:scale-110 transition-transform" />
            </div>
            <div className="text-center">
              <span className="text-2xl font-bold font-['Chakra_Petch'] tracking-wide block mb-1 text-white group-hover:text-emerald-300">
                📱 هاتف التحكم (Controller)
              </span>
              <p className="text-xs text-slate-400 leading-relaxed">
                مسح رمز QR أو إدخال الكود وتحويل الهاتف إلى يد تحكم لاسلكية.
              </p>
            </div>
            <div className="mt-6 px-4 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold tracking-wider uppercase">
              Gamepad Controller
            </div>
          </button>
        </div>

        <div className="text-xs text-slate-500 flex items-center gap-2">
          <span>Tiri BRK • تيري برك</span>
          <span>•</span>
          <span>100% LAN Local Offline</span>
        </div>
      </div>
    </div>
  );
};
