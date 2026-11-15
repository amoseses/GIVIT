import { useEffect, useRef } from "react";

// Site-wide holiday layer, mounted once at the app shell (same pattern as
// AmbientScrollBackground) so every route gets it for free. Canvas, not
// CSS keyframes, for the same reason as ambient-particles.tsx: a soft
// trailing/blur look needs per-frame control CSS can't give cheaply.
// Deliberately sparse and slow -- "snow falling," not a blizzard -- so it
// reads as a seasonal touch, not something that competes with real
// content or becomes annoying on a page someone's actually reading.
const FLAKE_COUNT = 45;

type Flake = {
  x: number;
  y: number;
  radius: number;
  speed: number;
  drift: number;
  driftPhase: number;
  opacity: number;
};

export function SeasonalSnow() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let width = window.innerWidth;
    let height = window.innerHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    const flakes: Flake[] = [];

    function spawn(f: Flake) {
      f.x = Math.random() * width;
      f.y = -10 - Math.random() * height;
      f.radius = 1.5 + Math.random() * 2.5;
      f.speed = 18 + Math.random() * 28;
      f.drift = 10 + Math.random() * 20;
      f.driftPhase = Math.random() * Math.PI * 2;
      f.opacity = 0.35 + Math.random() * 0.45;
    }

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas!.width = width * dpr;
      canvas!.height = height * dpr;
      canvas!.style.width = `${width}px`;
      canvas!.style.height = `${height}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    resize();
    for (let i = 0; i < FLAKE_COUNT; i++) {
      const f: Flake = { x: 0, y: 0, radius: 0, speed: 0, drift: 0, driftPhase: 0, opacity: 0 };
      spawn(f);
      f.y = Math.random() * height; // scattered on first paint
      flakes.push(f);
    }

    window.addEventListener("resize", resize);

    let frame: number;
    let lastTime = performance.now();
    function tick(now: number) {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      // Full clear every frame (no trail) -- snow reads as individual
      // flakes, not streaks, unlike the ribbon particles elsewhere.
      ctx!.clearRect(0, 0, width, height);

      for (const f of flakes) {
        const x = f.x + Math.sin(f.driftPhase) * f.drift;
        ctx!.beginPath();
        ctx!.arc(x, f.y, f.radius, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(255, 255, 255, ${f.opacity})`;
        ctx!.fill();

        f.y += f.speed * dt;
        f.driftPhase += dt * 0.6;
        if (f.y - f.radius > height) spawn(f);
      }
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-[60]"
      aria-hidden="true"
    />
  );
}
