import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import {
  Users,
  Play,
  Copy,
  Check,
  Edit2,
  Trash2,
  Shield,
  Smartphone,
  ExternalLink,
  Volume2,
  VolumeX,
  Radio,
  Bot,
  Zap,
  Wifi,
} from 'lucide-react';
import { PlayerSlotData, TeamId, TEAMS } from '../../types.ts';
import { sound } from '../../audio/soundEngine.ts';

interface TvLobbyProps {
  roomCode: string;
  players: PlayerSlotData[];
  onStartMatch: () => void;
  onStartPracticeMatch?: (botCount: number) => void;
  onUpdatePlayer: (slot: number, name: string, team: TeamId) => void;
  onKickPlayer: (slot: number) => void;
  onAddSimulatedPlayer: () => void;
  onOpenPhoneSim: (slot: number) => void;
  onSwitchMode: () => void;
}

export const TvLobby: React.FC<TvLobbyProps> = ({
  roomCode,
  players,
  onStartMatch,
  onStartPracticeMatch,
  onUpdatePlayer,
  onKickPlayer,
  onAddSimulatedPlayer,
  onOpenPhoneSim,
  onSwitchMode,
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [editingSlot, setEditingSlot] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editTeam, setEditTeam] = useState<TeamId>('RED');
  const [isMuted, setIsMuted] = useState(sound.getMuted());
  const [botCount, setBotCount] = useState<number>(2);
  const [localIps, setLocalIps] = useState<string[]>([]);
  const [useLocalIp, setUseLocalIp] = useState<boolean>(false);

  // Fetch host IP addresses for real Wi-Fi network scanning
  useEffect(() => {
    fetch('/api/host-info')
      .then((res) => res.json())
      .then((data) => {
        if (data.localIps && data.localIps.length > 0) {
          setLocalIps(data.localIps);
        }
      })
      .catch(() => {});
  }, []);

  // Join URL that mobile phones will open
  const lanHost = localIps[0] ? `http://${localIps[0]}:3000` : '';
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const effectiveBase = (useLocalIp && lanHost) ? lanHost : currentOrigin;
  const joinUrl = effectiveBase ? `${effectiveBase}/?mode=phone&room=${roomCode}` : '';

  useEffect(() => {
    if (roomCode) {
      QRCode.toDataURL(joinUrl, {
        width: 320,
        margin: 1,
        color: {
          dark: '#090d16',
          light: '#ffffff',
        },
      })
        .then((url) => setQrDataUrl(url))
        .catch((err) => console.error('QR generation error:', err));
    }
  }, [roomCode, joinUrl]);

  const copyCode = () => {
    sound.playClick();
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const startEdit = (p: PlayerSlotData) => {
    sound.playClick();
    setEditingSlot(p.slot);
    setEditName(p.name);
    setEditTeam(p.team);
  };

  const saveEdit = (slot: number) => {
    sound.playClick();
    onUpdatePlayer(slot, editName.trim() || `Player ${slot}`, editTeam);
    setEditingSlot(null);
  };

  const toggleSound = () => {
    const muted = sound.toggleMute();
    setIsMuted(muted);
  };

  const activePlayers = players.filter((p) => p.connected);
  const canStart = activePlayers.length >= 1;

  return (
    <div
      id="tv-lobby-screen"
      className="fixed inset-0 bg-[#090d16] text-white flex flex-col p-6 select-none overflow-y-auto"
    >
      <div className="absolute inset-0 opacity-15 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:28px_28px] pointer-events-none" />

      {/* Header Bar */}
      <div className="relative flex items-center justify-between border-b border-slate-800 pb-4 mb-6 z-10">
        <div className="flex items-center gap-4">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Radio className="w-6 h-6 animate-pulse text-cyan-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-widest text-cyan-400 font-bold">
                ARCADE PULSE LABS
              </span>
              <span className="text-slate-600">•</span>
              <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-semibold">
                HOST AUTHORITATIVE
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black font-['Chakra_Petch'] tracking-wide">
              NEO STRIKE 2D • TV LOBBY
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            id="btn-tv-toggle-sound"
            onClick={toggleSound}
            className="p-2.5 rounded-xl bg-slate-800 border border-slate-700 hover:border-cyan-500 text-slate-300 hover:text-white transition-all cursor-pointer"
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <VolumeX className="w-5 h-5 text-red-400" /> : <Volume2 className="w-5 h-5 text-cyan-400" />}
          </button>

          <button
            id="btn-switch-to-phone"
            onClick={onSwitchMode}
            className="px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 hover:border-emerald-500 text-xs text-slate-300 hover:text-white transition-all flex items-center gap-2 cursor-pointer"
          >
            <Smartphone className="w-4 h-4 text-emerald-400" />
            Switch to Phone Mode
          </button>
        </div>
      </div>

      {/* Main Grid: QR & Connection Code (Left) + Player Slots (Right) */}
      <div className="relative grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 items-start z-10">
        {/* Left Column: QR Code & Connection Card (4 cols) */}
        <div className="lg:col-span-5 flex flex-col items-center bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-2xl">
          <div className="text-center mb-4">
            <span className="text-xs uppercase tracking-widest text-cyan-400 font-bold block mb-1">
              CONNECT WIRELESS CONTROLLERS
            </span>
            <p className="text-sm text-slate-400">
              Scan this QR code with any smartphone camera to join as a controller.
            </p>
          </div>

          {/* QR Code Container */}
          <div className="p-4 bg-white rounded-2xl shadow-[0_0_35px_rgba(56,189,248,0.2)] border-2 border-cyan-400 mb-4">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="Scan to join session"
                className="w-56 h-56 md:w-64 md:h-64 object-contain rounded-lg"
              />
            ) : (
              <div className="w-64 h-64 flex items-center justify-center text-slate-800">
                Generating QR...
              </div>
            )}
          </div>

          {/* Fallback Connection Code & Network Selector */}
          <div className="w-full bg-slate-950/80 border border-slate-800 rounded-2xl p-4 flex flex-col gap-3 mb-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold block">
                  FALLBACK ROOM CODE
                </span>
                <span className="text-2xl font-black font-['Chakra_Petch'] tracking-widest text-cyan-400">
                  {roomCode || '----'}
                </span>
              </div>
              <button
                id="btn-copy-code"
                onClick={copyCode}
                className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>

            {/* Wi-Fi LAN IP Toggle if available */}
            {localIps.length > 0 && (
              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
                <span className="text-slate-400 flex items-center gap-1">
                  <Wifi className="w-3.5 h-3.5 text-cyan-400" />
                  Wi-Fi LAN IP:
                </span>
                <button
                  type="button"
                  onClick={() => setUseLocalIp(!useLocalIp)}
                  className={`px-2 py-1 rounded-lg font-mono text-[11px] transition-all cursor-pointer border ${
                    useLocalIp
                      ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                  }`}
                  title="Switch between browser origin and direct Wi-Fi local IP"
                >
                  {localIps[0]}:3000 {useLocalIp ? '✓ Active' : '(Click to use in QR)'}
                </button>
              </div>
            )}
          </div>

          {/* Gameplay Engine Feature Badges */}
          <div className="w-full bg-slate-950/60 border border-slate-800/80 rounded-2xl p-3 flex flex-col gap-1.5 text-[11px] text-slate-400 mb-4">
            <span className="font-bold text-slate-300 flex items-center gap-1 text-xs">
              <Zap className="w-3.5 h-3.5 text-cyan-400" />
              Arcade Physics Active
            </span>
            <div className="flex flex-wrap gap-1.5">
              <span className="px-2 py-0.5 rounded bg-slate-800 text-cyan-300 font-semibold">
                Single Jump Only
              </span>
              <span className="px-2 py-0.5 rounded bg-slate-800 text-amber-300 font-semibold">
                Bullet-Dodge Dash
              </span>
              <span className="px-2 py-0.5 rounded bg-slate-800 text-emerald-300 font-semibold">
                3.5s Shield Protection
              </span>
            </div>
          </div>

          {/* Preview Testing Tools */}
          <div className="w-full bg-cyan-950/20 border border-cyan-800/40 rounded-2xl p-3 flex flex-col gap-2">
            <span className="text-[11px] font-bold text-cyan-300 flex items-center gap-1.5">
              <Smartphone className="w-3.5 h-3.5" />
              PREVIEW & MULTI-DEVICE TEST
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                id="btn-add-sim-player"
                onClick={onAddSimulatedPlayer}
                disabled={activePlayers.length >= 4}
                className="px-3 py-2 rounded-xl bg-cyan-600/30 hover:bg-cyan-600/50 border border-cyan-500/40 text-xs font-bold text-cyan-200 transition-all disabled:opacity-40 cursor-pointer text-center"
              >
                + Add Test Player
              </button>
              <a
                href={joinUrl}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-2 rounded-xl bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/40 text-xs font-bold text-emerald-200 transition-all flex items-center justify-center gap-1 text-center"
              >
                Open Controller Tab <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>

        {/* Right Column: 4 Player Slots & Match Start Controls (7 cols) */}
        <div className="lg:col-span-7 flex flex-col space-y-4">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-cyan-400" />
              <h2 className="text-xl font-bold font-['Chakra_Petch']">
                CONNECTED PLAYERS ({activePlayers.length} / 4)
              </h2>
            </div>
            <span className="text-xs text-slate-400">
              Max 3 Teams • 1 to 4 Human Players
            </span>
          </div>

          {/* 4 Player Slots Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((slotNum) => {
              const player = players.find((p) => p.slot === slotNum && p.connected);
              const isEditing = editingSlot === slotNum;

              if (!player) {
                return (
                  <div
                    key={slotNum}
                    id={`player-slot-empty-${slotNum}`}
                    className="p-5 rounded-2xl bg-slate-900/40 border-2 border-dashed border-slate-800 flex flex-col items-center justify-center text-center min-h-[140px] text-slate-600"
                  >
                    <span className="text-xs font-bold uppercase tracking-wider block mb-1">
                      SLOT {slotNum}
                    </span>
                    <p className="text-xs text-slate-500">Waiting for phone to scan...</p>
                  </div>
                );
              }

              const teamDef = TEAMS[player.team] || TEAMS.RED;

              return (
                <div
                  key={slotNum}
                  id={`player-slot-${slotNum}`}
                  className="p-5 rounded-2xl bg-slate-900/90 border-2 transition-all shadow-lg flex flex-col justify-between min-h-[140px]"
                  style={{
                    borderColor: teamDef.color,
                    boxShadow: `0 0 20px ${teamDef.glowHex}`,
                  }}
                >
                  {isEditing ? (
                    <div className="space-y-3">
                      <div>
                        <label className="text-[10px] text-slate-400 uppercase font-bold">Edit Name</label>
                        <input
                          type="text"
                          value={editName}
                          maxLength={16}
                          onChange={(e) => setEditName(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white text-sm font-semibold focus:outline-none focus:border-cyan-400"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400 uppercase font-bold">Assign Team</label>
                        <div className="flex gap-1.5 mt-1">
                          {(['RED', 'BLUE', 'GREEN'] as TeamId[]).map((tId) => (
                            <button
                              key={tId}
                              type="button"
                              onClick={() => setEditTeam(tId)}
                              className={`flex-1 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                                editTeam === tId
                                  ? 'bg-white text-slate-950'
                                  : 'bg-slate-800 text-slate-400 hover:text-white'
                              }`}
                            >
                              {tId}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-2 justify-end pt-1">
                        <button
                          type="button"
                          onClick={() => setEditingSlot(null)}
                          className="px-2.5 py-1 rounded-md bg-slate-800 text-xs text-slate-300 hover:text-white cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => saveEdit(slotNum)}
                          className="px-3 py-1 rounded-md bg-cyan-600 text-xs font-bold text-white hover:bg-cyan-500 cursor-pointer"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                              SLOT {slotNum}
                            </span>
                            <span
                              className="text-xs font-bold px-2.5 py-0.5 rounded-full"
                              style={{
                                backgroundColor: `${teamDef.color}25`,
                                color: teamDef.lightColor,
                                border: `1px solid ${teamDef.color}60`,
                              }}
                            >
                              {teamDef.name}
                            </span>
                          </div>
                          <h3 className="text-lg font-black font-['Chakra_Petch'] mt-1 tracking-wide">
                            {player.name}
                          </h3>
                        </div>

                        {/* Host action buttons */}
                        <div className="flex items-center gap-1">
                          <button
                            id={`btn-edit-player-${slotNum}`}
                            onClick={() => startEdit(player)}
                            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-cyan-400 transition-colors cursor-pointer"
                            title="Edit Player"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            id={`btn-open-sim-${slotNum}`}
                            onClick={() => onOpenPhoneSim(slotNum)}
                            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-emerald-400 transition-colors cursor-pointer"
                            title="Open Virtual Gamepad"
                          >
                            <Smartphone className="w-3.5 h-3.5" />
                          </button>
                          <button
                            id={`btn-kick-player-${slotNum}`}
                            onClick={() => onKickPlayer(slotNum)}
                            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-red-400 transition-colors cursor-pointer"
                            title="Disconnect Player"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-3 border-t border-slate-800/60 mt-2">
                        <span className="text-xs text-slate-400 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                          Connected Wireless Gamepad
                        </span>
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded ${
                            player.ready ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
                          }`}
                        >
                          {player.ready ? 'READY' : 'IN LOBBY'}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {/* Prominent Start Match & Practice Buttons */}
          <div className="pt-4 flex flex-col gap-3">
            <button
              id="btn-tv-start-match"
              onClick={onStartMatch}
              disabled={!canStart}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-cyan-500 via-blue-600 to-cyan-500 hover:from-cyan-400 hover:via-blue-500 hover:to-cyan-400 text-white font-black text-xl font-['Chakra_Petch'] tracking-widest transition-all shadow-[0_0_35px_rgba(56,189,248,0.4)] disabled:opacity-40 disabled:pointer-events-none cursor-pointer flex items-center justify-center gap-3 active:scale-[0.99]"
            >
              <Play className="w-6 h-6 fill-current" />
              START 2D PVP MATCH
            </button>

            {/* Practice / Training Mode against Bots */}
            {onStartPracticeMatch && (
              <div className="w-full p-3 rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-300">
                    <Bot className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-white block">
                      Practice / Bot Training
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Test remote, movement, dash & weapons against AI bots
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    id="select-bot-count"
                    value={botCount}
                    onChange={(e) => setBotCount(Number(e.target.value))}
                    className="bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 font-bold cursor-pointer"
                  >
                    <option value={1}>1 Bot</option>
                    <option value={2}>2 Bots</option>
                    <option value={3}>3 Bots</option>
                  </select>

                  <button
                    id="btn-start-practice"
                    type="button"
                    onClick={() => onStartPracticeMatch(botCount)}
                    className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-black text-xs font-['Chakra_Petch'] tracking-wider cursor-pointer transition-all shadow-[0_0_15px_rgba(168,85,247,0.4)]"
                  >
                    START TRAINING
                  </button>
                </div>
              </div>
            )}

            <p className="text-center text-xs text-slate-500">
              {canStart
                ? 'All ready! The TV will launch the authoritative match and phones switch to gamepads.'
                : 'Connect your phone by scanning the QR code, or click "START TRAINING" to test with bots!'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
