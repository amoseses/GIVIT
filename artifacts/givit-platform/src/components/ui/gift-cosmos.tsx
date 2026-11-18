import { useEffect, useRef } from "react";

// GIVIT's own "deep space": not stars and not a galaxy photo, but a slow
// three-dimensional swirl of ribbon. Thousands of points are laid along a
// few wide bands that curl outward from a bright core and twist as they go
// (the way a real ribbon does when it's pulled off a spool), so the whole
// thing reads as a nebula from a distance and as gift ribbon up close.
//
// Drawn on a 2D canvas with a hand-rolled perspective projection -- no 3D
// library -- which keeps it to a few KB and lets it sit behind real UI.
// It is decoration only: pointer-events none, aria-hidden, paused while
// off screen, and a single still frame under prefers-reduced-motion.
//
// Usage: put it as the first child of a `relative overflow-hidden`
// container; it fills that container. Content goes on top of it.

type Props = {
  className?: string;
  /** Overall brightness, 0..1. Lower it behind dense UI. Default 0.7. */
  intensity?: number;
  /** Number of ribbon bands. Default 3. */
  arms?: number;
  /** Where the core sits, as a fraction of the container. Default centre. */
  centerX?: number;
  centerY?: number;
  /** Size of the swirl relative to the container's shorter side. Default 1. */
  scale?: number;
  /** Tilt of the disc toward the viewer in degrees (0 = edge on, 90 = top down). Default 62. */
  tilt?: number;
  /** Lean toward the pointer a little as it moves. Default true. */
  interactive?: boolean;
};

type Particle = { x: number; y: number; z: number; t: number; size: number; tone: number; twinkle: number };

const EMBER = [229, 89, 63];
const CORAL = [255, 47, 135];
const GOLD = [255, 196, 120];

function buildParticles(arms: number, count: number): Particle[] {
  const particles: Particle[] = [];
  const perArm = Math.floor(count / arms);
  for (let arm = 0; arm < arms; arm++) {
    for (let i = 0; i < perArm; i++) {
      // t runs from the core (0) to the tip of the ribbon (1); the power
      // keeps more points near the core, where the bands overlap and glow.
      const t = Math.pow(Math.random(), 0.85);
      const radius = 0.06 + t * 0.94;
      const theta = (arm / arms) * Math.PI * 2 + t * Math.PI * 2.4 + (Math.random() - 0.5) * 0.08;
      // Position across the ribbon's width, and the ribbon's own twist at
      // this point along its length: at phi = 0 the band lies flat in the
      // disc, at phi = 90deg it stands on edge.
      const across = (Math.random() - 0.5) * (0.05 + t * 0.16);
      const phi = t * Math.PI * 3 + arm;
      const r = radius + across * Math.cos(phi);
      particles.push({
        x: r * Math.cos(theta),
        z: r * Math.sin(theta),
        y: across * Math.sin(phi) + (Math.random() - 0.5) * 0.012,
        t,
        size: 1 + Math.random() * 1.9,
        tone: Math.random(),
        twinkle: Math.random() * Math.PI * 2,
      });
    }
  }
  // Loose dust well outside the ribbon, so the swirl sits in a volume
  // rather than on an empty backdrop.
  for (let i = 0; i < count * 0.18; i++) {
    const r = 0.3 + Math.random() * 1.5;
    const theta = Math.random() * Math.PI * 2;
    particles.push({
      x: r * Math.cos(theta),
      z: r * Math.sin(theta),
      y: (Math.random() - 0.5) * 0.9,
      t: 1,
      size: 0.5 + Math.random() * 0.8,
      tone: 2, // marks dust
      twinkle: Math.random() * Math.PI * 2,
    });
  }
  return particles;
}

