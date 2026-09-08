import { PlayerEntity, TEAMS, WeaponType } from '../types.ts';
import { WEAPONS } from './constants.ts';

export class CharacterRenderer {
  public static drawPlayer(ctx: CanvasRenderingContext2D, player: PlayerEntity, now: number) {
    if (!player.isAlive && player.deathTimer > 1.2) {
      return; // Already eliminated and faded
    }

    const team = TEAMS[player.team] || TEAMS.RED;
    const isFlashing = player.hitFlashTimer > 0;
    const isProtected = player.isShieldActive;

    ctx.save();
    ctx.translate(player.x, player.y);

    // Death fade & tilt
    if (!player.isAlive) {
      const deathProgress = Math.min(1, player.deathTimer / 1.0);
      ctx.globalAlpha = Math.max(0, 1 - deathProgress);
      ctx.rotate(player.facing * deathProgress * 0.8);
      ctx.translate(0, deathProgress * 20);
    }

    // Facing direction
    ctx.scale(player.facing, 1);

    // 0. Render Dash Echo Afterimages behind player
    if (player.ghosts && player.ghosts.length > 0) {
      for (const ghost of player.ghosts) {
        ctx.save();
        // Counteract player translation and facing to draw ghost in absolute position
        ctx.translate((ghost.x - player.x) * player.facing, ghost.y - player.y);
        ctx.scale(ghost.facing === player.facing ? 1 : -1, 1);
        ctx.globalAlpha = ghost.alpha * 0.45;
        ctx.fillStyle = ghost.color;
        // Stylized silhouette of character
        ctx.beginPath();
        ctx.roundRect(-12, -26, 24, 46, 6);
        ctx.fill();
        ctx.restore();
      }
    }

    // 1. Soft ground shadow
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 24, 18, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 2. Dash Speed Streak
    if (player.isDashing) {
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = team.color;
      ctx.beginPath();
      ctx.roundRect(-18, -26, 36, 48, 8);
      ctx.fill();
      ctx.restore();
    }

    // 3. Legs and Feet Animation
    const isMoving = Math.abs(player.vx) > 20;
    const legOffset = isMoving
      ? Math.sin(player.runFrame * 12) * 9
      : Math.sin(now / 350) * 1.2;

    // Left (Back) Leg
    ctx.save();
    ctx.fillStyle = isFlashing ? '#ffffff' : '#1e293b';
    if (!player.isGrounded) {
      // Jump tuck
      ctx.fillRect(-10, 8, 7, 10);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(-10, 15, 9, 5); // boot
    } else {
      ctx.fillRect(-9 - legOffset * 0.5, 6, 7, 14);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(-10 - legOffset * 0.5, 17, 10, 6); // boot
    }
    ctx.restore();

    // Right (Front) Leg
    ctx.save();
    ctx.fillStyle = isFlashing ? '#ffffff' : '#334155';
    if (!player.isGrounded) {
      // Jump pose
      ctx.fillRect(2, 6, 7, 12);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(1, 15, 10, 5); // boot
    } else {
      ctx.fillRect(2 + legOffset * 0.5, 6, 7, 14);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(2 + legOffset * 0.5, 17, 10, 6); // boot
    }
    ctx.restore();

    // 4. Torso & Armor
    const breathBob = player.isGrounded && !isMoving ? Math.sin(now / 250) * 1.5 : 0;
    const torsoY = -12 + breathBob;

    ctx.save();
    // Inner undersuit
    ctx.fillStyle = isFlashing ? '#ffffff' : '#1e293b';
    ctx.beginPath();
    ctx.roundRect(-12, torsoY, 24, 20, 4);
    ctx.fill();

    // Chest Tactical Armor Plate (Team colored)
    ctx.fillStyle = isFlashing ? '#ff4d4d' : team.color;
    ctx.beginPath();
    ctx.roundRect(-10, torsoY + 2, 20, 14, 3);
    ctx.fill();

    // Tactical Chest Inset Detail / Badge
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-6, torsoY + 5, 12, 3);
    ctx.fillStyle = team.lightColor;
    ctx.fillRect(-3, torsoY + 6, 6, 1.5);

