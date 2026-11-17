import { useEffect, useRef } from "react";

// Site-wide holiday layer, mounted once at the app shell (same pattern as
// AmbientScrollBackground) so every route gets it for free. Canvas, not
// CSS keyframes, for the same reason as ambient-particles.tsx: per-frame
// control over drawing each flake's 6 arms is cheaper here than animating
// a lot of individual DOM/SVG nodes.
// Deliberately sparse and slow -- "snow falling," not a blizzard -- so it
// reads as a seasonal touch, not something that competes with real
// content or becomes annoying on a page someone's actually reading.
//
// Three depths rather than one size of flake: a few large, detailed
// flakes up close, more mid-sized ones, and a scattering of small soft
// dots far away that fall slower. The far layer is what gives the scene
// depth; without it every flake sits on one flat plane in front of the
// page. Total stays modest on purpose.
const NEAR_COUNT = 6;
const MID_COUNT = 15;
const FAR_COUNT = 18;
const ARM_COUNT = 6;

// White snow is invisible on the light theme's off-white page, which is
// why it only ever seemed to exist in dark mode. On light it's drawn in
// a cool slate-blue instead, a touch more opaque.
const COLOR_DARK = "255, 255, 255";
const COLOR_LIGHT = "104, 136, 170";

type Depth = "near" | "mid" | "far";

type Flake = {
  depth: Depth;
  ornament: boolean;
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

// Three things fall, none of them a plain dot:
//  - far:   a tiny hexagon outline -- the six-fold shape of a snow
//           crystal reduced to its geometry, which is what distant snow
//           looks like on this site's instrument-panel aesthetic;
//  - flake: a full six-armed crystal with two tiers of branches and a
//           small hexagonal core, thin single-weight strokes;
//  - ornament: now and then, a glass bauble -- a thin ring with a
//           ribbon running down it and a small ember bow tied on top.
//           Only a handful on screen at once; they are the gift in
//           "gift site", not confetti.
function hexPath(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
}

function drawSnowflake(ctx: CanvasRenderingContext2D, f: Flake, x: number, rgb: string, alphaScale: number) {
  const alpha = Math.min(1, f.opacity * alphaScale);
  ctx.save();
  ctx.translate(x, f.y);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (f.ornament) {
    // Sways a little like something hanging, rather than spinning.
    ctx.rotate(Math.sin(f.driftPhase) * 0.22);
    const r = f.radius;
    ctx.strokeStyle = `rgba(${rgb}, ${alpha})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    // The ribbon round the bauble: one vertical band, slightly curved.
    ctx.strokeStyle = `rgba(255, 90, 61, ${Math.min(1, alpha * 1.1)})`;
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.quadraticCurveTo(r * 0.45, 0, 0, r);
    ctx.stroke();
    // The bow on top: two loops and a knot.
    ctx.fillStyle = `rgba(255, 90, 61, ${Math.min(1, alpha * 1.15)})`;
    const b = r * 0.62;
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.bezierCurveTo(-b * 0.5, -r - b * 1.1, -b * 1.5, -r - b * 0.7, -b * 1.2, -r - b * 0.05);
    ctx.bezierCurveTo(-b * 0.9, -r + b * 0.3, -b * 0.3, -r + b * 0.1, 0, -r);
    ctx.moveTo(0, -r);
    ctx.bezierCurveTo(b * 0.5, -r - b * 1.1, b * 1.5, -r - b * 0.7, b * 1.2, -r - b * 0.05);
    ctx.bezierCurveTo(b * 0.9, -r + b * 0.3, b * 0.3, -r + b * 0.1, 0, -r);
    ctx.fill();
    ctx.restore();
    return;
  }

  ctx.rotate(f.rotation);
  ctx.strokeStyle = `rgba(${rgb}, ${alpha})`;

  if (f.depth === "far") {
    ctx.lineWidth = 0.9;
    hexPath(ctx, f.radius);
    ctx.stroke();
    ctx.restore();
    return;
  }

  ctx.lineWidth = f.depth === "near" ? 1.15 : 1;
  const r = f.radius;
  for (let i = 0; i < ARM_COUNT; i++) {
    ctx.rotate((Math.PI * 2) / ARM_COUNT);
    ctx.beginPath();
    ctx.moveTo(0, r * 0.22);
    ctx.lineTo(0, r);
    // Inner, wider pair of branches...
    ctx.moveTo(0, r * 0.46);
    ctx.lineTo(r * 0.26, r * 0.66);
    ctx.moveTo(0, r * 0.46);
    ctx.lineTo(-r * 0.26, r * 0.66);
    // ...and a shorter pair near the tip.
    ctx.moveTo(0, r * 0.74);
    ctx.lineTo(r * 0.15, r * 0.88);
    ctx.moveTo(0, r * 0.74);
    ctx.lineTo(-r * 0.15, r * 0.88);
    ctx.stroke();
  }
  hexPath(ctx, r * 0.22);
  ctx.stroke();
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
      // Nearer = bigger, faster, wider sway, more opaque (parallax).
      if (f.depth === "near") {
        f.radius = 8 + Math.random() * 4;
        f.speed = 34 + Math.random() * 16;
        f.drift = 22 + Math.random() * 18;
        f.opacity = 0.55 + Math.random() * 0.3;
      } else if (f.depth === "mid") {
        f.radius = 4.5 + Math.random() * 3;
        f.speed = 20 + Math.random() * 14;
        f.drift = 12 + Math.random() * 14;
        f.opacity = 0.4 + Math.random() * 0.3;
      } else {
        f.radius = 2 + Math.random() * 1.6;
        f.speed = 9 + Math.random() * 9;
        f.drift = 5 + Math.random() * 8;
        f.opacity = 0.28 + Math.random() * 0.3;
      }
      if (f.ornament) {
        f.radius = 5.5 + Math.random() * 2.5;
        f.speed = 15 + Math.random() * 8;
        f.opacity = 0.6 + Math.random() * 0.25;
      }
      f.driftPhase = Math.random() * Math.PI * 2;
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
    const depths: Depth[] = [
      ...Array<Depth>(FAR_COUNT).fill("far"),
      ...Array<Depth>(MID_COUNT).fill("mid"),
      ...Array<Depth>(NEAR_COUNT).fill("near"),
    ];
    // Far first, so nearer flakes are painted over distant ones.
    let midSeen = 0;
    for (const depth of depths) {
      // Every third mid-distance slot is a ribbon-tied bauble.
      const ornament = depth === "mid" && midSeen++ % 3 === 2;
      const f: Flake = { depth, ornament, x: 0, y: 0, radius: 0, speed: 0, drift: 0, driftPhase: 0, opacity: 0, rotation: 0, spin: 0 };
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

      // Read per frame so toggling the theme recolours the snow at once.
      const isDark = document.documentElement.classList.contains("dark");
      const rgb = isDark ? COLOR_DARK : COLOR_LIGHT;
      const alphaScale = isDark ? 1 : 1.15;
      // One slow shared gust on top of each flake's own sway, so the
      // whole sky leans the same way now and then.
      const wind = Math.sin(now / 9000) * 18;

      for (const f of flakes) {
        const windShare = f.depth === "near" ? 1 : f.depth === "mid" ? 0.6 : 0.3;
        const x = f.x + Math.sin(f.driftPhase) * f.drift + wind * windShare;
        drawSnowflake(ctx!, f, x, rgb, alphaScale);

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
