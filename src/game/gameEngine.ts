import {
  MatchState,
  MatchSummary,
  PlayerEntity,
  PlayerInput,
  PlayerSlotData,
  Projectile,
  TeamId,
  TEAMS,
  WeaponType,
} from '../types.ts';
import { ARENA_MAP } from './mapData.ts';
import { PHYSICS, WEAPONS } from './constants.ts';
import { ParticleSystem } from './particleSystem.ts';
import { CharacterRenderer } from './characterRenderer.ts';
import { sound } from '../audio/soundEngine.ts';
import confetti from 'canvas-confetti';

export class GameEngine {
  public map = ARENA_MAP;
  public players: Map<number, PlayerEntity> = new Map();
  public projectiles: Projectile[] = [];
  public particles = new ParticleSystem();

  // Camera tracking
  public cameraX = 0;
  public cameraY = 0;
  public targetCameraX = 0;
  public targetCameraY = 0;
  public screenShake = 0;

  // Match state
  public matchState: MatchState = 'LOBBY';
  public countdownTimer = 0;
  public matchStartTime = 0;
  public matchSummary: MatchSummary | null = null;

  // Callbacks
  public onStateChange?: (state: MatchState, summary?: MatchSummary | null) => void;
  public onPhoneHaptic?: (slot: number, effect: string, hp: number, maxHp: number) => void;

  constructor() {
    this.particles = new ParticleSystem();
  }

  // Initialize match with connected players
  public initMatch(roster: PlayerSlotData[]) {
    this.players.clear();
    this.projectiles = [];
    this.particles.clear();
    this.matchSummary = null;

    roster.forEach((p, idx) => {
      const spawn = this.map.spawnPoints[idx % this.map.spawnPoints.length];
      const entity: PlayerEntity = {
        slot: p.slot,
        id: p.id,
        name: p.name,
        team: p.team,
        x: spawn.x,
        y: spawn.y,
        vx: 0,
        vy: 0,
        width: PHYSICS.PLAYER_WIDTH,
        height: PHYSICS.PLAYER_HEIGHT,
        facing: spawn.x < this.map.width / 2 ? 1 : -1,
        isGrounded: false,
        isJumping: false,
        jumpCount: 0,
        hp: PHYSICS.MAX_HP,
        maxHp: PHYSICS.MAX_HP,
        isAlive: true,
        selectedWeapon: 'RIFLE',
        lastFireTime: 0,
        isShieldActive: false,
        shieldEndTime: 0,
        shieldCooldownEndTime: 0,
        isDashing: false,
        dashEndTime: 0,
        dashCooldownEndTime: 0,
        runFrame: 0,
        recoilAngle: 0,
        hitFlashTimer: 0,
        deathTimer: 0,
        score: 0,
        kills: 0,
        deaths: 0,
        inputs: {
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
        },
      };
      this.players.set(p.slot, entity);
    });

    this.startCountdown();
  }

  // Initialize Practice / Bot Training Match
  public initPracticeMatch(humanRoster: PlayerSlotData[], botCount: number = 2) {
    const fullRoster: PlayerSlotData[] = [...humanRoster];
    const botTeams: TeamId[] = ['BLUE', 'GREEN', 'RED'];
    const botNames = ['Training Drone Alfa', 'Combat Dummy Bravo', 'Assault Bot Echo'];

    for (let b = 1; b <= botCount; b++) {
      const botSlot = fullRoster.length + 1;
      if (botSlot <= 4) {
        fullRoster.push({
          slot: botSlot,
          id: `bot_${Date.now()}_${b}`,
          name: botNames[b - 1] || `Practice Bot ${b}`,
          team: botTeams[(b - 1) % botTeams.length],
          ready: true,
          connected: true,
        });
      }
    }

    this.initMatch(fullRoster);

    // Mark bot entities
    for (let b = 1; b <= botCount; b++) {
      const botSlot = humanRoster.length + b;
      const entity = this.players.get(botSlot);
      if (entity) {
        entity.isBot = true;
      }
    }
  }

  public startCountdown() {
    this.matchState = 'COUNTDOWN';
    this.countdownTimer = 3.5;
    sound.playCountdown(false);
    if (this.onStateChange) this.onStateChange('COUNTDOWN');
  }

