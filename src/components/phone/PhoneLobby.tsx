import React, { useState } from 'react';
import { TeamId, TEAMS } from '../../types.ts';
import { CheckCircle2, Wifi, AlertTriangle, Clock } from 'lucide-react';
import { sound } from '../../audio/soundEngine.ts';

interface PhoneLobbyProps {
  roomCode: string;
  slot: number;
  playerName: string;
  playerTeam: TeamId;
  isReady: boolean;
  isConnected: boolean;
  onUpdateProfile: (name: string, team: TeamId) => void;
  onToggleReady: (ready: boolean) => void;
  onDisconnect: () => void;
}

export const PhoneLobby: React.FC<PhoneLobbyProps> = ({
  roomCode,
  slot,
  playerName,
  playerTeam,
  isReady,
  isConnected,
  onUpdateProfile,
  onToggleReady,
  onDisconnect,
}) => {
  const [name, setName] = useState(playerName);
  const [team, setTeam] = useState<TeamId>(playerTeam);

  const handleNameChange = (val: string) => {
    setName(val);
    onUpdateProfile(val.trim() || `Player ${slot}`, team);
  };

  const handleTeamSelect = (newTeam: TeamId) => {
    sound.playClick();
    setTeam(newTeam);
    onUpdateProfile(name.trim() || `Player ${slot}`, newTeam);
  };

  const handleToggleReadyClick = () => {
    sound.playClick();
    onToggleReady(!isReady);
  };

  const teamDef = TEAMS[team] || TEAMS.RED;

  return (
    <div
      id="phone-lobby-screen"
      className="fixed inset-0 bg-[#090d16] text-white flex flex-col p-6 select-none overflow-y-auto items-center justify-center"
    >
      <div className="absolute inset-0 opacity-15 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none" />

      <div className="relative max-w-sm w-full flex flex-col space-y-4 z-10">
        {/* Connection Status Badge */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Wifi className={`w-4 h-4 ${isConnected ? 'text-emerald-400' : 'text-red-400 animate-pulse'}`} />
            <span className="text-xs font-mono font-bold text-slate-400">
              غرفة: <span className="text-cyan-400 font-['Chakra_Petch']">{roomCode}</span>
            </span>
          </div>

          <div className="px-2.5 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-[11px] font-bold text-slate-300 font-mono">
            اللاعب {slot} • P{slot}
          </div>
        </div>

        {/* Connected confirmation or Host Disconnected Alert */}
        {isConnected ? (
          <div className="p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs flex items-center justify-center gap-2 font-bold">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>تم الاتصال بالتلفاز ✓ (Connected)</span>
          </div>
        ) : (
          <div className="p-3.5 rounded-2xl bg-amber-950/40 border border-amber-500/50 text-amber-200 text-xs flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
            <div>
              <span className="font-bold block">انقطع اتصال التلفاز</span>
              <span className="text-[11px] text-amber-300/90">في انتظار المضيف... جارٍ إعادة المحاولة تلقائياً</span>
            </div>
          </div>
        )}

        {/* Player Profile Card */}
        <div
          className="p-5 rounded-3xl bg-slate-900/90 border-2 shadow-2xl transition-all space-y-4"
          style={{
            borderColor: teamDef.color,
            boxShadow: `0 0 25px ${teamDef.glowHex}`,
          }}
        >
          {/* Name Input */}
          <div>
            <label className="text-[11px] uppercase font-bold text-slate-400 block mb-1">
              اسم اللاعب • Name
            </label>
            <input
              id="input-phone-player-name"
              type="text"
              value={name}
              maxLength={14}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder={`Player ${slot}`}
              className="w-full px-4 py-3 rounded-2xl bg-slate-950 border-2 border-slate-700 text-white font-bold text-base focus:outline-none focus:border-cyan-400"
            />
          </div>

          {/* Team Selection: RED vs BLUE */}
          <div className="pt-2 border-t border-slate-800">
            <label className="text-[11px] uppercase font-bold text-slate-400 block mb-2">
              اختر فريقك • Team
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              {(['RED', 'BLUE'] as TeamId[]).map((tId) => {
                const isSelected = team === tId;
                const tDef = TEAMS[tId];
                return (
                  <button
                    key={tId}
                    id={`btn-team-select-${tId}`}
                    type="button"
                    onClick={() => handleTeamSelect(tId)}
                    className={`py-3 rounded-2xl font-black text-sm transition-all cursor-pointer border-2 flex items-center justify-center gap-2 ${
                      isSelected
                        ? 'border-white text-white shadow-lg'
                        : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:text-white'
                    }`}
                    style={{
                      backgroundColor: isSelected ? tDef.color : undefined,
                    }}
                  >
                    <span>{tId === 'RED' ? 'أحمر • RED' : 'أزرق • BLUE'}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Ready Toggle Button */}
        <button
          id="btn-phone-toggle-ready"
          onClick={handleToggleReadyClick}
          className={`w-full py-4 rounded-2xl font-black text-lg font-['Chakra_Petch'] tracking-wider transition-all shadow-xl cursor-pointer flex items-center justify-center gap-2 active:scale-[0.98] ${
            isReady
              ? 'bg-emerald-600 text-white shadow-emerald-500/30'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
          }`}
        >
          {isReady ? (
            <>
              <CheckCircle2 className="w-5 h-5 text-white" />
              <span>أنا جاهز ✓ (READY)</span>
            </>
          ) : (
            <>
              <Clock className="w-5 h-5 text-slate-400" />
              <span>اضغط عندما تكون جاهزاً (CLICK READY)</span>
            </>
          )}
        </button>

        {/* Informational Notice */}
        <div className="text-center p-3 rounded-2xl bg-slate-900/60 border border-slate-800/80 text-xs text-slate-400 leading-relaxed">
          <p>عندما يبدأ المضيف اللعبة على التلفاز، ستتحول هذه الشاشة تلقائياً إلى جهاز التحكم اللاسلكي.</p>
        </div>

        {/* Disconnect button */}
        <button
          id="btn-phone-disconnect"
          onClick={onDisconnect}
          className="text-xs text-slate-500 hover:text-red-400 transition-colors text-center cursor-pointer pt-1"
        >
          مغادرة الغرفة • Leave Room
        </button>
      </div>
    </div>
  );
};
