import { WeaponDef, WeaponType } from '../types.ts';

export const PHYSICS = {
  GRAVITY: 1750, // Rapid, punchy arcade gravity - no floatiness!
  TERMINAL_VELOCITY: 1100,
  MOVE_SPEED: 460, // High-speed responsive ground movement
  ACCELERATION: 4200, // Instantaneous acceleration
  DECELERATION: 3600, // Snappy brake
  AIR_ACCELERATION: 3800, // Agile mid-air vectoring to weave through bullets
  AIR_DECELERATION: 2200,
  JUMP_VELOCITY: -680, // Crisp, dynamic single jump
  MAX_JUMPS: 1, // Single jump strictly (double jump removed per user direction)
  DASH_SPEED: 960, // Intense kinetic dash burst
  DASH_DURATION_MS: 180,
  DASH_COOLDOWN_MS: 1200, // Rapid cooldown for arcade fluidity (1.2s)
  PLAYER_WIDTH: 36,
  PLAYER_HEIGHT: 54,
  MAX_HP: 100,
  SHIELD_DURATION_MS: 3500, // 3.5s immunity
  SHIELD_COOLDOWN_MS: 10000, // 10s cooldown
};

export const WEAPONS: Record<WeaponType, WeaponDef> = {
  RIFLE: {
    type: 'RIFLE',
    name: 'Pulse Blaster',
    damage: 16,
    fireRate: 6.0, // fast automatic plasma bursts
    cooldownMs: 165,
    pelletCount: 1,
    spreadAngleRad: 0.03,
    speed: 1050, // px / s
    range: 950,
    projectileColor: '#38bdf8',
    trailColor: 'rgba(56, 189, 248, 0.4)',
    iconName: 'Zap',
  },
  SHOTGUN: {
    type: 'SHOTGUN',
    name: 'Scatter Cannon',
    damage: 10, // per pellet (6 pellets = up to 60 dmg point blank!)
    fireRate: 1.4,
    cooldownMs: 700,
    pelletCount: 6,
    spreadAngleRad: 0.28,
    speed: 860,
    range: 500,
    projectileColor: '#f97316',
    trailColor: 'rgba(249, 115, 22, 0.5)',
    iconName: 'Flame',
  },
};