  // Handle phone controller input
  public handleInput(slot: number, inputs: PlayerInput) {
    const player = this.players.get(slot);
    if (!player || !player.isAlive) return;

    // Check weapon switch edge trigger
    if (inputs.switchWeapon && !player.inputs.switchWeapon) {
      player.selectedWeapon = player.selectedWeapon === 'RIFLE' ? 'SHOTGUN' : 'RIFLE';
      sound.playWeaponSwitch();
    }

    // Check shield protection trigger (3.5s active / 10s cooldown)
    const now = performance.now();
    if (inputs.shield && !player.inputs.shield) {
      if (now >= player.shieldCooldownEndTime && !player.isShieldActive) {
        player.isShieldActive = true;
        player.shieldEndTime = now + PHYSICS.SHIELD_DURATION_MS;
        player.shieldCooldownEndTime = now + PHYSICS.SHIELD_COOLDOWN_MS;
        sound.playShieldActivate();
        if (this.onPhoneHaptic) {
          this.onPhoneHaptic(slot, 'shield', player.hp, player.maxHp);
        }
      }
    }

    // Check dash trigger (crazy kinetic burst & bullet invulnerability frames)
    if (inputs.dash && !player.inputs.dash) {
      if (now >= player.dashCooldownEndTime && !player.isDashing) {
        player.isDashing = true;
        player.dashEndTime = now + PHYSICS.DASH_DURATION_MS;
        player.dashCooldownEndTime = now + PHYSICS.DASH_COOLDOWN_MS;
        const dashDir = player.inputs.moveX !== 0 ? Math.sign(player.inputs.moveX) : player.facing;
        player.facing = (dashDir > 0 ? 1 : -1);
        player.vx = dashDir * PHYSICS.DASH_SPEED;
        player.vy = -70; // level horizontal burst
        this.particles.addDashPuff(player.x, player.y, player.facing);
        sound.playDash();
      }
    }

    // Check jump edge trigger - STRICTLY SINGLE JUMP (double jump removed)
    if (inputs.jump && !player.inputs.jump) {
      if (player.isGrounded) {
        player.vy = PHYSICS.JUMP_VELOCITY;
        player.isGrounded = false;
        player.isJumping = true;
        player.jumpCount = 1;
        this.particles.addDashPuff(player.x, player.y + 20, player.facing);
        sound.playJump();
      }
    }

    // Variable jump height: release early to cut jump short for quick arcade hops!
    if (!inputs.jump && player.inputs.jump) {
      if (player.vy < -200) {
        player.vy *= 0.55;
      }
    }

    player.inputs = { ...inputs };
  }

