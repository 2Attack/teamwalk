'use client';

import { useEffect, useRef } from 'react';

/**
 * One-shot pixel fireworks over the whole viewport
 * (specs/001-first-place-fireworks, TZ § 6.8 "Layer 3").
 *
 * Purely decorative: pointer-transparent, aria-hidden, silent. The component
 * is mounted only for the duration of a burst; the rAF loop stops on its own
 * and `onDone` lets the owner unmount it, leaving zero residual work (FR-006).
 * Remount with a new `key` to restart instead of queueing (FR-003).
 */

interface FireworksOverlayProps {
  /** Monotonic id of the burst being played; a new id means a fresh mount. */
  burstId: number;
  /** Called once when the burst has fully finished. */
  onDone: () => void;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Square side in CSS px — chunky on purpose. */
  size: number;
  color: string;
  /** Seconds of life left; also drives the end-of-life flicker. */
  ttl: number;
}

/** Hard stop even if some particle maths goes long (SC-002: gone within 6 s). */
const MAX_DURATION_MS = 6_000;
const PARTICLE_TTL_S = 2.2;
const GRAVITY = 320; // CSS px / s²
const ROCKETS = 3;
const PARTICLES_PER_ROCKET = 36;

/**
 * Burst colors come from the palette tokens in app/globals.css — canvas cannot
 * use CSS vars directly, so they are resolved once per mount. The white
 * fallback only guards against a token being renamed; it must never be the
 * normal path.
 */
function resolvePalette(): string[] {
  const style = getComputedStyle(document.documentElement);
  const palette = ['--color-citrus', '--color-lime', '--color-silver', '--color-bronze']
    .map((token) => style.getPropertyValue(token).trim())
    .filter(Boolean);
  return palette.length > 0 ? palette : ['#ffffff'];
}

function spawnBurst(width: number, height: number, palette: string[]): Particle[] {
  const particles: Particle[] = [];
  for (let rocket = 0; rocket < ROCKETS; rocket += 1) {
    // Explosion centers spread across the upper half, where the podium lives.
    const cx = width * (0.25 + (0.5 * (rocket + 0.5)) / ROCKETS);
    const cy = height * (0.2 + 0.15 * ((rocket * 7) % 3));
    for (let i = 0; i < PARTICLES_PER_ROCKET; i += 1) {
      const angle = (Math.PI * 2 * i) / PARTICLES_PER_ROCKET;
      // Deterministic pseudo-jitter: varied speeds without Math.random noise
      // between frames (the pattern is fixed per burst anyway).
      const speed = 90 + 70 * (((i * 13 + rocket * 5) % 7) / 6);
      particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 40,
        size: 4 + ((i + rocket) % 3) * 2,
        color: palette[(i + rocket) % palette.length],
        ttl: PARTICLE_TTL_S * (0.6 + 0.4 * (((i * 11) % 5) / 4)),
      });
    }
  }
  return particles;
}

export function FireworksOverlay({ burstId, onDone }: FireworksOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Latest callback without restarting the effect if the owner re-renders.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      onDoneRef.current();
      return;
    }

    // Size is fixed at mount: the effect lives ~5 s, chasing resizes is not
    // worth per-frame layout reads on a weak tablet.
    const width = window.innerWidth;
    const height = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;

    const particles = spawnBurst(width, height, resolvePalette());
    let raf = 0;
    let started: number | null = null;
    let last: number | null = null;
    let finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      onDoneRef.current();
    };

    const step = (now: number) => {
      if (started === null) started = now;
      // A background tab pauses rAF; the timestamp gap on return lands past
      // the cap and the burst ends instead of resuming stale (FR-006).
      const dt = Math.min((now - (last ?? now)) / 1000, 0.05);
      last = now;

      ctx.clearRect(0, 0, width, height);
      let alive = 0;
      for (const p of particles) {
        p.ttl -= dt;
        if (p.ttl <= 0) continue;
        alive += 1;
        p.vy += GRAVITY * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        // End-of-life flicker instead of alpha fade: pixels blink, not dissolve.
        if (p.ttl < 0.5 && Math.floor(p.ttl * 10) % 2 === 0) continue;
        ctx.fillStyle = p.color;
        // Integer snap keeps squares on the pixel grid (FR-008).
        ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
      }

      if (alive === 0 || now - started >= MAX_DURATION_MS) {
        finish();
        return;
      }
      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [burstId]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-50 h-full w-full"
    />
  );
}
