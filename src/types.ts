export type TeamId = 'RED' | 'BLUE' | 'GREEN';

export interface TeamConfig {
  id: TeamId;
  name: string;
  color: string;
  lightColor: string;
  accentHex: string;
  glowHex: string;
}

export const TEAMS: Record<TeamId, TeamConfig> = {
  RED: {
    id: 'RED',
    name: 'Crimson Vanguard',
    color: '#ef4444',
    lightColor: '#fca5a5',
    accentHex: '#dc2626',
    glowHex: 'rgba(239, 68, 68, 0.4)',
  },
  BLUE: {
    id: 'BLUE',
    name: 'Cobalt Syndicate',
    color: '#3b82f6',
    lightColor: '#93c5fd',
    accentHex: '#2563eb',
    glowHex: 'rgba(59, 130, 246, 0.4)',
  },
  GREEN: {
    id: 'GREEN',
    name: 'Emerald Legion',
    color: '#10b981',
    lightColor: '#6ee7b7',
    accentHex: '#059669',
    glowHex: 'rgba(16, 185, 129, 0.4)',
  },
};

export type WeaponType = 'RIFLE' | 'SHOTGUN';

export interface WeaponDef {
  type: WeaponType;
  name: string;
  damage: number;
  fireRate: number; // shots per second
  cooldownMs: number;
  pelletCount: number;
  spreadAngleRad: number;
  speed: number;
  range: number;
  projectileColor: string;
  trailColor: string;
  iconName: string;
}

export interface PlayerInput {
  moveX: number; // -1 to 1
  moveY: number; // -1 to 1
  aimX: number; // -1 to 1
  aimY: number; // -1 to 1
  isAiming: boolean;
  fire: boolean;
  jump: boolean;
  dash: boolean;
  switchWeapon: boolean;
  shield: boolean;
}

export interface PlayerSlotData {
  slot: number; // 1 to 4
  id: string;
  name: string;
  team: TeamId;
  ready: boolean;
  connected: boolean;
}

export interface PlayerEntity {
  slot: number;
  id: string;
  name: string;
  team: TeamId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  facing: 1 | -1;
  isGrounded: boolean;
  isJumping: boolean;
  jumpCount: number;
  hp: number;
  maxHp: number;
  isAlive: boolean;
  selectedWeapon: WeaponType;
  lastFireTime: number;
  // Shield / Protection
  isShieldActive: boolean;
  shieldEndTime: number;
  shieldCooldownEndTime: number;
  // Dash / Speed
  isDashing: boolean;
  dashEndTime: number;
  dashCooldownEndTime: number;
  // Animations & visuals
  runFrame: number;
  recoilAngle: number;
  hitFlashTimer: number;
  deathTimer: number;
  score: number;
  kills: number;
  deaths: number;
  isBot?: boolean;
  ghosts?: { x: number; y: number; facing: 1 | -1; alpha: number; color: string }[];
  inputs: PlayerInput;
}

export interface Projectile {
  id: string;
  ownerSlot: number;
  team: TeamId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  rangeRemaining: number;
  color: string;
  weaponType: WeaponType;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  life: number;
  maxLife: number;
  alpha: number;
  type?: 'spark' | 'smoke' | 'flash' | 'ring' | 'debris' | 'star';
}

export interface Platform {
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'solid' | 'one-way' | 'cover';
  material?: 'metal' | 'concrete' | 'hazard' | 'energy';
}

export interface MapData {
  width: number;
  height: number;
  spawnPoints: { x: number; y: number; team?: TeamId }[];
  platforms: Platform[];
}

export type MatchState = 'LOBBY' | 'COUNTDOWN' | 'PLAYING' | 'ENDED';

export interface MatchSummary {
  winnerTeam: TeamId | null;
  winnerPlayers: string[];
  durationSec: number;
  mvpSlot?: number;
}