    // Belt and Pouches
    ctx.fillStyle = '#090d16';
    ctx.fillRect(-11, torsoY + 16, 22, 4);
    ctx.fillStyle = '#475569';
    ctx.fillRect(-8, torsoY + 15, 5, 5);
    ctx.fillRect(3, torsoY + 15, 5, 5);
    ctx.restore();

    // 5. Head & Helmet
    const headY = -28 + breathBob;
    ctx.save();
    // Helmet Base
    ctx.fillStyle = isFlashing ? '#ffffff' : '#334155';
    ctx.beginPath();
    ctx.roundRect(-10, headY, 20, 17, 6);
    ctx.fill();

    // Helmet Crest Stripe (Team color)
    ctx.fillStyle = team.color;
    ctx.fillRect(-3, headY - 1, 6, 6);

    // Glowing Visor
    ctx.fillStyle = isFlashing ? '#ffffff' : '#38bdf8';
    ctx.shadowColor = team.lightColor;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.roundRect(1, headY + 5, 9, 5, 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Tactical Antenna / Headset
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-12, headY + 5, 3, 7);
    ctx.fillRect(-12, headY + 1, 1.5, 4);
    ctx.restore();

    // 6. Arms and Weapon with Aim Rotation
    ctx.save();
    // Gun pivot point near shoulder
    const shoulderX = 0;
    const shoulderY = -6 + breathBob;
    ctx.translate(shoulderX, shoulderY);

    // Calculate gun aim angle relative to player facing
    let aimAngle = 0;
    if (player.inputs.aimX !== 0 || player.inputs.aimY !== 0) {
      const worldAimAngle = Math.atan2(player.inputs.aimY, player.inputs.aimX);
      aimAngle = player.facing === 1 ? worldAimAngle : Math.PI - worldAimAngle;
    } else {
      // Default forward resting aim
      aimAngle = 0;
    }

    // Clamp vertical aim for natural aesthetics (-75 to +75 deg)
    aimAngle = Math.max(-1.3, Math.min(1.3, aimAngle));

    // Apply weapon recoil
    const finalRecoil = (player.recoilAngle || 0);
    ctx.rotate(aimAngle - finalRecoil);

    // Render Weapon Sprite
    this.drawWeapon(ctx, player.selectedWeapon, isFlashing, team.color);