export function GiftCosmos({
  className = "",
  intensity = 0.7,
  arms = 3,
  centerX = 0.5,
  centerY = 0.5,
  scale = 1,
  tilt = 62,
  interactive = true,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = 0;
    let height = 0;
    let particles: Particle[] = [];

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas!.width = Math.max(1, Math.round(width * dpr));
      canvas!.height = Math.max(1, Math.round(height * dpr));
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Density follows area, capped so a huge monitor doesn't get a
      // point count that costs frames.
      const count = Math.round(Math.min(3200, Math.max(800, (width * height) / 360)));
      particles = buildParticles(arms, count);
    }
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    // Pointer lean: eased toward the target each frame so it glides.
    let targetLeanX = 0;
    let targetLeanY = 0;
    let leanX = 0;
    let leanY = 0;
    function onPointerMove(e: PointerEvent) {
      targetLeanX = (e.clientX / window.innerWidth - 0.5) * 0.35;
      targetLeanY = (e.clientY / window.innerHeight - 0.5) * 0.22;
    }
    if (interactive && !reduceMotion) window.addEventListener("pointermove", onPointerMove, { passive: true });

    let visible = true;
    const intersection = new IntersectionObserver(([entry]) => { visible = Boolean(entry?.isIntersecting); });
    intersection.observe(canvas);

    const tiltRad = (tilt * Math.PI) / 180;

    function draw(time: number) {
      const isDark = document.documentElement.classList.contains("dark") || canvas!.closest("[data-cosmos-dark]") !== null;
      // On a light surface the same additive glow would wash out to
      // nothing, so points are drawn darker and a little more opaque.
      const alphaScale = (isDark ? 1 : 0.55) * intensity;
      ctx!.clearRect(0, 0, width, height);
      ctx!.globalCompositeOperation = isDark ? "lighter" : "source-over";

      const cx = width * centerX;
      const cy = height * centerY;
      const radius = Math.min(width, height) * 0.62 * scale;
      const spin = time * 0.00004;
      leanX += (targetLeanX - leanX) * 0.04;
      leanY += (targetLeanY - leanY) * 0.04;

      const cosSpin = Math.cos(spin + leanX);
      const sinSpin = Math.sin(spin + leanX);
      const cosTilt = Math.cos(tiltRad + leanY);
      const sinTilt = Math.sin(tiltRad + leanY);
      const focal = 2.6;

      // Core glow first, under the points.
      const core = ctx!.createRadialGradient(cx, cy, 0, cx, cy, radius * 0.55);
      core.addColorStop(0, `rgba(255, 120, 80, ${0.34 * alphaScale})`);
      core.addColorStop(0.4, `rgba(255, 47, 135, ${0.11 * alphaScale})`);
      core.addColorStop(1, "rgba(255, 47, 135, 0)");
      ctx!.fillStyle = core;
      ctx!.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

      for (const p of particles) {
        // Spin about the vertical axis, then tilt the disc toward the viewer.
        const x1 = p.x * cosSpin - p.z * sinSpin;
        const z1 = p.x * sinSpin + p.z * cosSpin;
        const y2 = p.y * sinTilt - z1 * cosTilt;
        const z2 = p.y * cosTilt + z1 * sinTilt;
        const perspective = focal / (focal + z2);
        const sx = cx + x1 * radius * perspective;
        const sy = cy + y2 * radius * perspective;
        if (sx < -4 || sx > width + 4 || sy < -4 || sy > height + 4) continue;

        const isDust = p.tone === 2;
        const twinkle = reduceMotion ? 1 : 0.75 + 0.25 * Math.sin(time * 0.0012 + p.twinkle);
        const depthFade = Math.min(1, Math.max(0.15, perspective - 0.25));
        let rgb: number[];
        let alpha: number;
        if (isDust) {
          rgb = isDark ? [255, 235, 225] : [120, 90, 80];
          alpha = 0.28 * depthFade * twinkle;
        } else {
          // Ember at the core, coral toward the tips, a few gold flecks.
          const mix = p.t;
          rgb = p.tone > 0.93
            ? GOLD
            : [EMBER[0]! + (CORAL[0]! - EMBER[0]!) * mix, EMBER[1]! + (CORAL[1]! - EMBER[1]!) * mix, EMBER[2]! + (CORAL[2]! - EMBER[2]!) * mix];
          alpha = (1.15 - p.t * 0.5) * depthFade * twinkle;
        }
        const size = p.size * perspective * (isDark ? 1 : 1.1);
        ctx!.fillStyle = `rgba(${rgb[0]! | 0}, ${rgb[1]! | 0}, ${rgb[2]! | 0}, ${Math.min(1, alpha * alphaScale)})`;
        ctx!.fillRect(sx - size / 2, sy - size / 2, size, size);
      }
      ctx!.globalCompositeOperation = "source-over";
    }

    let raf = 0;
    function loop(time: number) {
      if (visible) draw(time);
      raf = requestAnimationFrame(loop);
    }
    if (reduceMotion) draw(0);
    else raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      intersection.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
    };
  }, [arms, centerX, centerY, intensity, interactive, scale, tilt]);

  return <canvas ref={canvasRef} aria-hidden="true" className={`pointer-events-none absolute inset-0 h-full w-full ${className}`} />;
}