  // Update Game Loop (dt in seconds)
  public update(dt: number) {
    const now = performance.now();

    // 1. Countdown update
    if (this.matchState === 'COUNTDOWN') {
      const prevInt = Math.ceil(this.countdownTimer);
      this.countdownTimer -= dt;
      const nextInt = Math.ceil(this.countdownTimer);

      if (nextInt > 0 && nextInt < prevInt) {
        sound.playCountdown(false);
      }

      if (this.countdownTimer <= 0) {
        this.matchState = 'PLAYING';
        this.matchStartTime = now;
        sound.playCountdown(true);
        sound.startBattleMusic();
        if (this.onStateChange) this.onStateChange('PLAYING');
      }
      return;
    }

    if (this.matchState !== 'PLAYING') {
      this.particles.update(dt);
      return;
    }

    // 2. Update each player
    for (const player of this.players.values()) {
      if (!player.isAlive) {
        player.deathTimer += dt;
        continue;
      }

      // If entity is a Practice Training Bot, execute AI logic
      if (player.isBot) {
        this.updateBotAI(player, dt, now);
      }

      // Check Shield expiry
      if (player.isShieldActive && now >= player.shieldEndTime) {
        player.isShieldActive = false;
      }

      // Check Dash expiry
      if (player.isDashing && now >= player.dashEndTime) {
        player.isDashing = false;
      }

      // Update Dash Ghosts
      if (player.ghosts && player.ghosts.length > 0) {
        for (let gi = player.ghosts.length - 1; gi >= 0; gi--) {
          player.ghosts[gi].alpha -= dt * 3.5;
          if (player.ghosts[gi].alpha <= 0) {
            player.ghosts.splice(gi, 1);
          }
        }
      }

      // Add speed ghost echoes while dashing
      if (player.isDashing) {
        if (!player.ghosts) player.ghosts = [];
        if (player.ghosts.length < 5) {
          player.ghosts.push({
            x: player.x,
            y: player.y,
            facing: player.facing,
            alpha: 0.75,
            color: TEAMS[player.team]?.color || '#38bdf8',
          });
        }
      }

      // Decrement timers
      if (player.hitFlashTimer > 0) player.hitFlashTimer -= dt;
      if (player.recoilAngle > 0) player.recoilAngle = Math.max(0, player.recoilAngle - dt * 4);

      // Facing
      if (player.inputs.aimX !== 0) {
        player.facing = player.inputs.aimX > 0 ? 1 : -1;
      } else if (Math.abs(player.inputs.moveX) > 0.1) {
        player.facing = player.inputs.moveX > 0 ? 1 : -1;
      }

      // Horizontal movement & acceleration with sharp snap-turn
      if (!player.isDashing) {
        const targetSpeed = player.inputs.moveX * PHYSICS.MOVE_SPEED;
        const accel = player.isGrounded ? PHYSICS.ACCELERATION : PHYSICS.AIR_ACCELERATION;
        const decel = player.isGrounded ? PHYSICS.DECELERATION : PHYSICS.AIR_DECELERATION;

        if (Math.abs(targetSpeed) > 0.05) {
          // Sharp snap-turn: If reversing direction, apply 2.2x acceleration for razor-fast arcade response
          const isReversing = (targetSpeed > 0 && player.vx < -30) || (targetSpeed < 0 && player.vx > 30);
          const effectiveAccel = isReversing ? accel * 2.2 : accel;

          if (player.vx < targetSpeed) {
            player.vx = Math.min(targetSpeed, player.vx + effectiveAccel * dt);
          } else if (player.vx > targetSpeed) {
            player.vx = Math.max(targetSpeed, player.vx - effectiveAccel * dt);
          }
        } else {
          // Decelerate to stop
          if (player.vx > 0) {
            player.vx = Math.max(0, player.vx - decel * dt);
          } else if (player.vx < 0) {
            player.vx = Math.min(0, player.vx + decel * dt);
          }
        }
      }

      // Vertical Gravity
      player.vy += PHYSICS.GRAVITY * dt;
      if (player.vy > PHYSICS.TERMINAL_VELOCITY) {
        player.vy = PHYSICS.TERMINAL_VELOCITY;
      }

      // Run animation frame counter
      if (player.isGrounded && Math.abs(player.vx) > 10) {
        player.runFrame += dt * (Math.abs(player.vx) / 100);
      }

      // Integrate Position with Sub-stepping for rock-solid collision
      this.resolvePlayerPhysics(player, dt);

      // Weapon firing
      if (player.inputs.fire) {
        this.attemptFire(player, now);
      }
    }

    // 3. Update Projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      const stepX = proj.vx * dt;
      const stepY = proj.vy * dt;
      const stepDist = Math.hypot(stepX, stepY);

      proj.x += stepX;
      proj.y += stepY;
      proj.rangeRemaining -= stepDist;

      // Check map boundary or range expiry
      if (
        proj.rangeRemaining <= 0 ||
        proj.x < 0 ||
        proj.x > this.map.width ||
        proj.y < 0 ||
        proj.y > this.map.height
      ) {
        this.projectiles.splice(i, 1);
        continue;
      }

      // Check solid wall/platform collision
      let hitSolid = false;
      for (const plat of this.map.platforms) {
        if (
          proj.x >= plat.x &&
          proj.x <= plat.x + plat.width &&
          proj.y >= plat.y &&
          proj.y <= plat.y + plat.height
        ) {
          hitSolid = true;
          this.particles.addHitSparks(proj.x, proj.y, proj.color, 4);
          break;
        }
      }

      if (hitSolid) {
        this.projectiles.splice(i, 1);
        continue;
      }

      // Check player hit
      let hitPlayer = false;
      for (const target of this.players.values()) {
        if (!target.isAlive || target.slot === proj.ownerSlot) continue;
        // Ignore friendly fire if same team
        if (target.team === proj.team) continue;

        // Player bounding box (centered at x, feet at y+27)
        const left = target.x - target.width / 2;
        const right = target.x + target.width / 2;
        const top = target.y - target.height / 2;
        const bottom = target.y + target.height / 2;

        if (proj.x >= left && proj.x <= right && proj.y >= top && proj.y <= bottom) {
          hitPlayer = true;
          this.applyHit(target, proj);
          break;
        }
      }

      if (hitPlayer) {
        this.projectiles.splice(i, 1);
      }
    }

