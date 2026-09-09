import React, { useState, useRef, useEffect, useCallback } from 'react';
import { PlayerInput, TeamId, TEAMS, WeaponType } from '../../types.ts';
import { PHYSICS } from '../../game/constants.ts';
import { Shield, Zap, Flame, ArrowUp, FastForward, Wifi, LogOut } from 'lucide-react';

interface PhoneControllerProps {
  slot: number;
  playerName: string;
  playerTeam: TeamId;
  selectedWeapon: WeaponType;
  hp: number;
  maxHp: number;
  latencyMs?: number;
  onSendInput: (input: PlayerInput) => void;
  onDisconnect?: () => void;
}

export const PhoneController: React.FC<PhoneControllerProps> = ({
  slot,
  playerName,
  playerTeam,
  selectedWeapon = 'RIFLE',
  hp = 100,
  maxHp = 100,
  latencyMs,
  onSendInput,
  onDisconnect,
}) => {
  const seqRef = useRef(0);

  // Input states
  const inputRef = useRef<PlayerInput>({
    moveX: 0,
    moveY: 0,
    aimX: 0,
    aimY: 0,
    isAiming: false,
    fire: false,
    jump: false,
    dash: false,
    switchWeapon: false,
    shield: false,
    seq: 0,
  });

  const [currentWeapon, setCurrentWeapon] = useState<WeaponType>(selectedWeapon);
  const [shieldActive, setShieldActive] = useState(false);
  const [shieldCooldownPct, setShieldCooldownPct] = useState(0);
  const [dashCooldownPct, setDashCooldownPct] = useState(0);

  // Timers
  const shieldEndRef = useRef(0);
  const shieldCdEndRef = useRef(0);
  const dashCdEndRef = useRef(0);

  // Move Joystick references
  const joystickBaseRef = useRef<HTMLDivElement | null>(null);
  const joystickPointerId = useRef<number | null>(null);
  const [joystickThumb, setJoystickThumb] = useState({ x: 0, y: 0 });

  // Aim Joystick references
  const aimBaseRef = useRef<HTMLDivElement | null>(null);
  const aimPointerId = useRef<number | null>(null);
  const [aimThumb, setAimThumb] = useState({ x: 0, y: 0 });

  // Haptic feedback
  const triggerHaptic = useCallback((ms = 20) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(ms);
      } catch {
        // Ignore iframe restrictions
      }
    }
  }, []);

  // Send input changes with monotonic sequence counter
  const flushInput = useCallback(() => {
    seqRef.current++;
    inputRef.current.seq = seqRef.current;
    onSendInput({ ...inputRef.current });
  }, [onSendInput]);

  // Periodic input stream (~45Hz) to keep TV engine smoothly updated
  useEffect(() => {
    const interval = setInterval(() => {
      flushInput();

      const now = performance.now();

      // Shield timers
      if (shieldEndRef.current > now) {
        setShieldActive(true);
      } else {
        setShieldActive(false);
      }

      if (shieldCdEndRef.current > now) {
        const remaining = shieldCdEndRef.current - now;
        setShieldCooldownPct(remaining / PHYSICS.SHIELD_COOLDOWN_MS);
      } else {
        setShieldCooldownPct(0);
      }

      // Dash timers
      if (dashCdEndRef.current > now) {
        const remaining = dashCdEndRef.current - now;
        setDashCooldownPct(remaining / PHYSICS.DASH_COOLDOWN_MS);
      } else {
        setDashCooldownPct(0);
      }
    }, 22);

    return () => clearInterval(interval);
  }, [flushInput]);

  // Left Joystick (Movement)
  const handleJoystickStart = (e: React.PointerEvent) => {
    if (joystickPointerId.current !== null) return;
    joystickPointerId.current = e.pointerId;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    handleJoystickMove(e);
  };

  const handleJoystickMove = (e: React.PointerEvent) => {
    if (e.pointerId !== joystickPointerId.current || !joystickBaseRef.current) return;
    const rect = joystickBaseRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const dx = e.clientX - centerX;
    const dy = e.clientY - centerY;
    const distance = Math.hypot(dx, dy);
    const maxRadius = rect.width / 2;

    const clampedDist = Math.min(distance, maxRadius);
    const angle = Math.atan2(dy, dx);

    const thumbX = Math.cos(angle) * clampedDist;
    const thumbY = Math.sin(angle) * clampedDist;
    setJoystickThumb({ x: thumbX, y: thumbY });

    if (distance < 8) {
      inputRef.current.moveX = 0;
      inputRef.current.moveY = 0;
    } else {
      inputRef.current.moveX = thumbX / maxRadius;
      inputRef.current.moveY = thumbY / maxRadius;
    }
  };

  const handleJoystickEnd = (e: React.PointerEvent) => {
    if (e.pointerId !== joystickPointerId.current) return;
    joystickPointerId.current = null;
    setJoystickThumb({ x: 0, y: 0 });
    inputRef.current.moveX = 0;
    inputRef.current.moveY = 0;
  };

  // Right Joystick (Aiming)
  const handleAimStart = (e: React.PointerEvent) => {
    if (aimPointerId.current !== null) return;
    aimPointerId.current = e.pointerId;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    handleAimMove(e);
  };

  const handleAimMove = (e: React.PointerEvent) => {
    if (e.pointerId !== aimPointerId.current || !aimBaseRef.current) return;
    const rect = aimBaseRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const dx = e.clientX - centerX;
    const dy = e.clientY - centerY;
    const distance = Math.hypot(dx, dy);
    const maxRadius = rect.width / 2;

    const clampedDist = Math.min(distance, maxRadius);
    const angle = Math.atan2(dy, dx);

    const thumbX = Math.cos(angle) * clampedDist;
    const thumbY = Math.sin(angle) * clampedDist;
    setAimThumb({ x: thumbX, y: thumbY });

    if (distance < 10) {
      inputRef.current.aimX = 0;
      inputRef.current.aimY = 0;
      inputRef.current.isAiming = false;
    } else {
      inputRef.current.aimX = Math.cos(angle);
      inputRef.current.aimY = Math.sin(angle);
      inputRef.current.isAiming = true;
    }
  };

  const handleAimEnd = (e: React.PointerEvent) => {
    if (e.pointerId !== aimPointerId.current) return;
    aimPointerId.current = null;
    setAimThumb({ x: 0, y: 0 });
    inputRef.current.isAiming = false;
  };

  // Action Button Handlers
  const setFire = (isDown: boolean) => {
    if (isDown && !inputRef.current.fire) {
      triggerHaptic(25);
    }
    inputRef.current.fire = isDown;
    flushInput();
  };

  const setJump = (isDown: boolean) => {
    if (isDown && !inputRef.current.jump) {
      triggerHaptic(20);
    }
    inputRef.current.jump = isDown;
    flushInput();
  };

  const setDash = (isDown: boolean) => {
    const now = performance.now();
    if (isDown && !inputRef.current.dash && now >= dashCdEndRef.current) {
      triggerHaptic(30);
      dashCdEndRef.current = now + PHYSICS.DASH_COOLDOWN_MS;
      inputRef.current.dash = true;
      flushInput();
      setTimeout(() => {
        inputRef.current.dash = false;
        flushInput();
      }, 100);
    }
  };

  const setSwitchWeapon = () => {
    triggerHaptic(15);
    setCurrentWeapon((prev) => (prev === 'RIFLE' ? 'SHOTGUN' : 'RIFLE'));
    inputRef.current.switchWeapon = true;
    flushInput();
    setTimeout(() => {
      inputRef.current.switchWeapon = false;
      flushInput();
    }, 100);
  };

  const activateShield = () => {
    const now = performance.now();
    if (now >= shieldCdEndRef.current && !shieldActive) {
      triggerHaptic(40);
      shieldEndRef.current = now + PHYSICS.SHIELD_DURATION_MS;
      shieldCdEndRef.current = now + PHYSICS.SHIELD_COOLDOWN_MS;
      setShieldActive(true);
      inputRef.current.shield = true;
      flushInput();
      setTimeout(() => {
        inputRef.current.shield = false;
        flushInput();
      }, 100);
    }
  };

  const teamDef = TEAMS[playerTeam] || TEAMS.RED;
  const hpPercent = Math.max(0, Math.min(100, (hp / maxHp) * 100));

  return (
    <div
      id="phone-gamepad-container"
      className="fixed inset-0 bg-[#070a12] text-white flex flex-col select-none overflow-hidden touch-none"
    >
      {/* Top Ergonomic Status Bar */}
      <div className="relative z-20 flex items-center justify-between px-3 md:px-5 py-2 bg-slate-900/90 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <span
            className="w-7 h-7 rounded-xl flex items-center justify-center text-xs font-black text-white shadow-md font-mono"
            style={{ backgroundColor: teamDef.color }}
          >
            P{slot}
          </span>
          <span className="font-bold text-sm font-['Chakra_Petch'] truncate max-w-[120px]">
            {playerName}
          </span>
        </div>

        {/* Shield / Protection Button (Center) */}
        <button
          id="btn-controller-shield"
          type="button"
          onClick={activateShield}
          disabled={shieldCooldownPct > 0 || shieldActive}
          className={`px-3 md:px-4 py-1.5 rounded-xl font-black text-xs font-['Chakra_Petch'] tracking-wider flex items-center gap-1.5 transition-all cursor-pointer border ${
            shieldActive
              ? 'bg-cyan-500 border-cyan-300 text-white shadow-[0_0_20px_#38bdf8] animate-pulse'
              : shieldCooldownPct > 0
              ? 'bg-slate-800 border-slate-700 text-slate-500 opacity-60'
              : 'bg-cyan-600/30 hover:bg-cyan-600/50 border-cyan-400 text-cyan-200'
          }`}
        >
          <Shield className="w-3.5 h-3.5 text-cyan-300" />
          <span>
            {shieldActive
              ? 'PROTECTED!'
              : shieldCooldownPct > 0
              ? `SHIELD (${Math.ceil(shieldCooldownPct * 10)}s)`
              : 'SHIELD'}
          </span>
        </button>

        {/* HP Bar, Latency & Disconnect */}
        <div className="flex items-center gap-2">
          {typeof latencyMs === 'number' && (
            <span className="hidden sm:flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-800 text-[10px] font-mono text-emerald-400 border border-slate-700">
              <Wifi className="w-2.5 h-2.5" />
              {latencyMs}ms
            </span>
          )}
          <div className="w-16 sm:w-24 h-2.5 bg-slate-950 rounded-full overflow-hidden border border-slate-700">
            <div
              className="h-full rounded-full transition-all duration-150"
              style={{
                width: `${hpPercent}%`,
                backgroundColor:
                  hpPercent > 50 ? '#22c55e' : hpPercent > 25 ? '#eab308' : '#ef4444',
              }}
            />
          </div>
          <span className="text-[11px] font-mono font-bold text-slate-300">
            {Math.ceil(hp)}
          </span>

          {onDisconnect && (
            <button
              onClick={onDisconnect}
              className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-red-400 transition-colors ml-1 cursor-pointer"
              title="Leave"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Main Controller Body */}
      <div className="flex-1 flex flex-col md:flex-row items-center justify-between p-3 md:p-6 gap-3 relative overflow-hidden">
        {/* LEFT SIDE: Movement Analog Joystick */}
        <div className="flex flex-col items-center justify-center select-none">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
            MOVE JOYSTICK
          </span>
          <div
            id="joystick-move-base"
            ref={joystickBaseRef}
            onPointerDown={handleJoystickStart}
            onPointerMove={handleJoystickMove}
            onPointerUp={handleJoystickEnd}
            onPointerCancel={handleJoystickEnd}
            className="relative w-36 h-36 md:w-48 md:h-48 rounded-full bg-slate-900/90 border-2 border-slate-700 shadow-[inset_0_0_25px_rgba(0,0,0,0.8)] flex items-center justify-center touch-none cursor-pointer"
          >
            <div className="w-12 h-12 md:w-16 md:h-16 rounded-full border border-slate-700/60 pointer-events-none" />
            <div
              className="absolute w-16 h-16 md:w-22 md:h-22 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 border-2 border-white shadow-[0_0_20px_rgba(56,189,248,0.5)] pointer-events-none transition-transform duration-75 flex items-center justify-center text-white"
              style={{
                transform: `translate(${joystickThumb.x}px, ${joystickThumb.y}px)`,
              }}
            >
              <div className="w-6 h-6 rounded-full bg-white/25" />
            </div>
          </div>
        </div>

        {/* RIGHT SIDE: Aim Joystick & Action Cluster */}
        <div className="flex items-center gap-3 md:gap-6 select-none">
          {/* Aim Direction Joystick */}
          <div className="flex flex-col items-center justify-center">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              AIM DIRECTION
            </span>
            <div
              id="aim-pad-base"
              ref={aimBaseRef}
              onPointerDown={handleAimStart}
              onPointerMove={handleAimMove}
              onPointerUp={handleAimEnd}
              onPointerCancel={handleAimEnd}
              className="relative w-32 h-32 md:w-42 md:h-42 rounded-full bg-slate-900/90 border-2 border-slate-700 shadow-[inset_0_0_25px_rgba(0,0,0,0.8)] flex items-center justify-center touch-none cursor-pointer"
            >
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-full border border-slate-700/60 pointer-events-none" />
              <div
                className="absolute w-14 h-14 md:w-18 md:h-18 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 border-2 border-cyan-400 shadow-[0_0_15px_rgba(56,189,248,0.4)] pointer-events-none transition-transform duration-75 flex items-center justify-center"
                style={{
                  transform: `translate(${aimThumb.x}px, ${aimThumb.y}px)`,
                }}
              >
                <div className="w-3.5 h-3.5 rounded-full bg-cyan-400" />
              </div>
            </div>
          </div>

          {/* Action Buttons: Jump, Dash, Switch, Big Fire */}
          <div className="flex flex-col gap-2.5">
            <div className="flex gap-2">
              {/* Weapon Switch Button */}
              <button
                id="btn-controller-weapon-switch"
                type="button"
                onClick={setSwitchWeapon}
                className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-slate-800 hover:bg-slate-700 border-2 border-slate-600 active:scale-95 transition-all flex flex-col items-center justify-center cursor-pointer shadow-lg"
              >
                {currentWeapon === 'RIFLE' ? (
                  <Zap className="w-5 h-5 text-cyan-400" />
                ) : (
                  <Flame className="w-5 h-5 text-orange-400" />
                )}
                <span className="text-[9px] font-black mt-0.5 text-slate-300">
                  {currentWeapon === 'RIFLE' ? 'RIFLE' : 'SHOTGUN'}
                </span>
              </button>

              {/* Dash Button */}
              <button
                id="btn-controller-dash"
                type="button"
                onPointerDown={() => setDash(true)}
                disabled={dashCooldownPct > 0}
                className={`w-14 h-14 md:w-16 md:h-16 rounded-2xl border-2 active:scale-95 transition-all flex flex-col items-center justify-center cursor-pointer shadow-lg ${
                  dashCooldownPct > 0
                    ? 'bg-slate-800 border-slate-700 text-slate-500 opacity-60'
                    : 'bg-gradient-to-br from-amber-500 to-yellow-600 border-amber-300 text-white shadow-amber-500/20'
                }`}
              >
                <FastForward className="w-5 h-5" />
                <span className="text-[9px] font-black mt-0.5">DASH</span>
              </button>

              {/* Single Jump Button */}
              <button
                id="btn-controller-jump"
                type="button"
                onPointerDown={() => setJump(true)}
                onPointerUp={() => setJump(false)}
                onPointerCancel={() => setJump(false)}
                className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 border-2 border-blue-400 active:scale-95 text-white transition-all flex flex-col items-center justify-center cursor-pointer shadow-lg shadow-blue-500/20"
              >
                <ArrowUp className="w-6 h-6 stroke-[3]" />
                <span className="text-[9px] font-black mt-0.5">JUMP</span>
              </button>
            </div>

            {/* Large Primary Fire Button */}
            <button
              id="btn-controller-fire"
              type="button"
              onPointerDown={() => setFire(true)}
              onPointerUp={() => setFire(false)}
              onPointerCancel={() => setFire(false)}
              className="w-full h-20 md:h-24 rounded-2xl bg-gradient-to-r from-red-600 via-rose-500 to-red-600 hover:from-red-500 active:scale-95 text-white font-black text-xl font-['Chakra_Petch'] tracking-widest transition-all shadow-[0_0_30px_rgba(239,68,68,0.5)] border-2 border-white/80 cursor-pointer flex items-center justify-center gap-2"
            >
              <Zap className="w-6 h-6 fill-current animate-pulse" />
              <span>إطلاق • FIRE</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
