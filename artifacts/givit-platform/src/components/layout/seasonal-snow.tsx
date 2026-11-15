import { useEffect, useRef } from "react";

// Site-wide holiday layer, mounted once at the app shell (same pattern as
// AmbientScrollBackground) so every route gets it for free. Canvas, not
// CSS keyframes, for the same reason as ambient-particles.tsx: per-frame
// control over drawing each flake's 6 arms is cheaper here than animating
// a lot of individual DOM/SVG nodes.
// Deliberately sparse and slow -- "snow falling," not a blizzard -- so it
// reads as a seasonal touch, not something that competes with real
// content or becomes annoying on a page someone's actually reading.
const FLAKE_COUNT = 30;
const ARM_COUNT = 6;

type Flake = {
  x: number;
  y: number;
  radius: number;
  speed: number;
  drift: number;
  driftPhase: number;
  opacity: number;
  rotation: number;
  spin: number;
};

// A real 6-armed snowflake (not a dot): a line out from center plus a
// small V-branch near each tip, repeated every 60 degrees. Rotates slowly
// via `rotation` so flakes don't all sit at the same angle.
function drawSnowflake(ctx: CanvasRenderingContext2D, f: Flake, x: number) {
  ctx.save();
  ctx.translate(x, f.y);
  ctx.rotate(f.rotation);
  ctx.strokeStyle = `rgba(255, 255, 255, ${f.opacity})`;
  ctx.lineWidth = 1;
  ctx.lineCap = "round";
  for (let i = 0; i < ARM_COUNT; i++) {
    ctx.rotate((Math.PI * 2) / ARM_COUNT);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, f.radius);
    ctx.moveTo(0, f.radius * 0.5);
    ctx.lineTo(f.radius * 0.28, f.radius * 0.72);
    ctx.moveTo(0, f.radius * 0.5);
    ctx.lineTo(-f.radius * 0.28, f.radius * 0.72);
    ctx.stroke();
  }
  ctx.restore();
}

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
      f.y = -16 - Math.random() * height;
      f.radius = 5 + Math.random() * 5;
      f.speed = 16 + Math.random() * 22;
      f.drift = 10 + Math.random() * 20;
      f.driftPhase = Math.random() * Math.PI * 2;
      f.opacity = 0.4 + Math.random() * 0.45;
      f.rotation = Math.random() * Math.PI * 2;
      f.spin = (Math.random() < 0.5 ? -1 : 1) * (0.15 + Math.random() * 0.25);
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
      const f: Flake = { x: 0, y: 0, radius: 0, speed: 0, drift: 0, driftPhase: 0, opacity: 0, rotation: 0, spin: 0 };
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
        drawSnowflake(ctx!, f, x);

        f.y += f.speed * dt;
        f.driftPhase += dt * 0.6;
        f.rotation += f.spin * dt;
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