    // 4. Update Particles
    this.particles.update(dt);

    // 5. Update Camera
    this.updateCamera(dt);

    // 6. Check Match Win Conditions
    this.checkWinConditions();
  }

  // Sub-stepped physics & collision resolution
  private resolvePlayerPhysics(player: PlayerEntity, dt: number) {
    // 1. Horizontal movement
    player.x += player.vx * dt;

    // Boundary clamping
    const halfW = player.width / 2;
    if (player.x - halfW < 10) {
      player.x = 10 + halfW;
      player.vx = 0;
    } else if (player.x + halfW > this.map.width - 10) {
      player.x = this.map.width - 10 - halfW;
      player.vx = 0;
    }

    // Horizontal platform collisions
    for (const plat of this.map.platforms) {
      if (plat.type !== 'solid') continue;
      // Overlap on Y
      const playerTop = player.y - player.height / 2;
      const playerBottom = player.y + player.height / 2;
      if (playerBottom > plat.y + 4 && playerTop < plat.y + plat.height - 4) {
        if (player.vx > 0 && player.x + halfW > plat.x && player.x - halfW < plat.x) {
          player.x = plat.x - halfW;
          player.vx = 0;
        } else if (
          player.vx < 0 &&
          player.x - halfW < plat.x + plat.width &&
          player.x + halfW > plat.x + plat.width
        ) {
          player.x = plat.x + plat.width + halfW;
          player.vx = 0;
        }
      }
    }

    // 2. Vertical movement
    const prevY = player.y;
    player.y += player.vy * dt;
    player.isGrounded = false;

    const feetY = player.y + player.height / 2;
    const prevFeetY = prevY + player.height / 2;

    // Platform vertical collision (landing on top or hitting ceiling)
    for (const plat of this.map.platforms) {
      // Overlap on X
      if (player.x + halfW * 0.7 > plat.x && player.x - halfW * 0.7 < plat.x + plat.width) {
        // Landing on platform top
        if (prevFeetY <= plat.y + 8 && feetY >= plat.y) {
          player.y = plat.y - player.height / 2;
          player.vy = 0;
          player.isGrounded = true;
          player.isJumping = false;
          player.jumpCount = 0;
        }
        // Hitting ceiling from underneath
        else if (plat.type === 'solid' && player.vy < 0) {
          const headY = player.y - player.height / 2;
          if (headY <= plat.y + plat.height && headY >= plat.y) {
            player.y = plat.y + plat.height + player.height / 2;
            player.vy = 0;
          }
        }
      }
    }
  }

  // Weapon firing logic
  private attemptFire(player: PlayerEntity, now: number) {
    const weaponDef = WEAPONS[player.selectedWeapon];
    if (now - player.lastFireTime < weaponDef.cooldownMs) return;

    player.lastFireTime = now;
    player.recoilAngle = player.selectedWeapon === 'SHOTGUN' ? 0.35 : 0.15;

    // Aim direction calculation
    let aimAngle = 0;
    if (player.inputs.aimX !== 0 || player.inputs.aimY !== 0) {
      aimAngle = Math.atan2(player.inputs.aimY, player.inputs.aimX);
    } else {
      aimAngle = player.facing === 1 ? 0 : Math.PI;
    }

    // Muzzle position in world coords
    const muzzleDist = 26;
    const muzzleX = player.x + Math.cos(aimAngle) * muzzleDist;
    const muzzleY = player.y - 6 + Math.sin(aimAngle) * muzzleDist;

    // Spawn Particles & Sound
    this.particles.addMuzzleFlash(muzzleX, muzzleY, aimAngle, weaponDef.projectileColor);

    if (player.selectedWeapon === 'RIFLE') {
      sound.playRifleShoot();
    } else {
      sound.playShotgunShoot();
      this.screenShake = 5; // punchy screen shake on shotgun
    }

    // Spawn Projectile(s)
    for (let i = 0; i < weaponDef.pelletCount; i++) {
      let pelletAngle = aimAngle;
      if (weaponDef.pelletCount > 1) {
        const spread = (i / (weaponDef.pelletCount - 1) - 0.5) * weaponDef.spreadAngleRad;
        pelletAngle += spread + (Math.random() - 0.5) * 0.05;
      }

      this.projectiles.push({
        id: `p_${now}_${Math.random().toString(36).substring(2, 6)}`,
        ownerSlot: player.slot,
        team: player.team,
        x: muzzleX,
        y: muzzleY,
        vx: Math.cos(pelletAngle) * weaponDef.speed,
        vy: Math.sin(pelletAngle) * weaponDef.speed,
        radius: player.selectedWeapon === 'SHOTGUN' ? 3.5 : 4,
        damage: weaponDef.damage,
        rangeRemaining: weaponDef.range,
        color: weaponDef.projectileColor,
        weaponType: player.selectedWeapon,
      });
    }

    if (this.onPhoneHaptic) {
      this.onPhoneHaptic(player.slot, 'fire', player.hp, player.maxHp);
    }
  }

  // Apply bullet damage, dash dodge or shield deflection
  private applyHit(target: PlayerEntity, proj: Projectile) {
    // 0. Tactical Bullet Dodge during active Dash!
    if (target.isDashing) {
      this.particles.addDashPuff(proj.x, proj.y, target.facing);
      return; // Evasive dash dodged the projectile cleanly!
    }

    // 1. Shield Protection Active (3.5s immunity)
    if (target.isShieldActive) {
      this.particles.addShieldDeflect(proj.x, proj.y);
      sound.playShieldDeflect();
      if (this.onPhoneHaptic) {
        this.onPhoneHaptic(target.slot, 'shield_hit', target.hp, target.maxHp);
      }
      return;
    }

    // 2. Standard Damage
    target.hp = Math.max(0, target.hp - proj.damage);
    target.hitFlashTimer = 0.14;
    sound.playHit();
    this.screenShake = Math.max(this.screenShake, 4);

    // Particle blood / sparks
    const teamDef = TEAMS[target.team];
    this.particles.addHitSparks(proj.x, proj.y, teamDef.color, 9);

    // Slight knockback
    const knockDir = proj.vx > 0 ? 1 : -1;
    target.vx += knockDir * 120;
    target.vy -= 80;

    // Check Elimination
    if (target.hp <= 0) {
      target.isAlive = false;
      target.deathTimer = 0;
      target.deaths++;

      // Award kill to shooter
      const shooter = this.players.get(proj.ownerSlot);
      if (shooter) {
        shooter.kills++;
        shooter.score += 100;
      }

      this.particles.addEliminationExplosion(target.x, target.y, teamDef.color);
      sound.playElimination();
      this.screenShake = 12;

      if (this.onPhoneHaptic) {
        this.onPhoneHaptic(target.slot, 'eliminated', target.hp, target.maxHp);
      }
    } else {
      if (this.onPhoneHaptic) {
        this.onPhoneHaptic(target.slot, 'hit', target.hp, target.maxHp);
      }
    }
  }

  // Camera tracking: Center on active alive players
  private updateCamera(dt: number) {
    if (this.screenShake > 0) {
      this.screenShake = Math.max(0, this.screenShake - dt * 18);
    }

    let aliveCount = 0;
    let avgX = 0;
    let avgY = 0;

    for (const p of this.players.values()) {
      if (p.isAlive) {
        avgX += p.x;
        avgY += p.y;
        aliveCount++;
      }
    }

    if (aliveCount > 0) {
      this.targetCameraX = avgX / aliveCount;
      this.targetCameraY = avgY / aliveCount;
    } else {
      this.targetCameraX = this.map.width / 2;
      this.targetCameraY = this.map.height / 2;
    }

    // Smooth lerp camera
    this.cameraX += (this.targetCameraX - this.cameraX) * Math.min(1, 6 * dt);
    this.cameraY += (this.targetCameraY - this.cameraY) * Math.min(1, 6 * dt);
  }

  // Check victory condition
  private checkWinConditions() {
    const alivePlayers = Array.from(this.players.values()).filter((p) => p.isAlive);
    const aliveTeams = new Set(alivePlayers.map((p) => p.team));

    // If more than 1 player was in the match and only 1 team remains
    if (this.players.size >= 2 && aliveTeams.size <= 1) {
      this.matchState = 'ENDED';
      sound.stopBattleMusic();
      sound.playVictory();

      // Trigger Confetti!
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });

      const winnerTeam = aliveTeams.size === 1 ? Array.from(aliveTeams)[0] : null;
      const winnerPlayers = winnerTeam
        ? Array.from(this.players.values())
            .filter((p) => p.team === winnerTeam)
            .map((p) => p.name)
        : [];

      this.matchSummary = {
        winnerTeam,
        winnerPlayers,
        durationSec: Math.round((performance.now() - this.matchStartTime) / 1000),
      };

      if (this.onStateChange) {
        this.onStateChange('ENDED', this.matchSummary);
      }
    }
  }

  // Render authoritative 2D scene
  public render(ctx: CanvasRenderingContext2D, width: number, height: number) {
    const now = performance.now();

    // 1. Clear background (Atmospheric cyber dark grid)
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, width, height);

    // 2. Camera Transform & Screen Shake
    ctx.save();
    const shakeOffsetX = (Math.random() - 0.5) * this.screenShake * 2;
    const shakeOffsetY = (Math.random() - 0.5) * this.screenShake * 2;

    // Keep camera within map bounds
    const clampedCamX = Math.max(width / 2, Math.min(this.map.width - width / 2, this.cameraX));
    const clampedCamY = Math.max(height / 2, Math.min(this.map.height - height / 2, this.cameraY));

    const viewX = width / 2 - clampedCamX + shakeOffsetX;
    const viewY = height / 2 - clampedCamY + shakeOffsetY;

    ctx.translate(viewX, viewY);

    // 3. Parallax Background Cityscape / Neon Grid
    this.drawBackground(ctx, clampedCamX, clampedCamY);

    // 4. Draw Map Architecture (Ground, Buildings, Platforms, Signs)
    this.drawMap(ctx, now);

    // 5. Draw Projectiles
    this.drawProjectiles(ctx);

    // 6. Draw Characters
    for (const p of this.players.values()) {
      CharacterRenderer.drawPlayer(ctx, p, now);
    }

    // 7. Draw Particles
    this.particles.render(ctx);

    ctx.restore(); // Restore camera transform
  }

  // Parallax background
  private drawBackground(ctx: CanvasRenderingContext2D, camX: number, camY: number) {
    ctx.save();
    // Grid lines on distant horizon
    ctx.strokeStyle = 'rgba(30, 41, 59, 0.4)';
    ctx.lineWidth = 1;

    for (let x = 0; x < this.map.width; x += 80) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.map.height);
      ctx.stroke();
    }
    for (let y = 0; y < this.map.height; y += 80) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.map.width, y);
      ctx.stroke();
    }

    // Distant cyber structures in background
    ctx.fillStyle = '#0d1322';
    ctx.fillRect(150, 380, 220, 420);
    ctx.fillRect(500, 290, 300, 510);
    ctx.fillRect(1350, 260, 340, 540);
    ctx.fillRect(1800, 360, 260, 440);

    // Distant warning beacons / windows
    ctx.fillStyle = 'rgba(56, 189, 248, 0.2)';
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(540 + i * 60, 330, 24, 40);
      ctx.fillRect(1400 + i * 70, 310, 30, 50);
    }

    ctx.restore();
  }

  // Draw Map structures, platforms, neon accents
  private drawMap(ctx: CanvasRenderingContext2D, now: number) {
    ctx.save();

    for (const plat of this.map.platforms) {
      // Platform Body
      if (plat.material === 'concrete') {
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(plat.x, plat.y, plat.width, plat.height);
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 2;
        ctx.strokeRect(plat.x, plat.y, plat.width, plat.height);
      } else if (plat.material === 'energy') {
        // Glowing energy platform
        ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
        ctx.fillRect(plat.x, plat.y, plat.width, plat.height);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2.5;
        ctx.shadowColor = '#38bdf8';
        ctx.shadowBlur = 8;
        ctx.strokeRect(plat.x, plat.y, plat.width, plat.height);
        ctx.shadowBlur = 0;
      } else {
        // Heavy metallic steel platform
        ctx.fillStyle = '#111827';
        ctx.fillRect(plat.x, plat.y, plat.width, plat.height);

        // Top edge walk strip with hazard accent
        ctx.fillStyle = '#1f2937';
        ctx.fillRect(plat.x, plat.y, plat.width, 6);

        ctx.strokeStyle = '#374151';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(plat.x, plat.y, plat.width, plat.height);
      }

      // Ground hazard stripe on the main floor
      if (plat.y >= 780) {
        ctx.fillStyle = '#f59e0b';
        for (let hx = plat.x; hx < plat.x + plat.width; hx += 80) {
          ctx.beginPath();
          ctx.moveTo(hx, plat.y);
          ctx.lineTo(hx + 24, plat.y);
          ctx.lineTo(hx + 12, plat.y + 6);
          ctx.lineTo(hx - 12, plat.y + 6);
          ctx.fill();
        }
      }
    }

    // Neon signs on structures
    ctx.font = 'bold 16px Chakra Petch, sans-serif';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('SECTOR 04 [ARENA]', 940, 535);

    ctx.fillStyle = '#ef4444';
    ctx.fillText('VANGUARD OUTPOST', 140, 625);

    ctx.fillStyle = '#3b82f6';
    ctx.fillText('REACTOR STATION', 1840, 625);

    ctx.restore();
  }

  // Draw Projectiles
  private drawProjectiles(ctx: CanvasRenderingContext2D) {
    for (const proj of this.projectiles) {
      ctx.save();
      ctx.shadowColor = proj.color;
      ctx.shadowBlur = 10;
      ctx.fillStyle = proj.color;

      // Projectile bolt elongation along velocity vector
      const angle = Math.atan2(proj.vy, proj.vx);
      ctx.translate(proj.x, proj.y);
      ctx.rotate(angle);

      if (proj.weaponType === 'RIFLE') {
        // Sleek laser capsule
        ctx.beginPath();
        ctx.roundRect(-8, -proj.radius, 16, proj.radius * 2, proj.radius);
        ctx.fill();

        // White hot core
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-4, -1, 8, 2);
      } else {
        // Shotgun pellet sphere
        ctx.beginPath();
        ctx.arc(0, 0, proj.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  // AI Logic for Practice Bots in Training Mode
  private updateBotAI(bot: PlayerEntity, dt: number, now: number) {
    if (!bot.isAlive) return;

    // Scan for nearest enemy target
    let nearestEnemy: PlayerEntity | null = null;
    let nearestDist = Infinity;

    for (const other of this.players.values()) {
      if (!other.isAlive || other.team === bot.team || other.slot === bot.slot) continue;
      const d = Math.hypot(other.x - bot.x, other.y - bot.y);
      if (d < nearestDist) {
        nearestDist = d;
        nearestEnemy = other;
      }
    }

    if (!nearestEnemy) {
      bot.inputs.moveX = 0;
      bot.inputs.fire = false;
      return;
    }

    const dx = nearestEnemy.x - bot.x;
    const dy = nearestEnemy.y - bot.y;

    // Movement: pursue or maintain tactical distance
    let moveDir = 0;
    if (Math.abs(dx) > 180) {
      moveDir = Math.sign(dx);
    } else if (Math.abs(dx) < 90) {
      moveDir = -Math.sign(dx); // back up slightly if too close
    } else {
      moveDir = Math.sin(now / 500) > 0 ? 1 : -1; // strafe
    }
    bot.inputs.moveX = moveDir;

    // Aiming calculation with slight humanized spread
    const aimAngle = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.12;
    bot.inputs.aimX = Math.cos(aimAngle);
    bot.inputs.aimY = Math.sin(aimAngle);
    bot.inputs.isAiming = true;
    bot.facing = dx > 0 ? 1 : -1;

    // Jump over platforms or obstacles if enemy is higher
    if (dy < -60 && bot.isGrounded && Math.random() < 0.05) {
      this.handleInput(bot.slot, { ...bot.inputs, jump: true });
    }

    // Occasional weapon switch
    if (Math.random() < 0.004) {
      this.handleInput(bot.slot, { ...bot.inputs, switchWeapon: true });
    }

    // Shooting within effective combat range
    if (nearestDist < 820) {
      bot.inputs.fire = true;
    } else {
      bot.inputs.fire = false;
    }

    // Tactical Dash to dodge or close in
    if (nearestDist > 300 && Math.random() < 0.015 && now >= bot.dashCooldownEndTime) {
      this.handleInput(bot.slot, { ...bot.inputs, dash: true });
    }

    // Defensive Shield activation when under heavy fire / low HP
    if (bot.hp < 45 && now >= bot.shieldCooldownEndTime && !bot.isShieldActive) {
      this.handleInput(bot.slot, { ...bot.inputs, shield: true });
    }
  }
}
