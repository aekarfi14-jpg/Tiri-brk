import React, { useState, useRef, useEffect, useCallback } from 'react';
import { PlayerInput, TeamId, TEAMS, WeaponType } from '../../types.ts';
import { PHYSICS, WEAPONS } from '../../game/constants.ts';
import { Shield, Zap, Flame, ArrowUp, FastForward, Wifi, Sparkles } from 'lucide-react';
import { sound } from '../../audio/soundEngine.ts';

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
  });

  const [currentWeapon, setCurrentWeapon] = useState<WeaponType>(selectedWeapon);
  const [shieldActive, setShieldActive] = useState(false);
  const [shieldCooldownPct, setShieldCooldownPct] = useState(0); // 0 = ready, 1 = full cooldown
  const [dashCooldownPct, setDashCooldownPct] = useState(0);

  // Timers
  const shieldEndRef = useRef(0);
  const shieldCdEndRef = useRef(0);
  const dashCdEndRef = useRef(0);

  // Virtual Joystick references
  const joystickBaseRef = useRef<HTMLDivElement | null>(null);
  const joystickPointerId = useRef<number | null>(null);
  const [joystickThumb, setJoystickThumb] = useState({ x: 0, y: 0 });

  // Aim Joystick references
  const aimBaseRef = useRef<HTMLDivElement | null>(null);
  const aimPointerId = useRef<number | null>(null);
  const [aimThumb, setAimThumb] = useState({ x: 0, y: 0 });

  // Haptic trigger
  const triggerHaptic = useCallback((ms = 18) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(ms);
      } catch {
        // Ignore iframe restrictions
      }
    }
  }, []);

  // Send input changes
  const flushInput = useCallback(() => {
    onSendInput({ ...inputRef.current });
  }, [onSendInput]);

  // Periodic input stream (approx 45Hz) to keep TV perfectly in sync
  useEffect(() => {
    const interval = setInterval(() => {
      flushInput();

      // Cooldown timer updates
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

  // Left Joystick Touch Handlers
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

    // Deadzone
    if (distance < 10) {
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

  // Aim Joystick Touch Handlers
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

    if (distance < 12) {
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

  // Button actions
  const setFire = (isDown: boolean) => {
    if (isDown && !inputRef.current.fire) {
      triggerHaptic(24);
    }
    inputRef.current.fire = isDown;
    flushInput();
  };

  const setJump = (isDown: boolean) => {
    if (isDown && !inputRef.current.jump) {
      triggerHaptic(18);
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
      className="fixed inset-0 bg-[#090d16] text-white flex flex-col select-none overflow-hidden touch-none"
    >
      {/* Top Ergonomic Status Bar */}
      <div className="relative z-20 flex items-center justify-between px-4 py-2 bg-slate-900/90 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <span
            className="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-black text-white"
            style={{ backgroundColor: teamDef.color }}
          >
            P{slot}
          </span>
          <span className="font-bold text-sm font-['Chakra_Petch'] truncate max-w-[110px]">
            {playerName}
          </span>
        </div>

        {/* Protection / Shield Button (Center Top) */}
        <button
          id="btn-controller-shield"
          type="button"
          onClick={activateShield}
          disabled={shieldCooldownPct > 0 || shieldActive}
          className={`px-4 py-2 rounded-2xl font-black text-xs font-['Chakra_Petch'] tracking-wider flex items-center gap-2 transition-all cursor-pointer border shadow-lg ${
            shieldActive
              ? 'bg-cyan-500 border-cyan-300 text-white shadow-[0_0_20px_#38bdf8] animate-pulse'
              : shieldCooldownPct > 0
              ? 'bg-slate-800 border-slate-700 text-slate-400 opacity-60'
              : 'bg-cyan-600/30 hover:bg-cyan-600/50 border-cyan-400 text-cyan-200'
          }`}
        >
          <Shield className="w-4 h-4 text-cyan-300" />
          {shieldActive
            ? 'PROTECTED!'
            : shieldCooldownPct > 0
            ? `SHIELD (${Math.ceil(shieldCooldownPct * 10)}s)`
            : 'SHIELD / PAUSE'}
        </button>

        {/* HP Bar and Connection Latency */}
        <div className="flex items-center gap-2">
          {typeof latencyMs === 'number' && (
            <span className="hidden sm:flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-800 text-[10px] font-mono text-emerald-400 border border-slate-700">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {latencyMs}ms
            </span>
          )}
          <div className="w-20 md:w-32 h-3 bg-slate-950 rounded-full overflow-hidden border border-slate-700">
            <div
              className="h-full rounded-full transition-all duration-150"
              style={{
                width: `${hpPercent}%`,
                backgroundColor:
                  hpPercent > 50 ? '#22c55e' : hpPercent > 25 ? '#eab308' : '#ef4444',
              }}
            />
          </div>
          <span className="text-[11px] font-mono text-slate-400">{Math.ceil(hp)} HP</span>
        </div>
      </div>

      {/* Main Controller Body: Left Joystick + Right Action Pad */}
      <div className="flex-1 flex items-center justify-between p-4 md:p-8 relative">
        {/* LEFT SIDE: Large Movement Virtual Joystick */}
        <div className="flex flex-col items-center justify-center">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
            MOVE JOYSTICK
          </span>
          <div
            id="joystick-move-base"
            ref={joystickBaseRef}
            onPointerDown={handleJoystickStart}
            onPointerMove={handleJoystickMove}
            onPointerUp={handleJoystickEnd}
            onPointerCancel={handleJoystickEnd}
            className="relative w-44 h-44 md:w-52 md:h-52 rounded-full bg-slate-900/90 border-2 border-slate-700 shadow-[inset_0_0_25px_rgba(0,0,0,0.8)] flex items-center justify-center touch-none cursor-pointer"
          >
            {/* Center ring marker */}
            <div className="w-16 h-16 rounded-full border border-slate-700/60 pointer-events-none" />

            {/* Draggable thumb nub */}
            <div
              className="absolute w-20 h-20 md:w-24 md:h-24 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 border-2 border-white shadow-[0_0_20px_rgba(56,189,248,0.5)] pointer-events-none transition-transform duration-75 flex items-center justify-center text-white"
              style={{
                transform: `translate(${joystickThumb.x}px, ${joystickThumb.y}px)`,
              }}
            >
              <div className="w-8 h-8 rounded-full bg-white/20" />
            </div>
          </div>
        </div>

        {/* RIGHT SIDE: Action Buttons (Fire, Jump, Aim, Dash, Weapon Switch) */}
        <div className="flex items-center gap-4 md:gap-8">
          {/* Aim Control Touch Pad */}
          <div className="flex flex-col items-center">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
              AIM DIRECTION
            </span>
            <div
              id="aim-pad-base"
              ref={aimBaseRef}
              onPointerDown={handleAimStart}
              onPointerMove={handleAimMove}
              onPointerUp={handleAimEnd}
              onPointerCancel={handleAimEnd}
              className="relative w-36 h-36 md:w-44 md:h-44 rounded-full bg-slate-900/90 border-2 border-slate-700 shadow-[inset_0_0_25px_rgba(0,0,0,0.8)] flex items-center justify-center touch-none cursor-pointer"
            >
              <div className="w-12 h-12 rounded-full border border-slate-700/60 pointer-events-none" />
              <div
                className="absolute w-16 h-16 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 border-2 border-cyan-400 shadow-[0_0_15px_rgba(56,189,248,0.4)] pointer-events-none transition-transform duration-75 flex items-center justify-center"
                style={{
                  transform: `translate(${aimThumb.x}px, ${aimThumb.y}px)`,
                }}
              >
                <div className="w-4 h-4 rounded-full bg-cyan-400" />
              </div>
            </div>
          </div>

          {/* Core Action Cluster: Jump, Dash, Switch, Large Fire */}
          <div className="flex flex-col gap-3">
            <div className="flex gap-3">
              {/* Weapon Switch Button */}
              <button
                id="btn-controller-weapon-switch"
                type="button"
                onClick={setSwitchWeapon}
                className="w-18 h-18 md:w-20 md:h-20 rounded-2xl bg-slate-800 hover:bg-slate-700 border-2 border-slate-600 active:scale-95 transition-all flex flex-col items-center justify-center cursor-pointer shadow-lg"
              >
                {currentWeapon === 'RIFLE' ? (
                  <Zap className="w-6 h-6 text-cyan-400" />
                ) : (
                  <Flame className="w-6 h-6 text-orange-400" />
                )}
                <span className="text-[10px] font-black mt-0.5 text-slate-300">
                  {currentWeapon === 'RIFLE' ? 'RIFLE' : 'SHOTGUN'}
                </span>
              </button>

              {/* Dash / Speed Button */}
              <button
                id="btn-controller-dash"
                type="button"
                onPointerDown={() => setDash(true)}
                disabled={dashCooldownPct > 0}
                className={`w-18 h-18 md:w-20 md:h-20 rounded-2xl border-2 active:scale-95 transition-all flex flex-col items-center justify-center cursor-pointer shadow-lg ${
                  dashCooldownPct > 0
                    ? 'bg-slate-800 border-slate-700 text-slate-500 opacity-60'
                    : 'bg-gradient-to-br from-amber-500 to-yellow-600 border-amber-300 text-white shadow-amber-500/20'
                }`}
              >
                <FastForward className="w-6 h-6" />
                <span className="text-[10px] font-black mt-0.5">DASH</span>
              </button>

              {/* Jump Button */}
              <button
                id="btn-controller-jump"
                type="button"
                onPointerDown={() => setJump(true)}
                onPointerUp={() => setJump(false)}
                onPointerCancel={() => setJump(false)}
                className="w-18 h-18 md:w-20 md:h-20 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 border-2 border-blue-400 active:scale-95 text-white transition-all flex flex-col items-center justify-center cursor-pointer shadow-lg shadow-blue-500/20"
              >
                <ArrowUp className="w-7 h-7 stroke-[3]" />
                <span className="text-[10px] font-black mt-0.5">JUMP</span>
              </button>
            </div>

            {/* Large Primary Fire Button */}
            <button
              id="btn-controller-fire"
              type="button"
              onPointerDown={() => setFire(true)}
              onPointerUp={() => setFire(false)}
              onPointerCancel={() => setFire(false)}
              className="w-full h-24 md:h-28 rounded-3xl bg-gradient-to-r from-red-600 via-rose-500 to-red-600 hover:from-red-500 hover:to-red-500 border-4 border-white active:scale-95 text-white font-black text-2xl font-['Chakra_Petch'] tracking-widest transition-all shadow-[0_0_35px_rgba(239,68,68,0.5)] cursor-pointer flex items-center justify-center gap-3"
            >
              <Zap className="w-8 h-8 fill-current animate-pulse" />
              FIRE
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
