import React, { useState } from 'react';
import { TeamId, TEAMS } from '../../types.ts';
import { Users, CheckCircle2, Shield, Edit3, Wifi, AlertTriangle } from 'lucide-react';
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
  const [isEditing, setIsEditing] = useState(false);

  const handleSaveProfile = () => {
    sound.playClick();
    onUpdateProfile(name.trim() || `Player ${slot}`, team);
    setIsEditing(false);
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

      <div className="relative max-w-sm w-full flex flex-col space-y-5 z-10">
        {/* Connection & Room Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Wifi className={`w-4 h-4 ${isConnected ? 'text-emerald-400' : 'text-red-400 animate-pulse'}`} />
            <span className="text-xs font-mono font-bold text-slate-400">
              ROOM: <span className="text-cyan-400 font-['Chakra_Petch']">{roomCode}</span>
            </span>
          </div>

          <div className="px-2.5 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-[11px] font-bold text-slate-300">
            SLOT {slot}
          </div>
        </div>

        {/* Disconnected Warning */}
        {!isConnected && (
          <div className="p-3.5 rounded-2xl bg-red-950/40 border border-red-500/40 text-red-200 text-xs flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
            <span>Connection lost to TV session. Reconnecting automatically...</span>
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
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              CONTROLLER PROFILE
            </span>
            <button
              id="btn-phone-edit-toggle"
              onClick={() => setIsEditing(!isEditing)}
              className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-1 cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5" />
              {isEditing ? 'Close' : 'Edit'}
            </button>
          </div>

          {isEditing ? (
            <div className="space-y-3">
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400">Display Name</label>
                <input
                  id="input-phone-player-name"
                  type="text"
                  value={name}
                  maxLength={14}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-bold text-sm focus:outline-none focus:border-cyan-400"
                />
              </div>

              <button
                id="btn-phone-save-name"
                onClick={handleSaveProfile}
                className="w-full py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs cursor-pointer"
              >
                Save Name
              </button>
            </div>
          ) : (
            <div>
              <h2 className="text-2xl font-black font-['Chakra_Petch'] text-white truncate">
                {name || `Player ${slot}`}
              </h2>
              <span
                className="text-xs font-bold px-2.5 py-0.5 rounded-full inline-block mt-1"
                style={{
                  backgroundColor: `${teamDef.color}25`,
                  color: teamDef.lightColor,
                  border: `1px solid ${teamDef.color}50`,
                }}
              >
                {teamDef.name}
              </span>
            </div>
          )}

          {/* Team Selection */}
          <div className="pt-2 border-t border-slate-800">
            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2">
              Select Your Team
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['RED', 'BLUE', 'GREEN'] as TeamId[]).map((tId) => {
                const isSelected = team === tId;
                const tDef = TEAMS[tId];
                return (
                  <button
                    key={tId}
                    id={`btn-team-select-${tId}`}
                    type="button"
                    onClick={() => handleTeamSelect(tId)}
                    className={`py-2 rounded-xl font-bold text-xs transition-all cursor-pointer border ${
                      isSelected
                        ? 'border-white shadow-lg text-white'
                        : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:text-white'
                    }`}
                    style={{
                      backgroundColor: isSelected ? tDef.color : undefined,
                    }}
                  >
                    {tId}
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
          <CheckCircle2 className="w-5 h-5" />
          {isReady ? 'READY FOR MATCH' : 'CLICK WHEN READY'}
        </button>

        {/* Informational TV Host notice */}
        <div className="text-center p-3 rounded-2xl bg-slate-900/60 border border-slate-800/80 text-xs text-slate-400 leading-relaxed">
          <p>The TV screen will launch the match. When started, this screen will transform into your wireless gamepad.</p>
        </div>

        {/* Disconnect button */}
        <button
          id="btn-phone-disconnect"
          onClick={onDisconnect}
          className="text-xs text-slate-500 hover:text-red-400 transition-colors text-center cursor-pointer pt-2"
        >
          Disconnect / Leave Session
        </button>
      </div>
    </div>
  );
};