    // Dynamic laser sight when aiming
    if (player.inputs.isAiming || Math.abs(player.inputs.aimX) > 0.15 || Math.abs(player.inputs.aimY) > 0.15) {
      ctx.save();
      ctx.strokeStyle = player.selectedWeapon === 'RIFLE' ? 'rgba(56, 189, 248, 0.45)' : 'rgba(249, 115, 22, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 8]);
      ctx.beginPath();
      ctx.moveTo(32, -2);
      ctx.lineTo(240, -2);
      ctx.stroke();

      // Laser dot target point
      ctx.fillStyle = player.selectedWeapon === 'RIFLE' ? '#38bdf8' : '#f97316';
      ctx.beginPath();
      ctx.arc(240, -2, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Front Arm & Hand
    ctx.fillStyle = isFlashing ? '#ffffff' : '#334155';
    ctx.beginPath();
    ctx.roundRect(-5, -3, 10, 6, 2); // shoulder
    ctx.fill();

    ctx.fillStyle = team.color;
    ctx.fillRect(4, -2, 6, 5); // wrist/glove
    ctx.restore();

    // 7. Energy Shield Dome (if protection active)
    if (isProtected) {
      this.drawShieldDome(ctx, now, team.color, player.shieldEndTime);
    }

    ctx.restore(); // Restore facing & translate

    // 8. Overhead UI: Player Name Tag, Team Icon & Health Bar
    this.drawOverheadHUD(ctx, player, team);
  }

  // Draw Weapon Sprite in Hand
  private static drawWeapon(
    ctx: CanvasRenderingContext2D,
    weaponType: WeaponType,
    isFlashing: boolean,
    teamColor: string
  ) {
    const isRifle = weaponType === 'RIFLE';

    if (isRifle) {
      // --- Weapon 1: Pulse Blaster (Assault Carbine) ---
      // Receiver & Body
      ctx.fillStyle = isFlashing ? '#ffffff' : '#1e293b';
      ctx.fillRect(2, -4, 22, 6);

      // Barrel
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(24, -3, 8, 4);

      // Glowing Plasma Chamber
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(8, -3, 8, 3);

      // Stock
      ctx.fillStyle = '#334155';
      ctx.fillRect(-6, -2, 8, 4);

      // Grip
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(4, 2, 4, 6);

      // Team accent stripe
      ctx.fillStyle = teamColor;
      ctx.fillRect(6, -5, 10, 1.5);
    } else {
      // --- Weapon 2: Scatter Shotgun (Heavy Double Barrel) ---
      // Receiver
      ctx.fillStyle = isFlashing ? '#ffffff' : '#292524';
      ctx.fillRect(0, -6, 18, 9);

      // Heavy twin barrels
      ctx.fillStyle = '#1c1917';
      ctx.fillRect(18, -6, 12, 4);
      ctx.fillRect(18, -1, 12, 4);

      // Ribbed pump handle
      ctx.fillStyle = '#f97316';
      ctx.fillRect(12, 3, 8, 4);

      // Stock
      ctx.fillStyle = '#44403c';
      ctx.fillRect(-8, -4, 9, 6);

      // Grip
      ctx.fillStyle = '#0c0a09';
      ctx.fillRect(3, 3, 4, 7);

      // Heat exhaust vents
      ctx.fillStyle = '#fb923c';
      ctx.fillRect(6, -4, 4, 2);
    }
  }

  // Draw animated holographic shield dome
  private static drawShieldDome(
    ctx: CanvasRenderingContext2D,
    now: number,
    color: string,
    shieldEndTime: number
  ) {
    ctx.save();
    const remainingMs = Math.max(0, shieldEndTime - now);
    const pulse = Math.sin(now / 100) * 0.15 + 0.85;

    // Glowing shield sphere
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 12;

    ctx.beginPath();
    ctx.arc(0, -4, 34 * pulse, 0, Math.PI * 2);
    ctx.stroke();

    // Hex energy mesh lines
    ctx.fillStyle = 'rgba(56, 189, 248, 0.14)';
    ctx.fill();

    // Revolving orbit nodes
    const orbitAngle = now / 400;
    for (let i = 0; i < 3; i++) {
      const a = orbitAngle + (i * Math.PI * 2) / 3;
      const ox = Math.cos(a) * 34;
      const oy = -4 + Math.sin(a) * 16;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ox, oy, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  // Draw player name, team pill and HP bar above character
  private static drawOverheadHUD(
    ctx: CanvasRenderingContext2D,
    player: PlayerEntity,
    team: { name: string; color: string; lightColor: string }
  ) {
    ctx.save();
    const hudY = player.y - 42;

    // 1. Health Bar Container
    const barWidth = 46;
    const barHeight = 5;
    const barX = player.x - barWidth / 2;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(barX - 1, hudY - 1, barWidth + 2, barHeight + 2);

    // Health Fill with color gradient
    const hpRatio = Math.max(0, player.hp / player.maxHp);
    const hpColor =
      hpRatio > 0.5 ? '#22c55e' : hpRatio > 0.25 ? '#eab308' : '#ef4444';
    ctx.fillStyle = hpColor;
    ctx.fillRect(barX, hudY, barWidth * hpRatio, barHeight);

    // 2. Shield Overlay on HP bar if active
    if (player.isShieldActive) {
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(barX, hudY - 3, barWidth, 2);
    }

    // 3. Player Name & Slot
    ctx.font = 'bold 11px Chakra Petch, sans-serif';
    ctx.textAlign = 'center';

    const displayName = player.isBot ? `🤖 ${player.name}` : player.name;

    // Text Shadow
    ctx.fillStyle = '#000000';
    ctx.fillText(displayName, player.x + 1, hudY - 6);

    // Team colored text
    ctx.fillStyle = player.isBot ? '#cbd5e1' : team.lightColor;
    ctx.fillText(displayName, player.x, hudY - 7);

    // Weapon Indicator dot
    ctx.fillStyle = player.selectedWeapon === 'RIFLE' ? '#38bdf8' : '#f97316';
    ctx.beginPath();
    ctx.arc(barX + barWidth + 5, hudY + 2.5, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}
