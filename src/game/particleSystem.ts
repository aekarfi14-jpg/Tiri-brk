import { Particle } from '../types.ts';

export class ParticleSystem {
  private particles: Particle[] = [];

  public update(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1);
        continue;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // Apply light gravity to debris/sparks
      if (p.type === 'debris' || p.type === 'spark') {
        p.vy += 450 * dt;
      }

      p.alpha = Math.max(0, 1 - p.life / p.maxLife);
    }
  }

  public render(ctx: CanvasRenderingContext2D) {
    for (const p of this.particles) {
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;

      if (p.type === 'ring') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3 * (1 - p.life / p.maxLife);
        ctx.beginPath();
        const currentRadius = p.size * (p.life / p.maxLife);
        ctx.arc(p.x, p.y, currentRadius, 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.type === 'smoke') {
        ctx.beginPath();
        const currentRadius = p.size * (1 + (p.life / p.maxLife) * 1.5);
        ctx.arc(p.x, p.y, currentRadius, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  public addMuzzleFlash(x: number, y: number, angle: number, color: string) {
    // Muzzle blast core
    this.particles.push({
      x,
      y,
      vx: Math.cos(angle) * 80,
      vy: Math.sin(angle) * 80,
      color: '#ffffff',
      size: 9,
      life: 0,
      maxLife: 0.08,
      alpha: 1,
      type: 'flash',
    });

    // Muzzle sparks
    for (let i = 0; i < 6; i++) {
      const spread = (Math.random() - 0.5) * 0.8;
      const speed = 150 + Math.random() * 200;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle + spread) * speed,
        vy: Math.sin(angle + spread) * speed,
        color,
        size: 2 + Math.random() * 2.5,
        life: 0,
        maxLife: 0.14 + Math.random() * 0.1,
        alpha: 1,
        type: 'spark',
      });
    }
  }

  public addHitSparks(x: number, y: number, color: string, count: number = 8) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 80 + Math.random() * 260;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 60,
        color,
        size: 2 + Math.random() * 2.5,
        life: 0,
        maxLife: 0.25 + Math.random() * 0.2,
        alpha: 1,
        type: 'debris',
      });
    }
  }

  public addShieldDeflect(x: number, y: number) {
    this.particles.push({
      x,
      y,
      vx: 0,
      vy: 0,
      color: '#38bdf8',
      size: 38,
      life: 0,
      maxLife: 0.26,
      alpha: 1,
      type: 'ring',
    });

    for (let i = 0; i < 7; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 120 + Math.random() * 150;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: '#7dd3fc',
        size: 3,
        life: 0,
        maxLife: 0.2,
        alpha: 1,
        type: 'spark',
      });
    }
  }

  public addDashPuff(x: number, y: number, facing: 1 | -1) {
    for (let i = 0; i < 5; i++) {
      this.particles.push({
        x: x - facing * 12,
        y: y + 10 + (Math.random() - 0.5) * 8,
        vx: -facing * (80 + Math.random() * 120),
        vy: (Math.random() - 0.5) * 40,
        color: 'rgba(203, 213, 225, 0.6)',
        size: 5 + Math.random() * 4,
        life: 0,
        maxLife: 0.22,
        alpha: 0.7,
        type: 'smoke',
      });
    }
  }

  public addEliminationExplosion(x: number, y: number, teamColor: string) {
    // Shockwave ring
    this.particles.push({
      x,
      y,
      vx: 0,
      vy: 0,
      color: '#ffffff',
      size: 65,
      life: 0,
      maxLife: 0.45,
      alpha: 1,
      type: 'ring',
    });

    // Secondary colored ring
    this.particles.push({
      x,
      y,
      vx: 0,
      vy: 0,
      color: teamColor,
      size: 90,
      life: 0,
      maxLife: 0.55,
      alpha: 1,
      type: 'ring',
    });

    // Explosive debris
    for (let i = 0; i < 28; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 140 + Math.random() * 320;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 100,
        color: Math.random() > 0.4 ? teamColor : '#ffffff',
        size: 3 + Math.random() * 4,
        life: 0,
        maxLife: 0.6 + Math.random() * 0.4,
        alpha: 1,
        type: 'debris',
      });
    }
  }

  public clear() {
    this.particles = [];
  }
}
