import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { Minus, Pause, Play, Plus, RotateCcw, UserRound } from "lucide-react";

import { PersonPortrait } from "@/components/personalization/person-portrait";
import { RibbonBow } from "@/components/ui/givit-glyphs";
import { useAuth } from "@/lib/auth/use-auth";
import { RECIPIENT_PHOTOS_CHANGED_EVENT, recipientPhotoUrl } from "@/lib/recipient-photos";
import { getGiftRecipients } from "@/lib/supabase/db";
import { initials } from "@/lib/utils";

type GraphPerson = { id: string; name: string; relationship: string; interests: string[]; photoUrl: string | null };
type Vec3 = { x: number; y: number; z: number };

const MAX_PEOPLE = 12;

// Shown to signed-out visitors so the model isn't a blank space: clearly
// labelled as an example, with made-up people, and nothing is saved.
const EXAMPLE_PEOPLE: GraphPerson[] = [
  { id: "example-1", name: "Maya", relationship: "Sister", interests: ["ceramics", "trail running", "oat lattes"], photoUrl: null },
  { id: "example-2", name: "Dad", relationship: "Father", interests: ["fly fishing", "jazz records"], photoUrl: null },
  { id: "example-3", name: "Priya", relationship: "Best friend", interests: ["film cameras", "houseplants", "ramen", "poetry"], photoUrl: null },
  { id: "example-4", name: "Jordan", relationship: "Partner", interests: ["cycling", "espresso", "sci-fi"], photoUrl: null },
  { id: "example-5", name: "Nana", relationship: "Grandmother", interests: ["gardening", "crosswords"], photoUrl: null },
  { id: "example-6", name: "Sam", relationship: "Coworker", interests: ["board games"], photoUrl: null },
];
const BG = "#0b0b0e";
const EMBER: [number, number, number] = [229, 89, 63];
const CORAL: [number, number, number] = [255, 47, 135];
const FOCAL = 3.4;

// Deterministic RNG so the brain is the same brain on every render.
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// How "ridged" the cortex is in a given direction: 0 in the bottom of a
// groove (sulcus), 1 on the crown of a fold (gyrus). Three warped sine
// fields summed -- cheap, and winding enough to read as folds, not stripes.
function foldAt(d: Vec3) {
  const n =
    Math.sin(8 * d.x + 3 * Math.sin(6 * d.y)) +
    Math.sin(9 * d.y + 3 * Math.sin(7 * d.z)) +
    Math.sin(8 * d.z + 3 * Math.sin(6 * d.x));
  return Math.min(1, (Math.abs(n) / 3) * 2.2);
}

// Maps a direction on the unit sphere to a point on the cerebrum's
// surface. x = left/right, y = up, z = front (+) to back (-).
function cortexPoint(d: Vec3): Vec3 {
  const fold = foldAt(d);
  const r = 1 + 0.04 * (fold - 0.45);
  const side = d.x >= 0 ? 1 : -1;
  // Two hemispheres: slightly narrower at the frontal pole, a temporal
  // bulge low on each side, and a real gap down the middle.
  let x = d.x * 0.8 * r;
  x *= 1 - 0.12 * Math.max(0, d.z);
  x *= 1 + 0.1 * Math.exp(-Math.pow((d.y + 0.25) / 0.3, 2)) * (1 - Math.abs(d.z) * 0.5);
  x += side * 0.035;
  let y = d.y * 0.7 * r;
  // The longitudinal fissure: the top surface dips toward the midline.
  y -= 0.11 * Math.exp(-Math.pow(d.x / 0.1, 2)) * Math.max(0, d.y);
  // The underside is flattened, not a full sphere.
  if (y < -0.3) y = -0.3 + (y + 0.3) * 0.45;
  // Temporal lobes: the underside drops lower toward the front on each
  // side, which is what gives a brain its profile -- without it the
  // silhouette from the side is just a dome.
  if (d.y < 0) y -= 0.2 * Math.exp(-Math.pow((d.z - 0.18) / 0.36, 2)) * Math.min(1, Math.abs(d.x) * 2.4) * -d.y;
  // The back of the head (occipital pole) sits a little lower than the front.
  y -= 0.05 * Math.max(0, -d.z);
  const z = d.z * 1.05 * r;
  return { x, y, z };
}

type BrainPoint = Vec3 & { bright: number; tone: number; size: number };

function buildBrain(): BrainPoint[] {
  const rand = mulberry32(20261116);
  const points: BrainPoint[] = [];
  // Cerebrum: an even (Fibonacci) spread of directions, jittered a little.
  const n = 4200;
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const yy = 1 - (i / (n - 1)) * 2;
    const rad = Math.sqrt(1 - yy * yy);
    const theta = golden * i + (rand() - 0.5) * 0.3;
    const d = { x: Math.cos(theta) * rad, y: yy, z: Math.sin(theta) * rad };
    const p = cortexPoint(d);
    const fold = foldAt(d);
    // Squared, so grooves fall away to near-black and the folds stand out.
    points.push({ ...p, bright: 0.06 + 0.94 * fold * fold, tone: (d.y + 1) / 2, size: 1 + fold * 1.1 });
  }
  // Cerebellum: a smaller, finely striated lobe tucked under the back.
  for (let i = 0; i < 520; i++) {
    const u = rand() * 2 - 1;
    const th = rand() * Math.PI * 2;
    const rad = Math.sqrt(1 - u * u);
    const y = -0.5 + u * 0.24;
    points.push({
      x: Math.cos(th) * rad * 0.44,
      y,
      z: -0.6 + Math.sin(th) * rad * 0.3,
      bright: 0.25 + 0.6 * Math.abs(Math.sin(y * 46)),
      tone: 0.15,
      size: 1,
    });
  }
  // Brain stem: a short taper running down and slightly forward.
  for (let i = 0; i < 70; i++) {
    const t = rand();
    const th = rand() * Math.PI * 2;
    const w = 0.11 - t * 0.05;
    points.push({ x: Math.cos(th) * w, y: -0.5 - t * 0.5, z: -0.38 + t * 0.1 + Math.sin(th) * w, bright: 0.4, tone: 0.05, size: 0.9 });
  }
  return points;
}

function fibonacciDirection(i: number, n: number): Vec3 {
  // Kept away from the very top and bottom so nobody hides behind the
  // stem or sits dead centre above the fissure.
  const t = n === 1 ? 0.5 : i / (n - 1);
  const y = 0.62 - t * 1.1;
  const rad = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = Math.PI * (3 - Math.sqrt(5)) * i + 0.6;
  return { x: Math.cos(theta) * rad, y, z: Math.sin(theta) * rad };
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * The memory graph as an object you can pick up: a brain built from a
 * couple of thousand points (real hemispheres, fissure, folds, cerebellum
 * and stem), with every saved person held around it on a thread to the
 * patch of cortex that "remembers" them.
 *
 * Drag to turn it, use the controls to zoom or pull the people further
 * out, click anyone (or pick them from the list underneath) to bring them
 * to the front and read what GIVIT knows. Left alone it turns slowly.
 *
 * Canvas 2D with a hand-rolled perspective projection: no 3D library.
 */
export function RelationshipGraph() {
  const { user } = useAuth();
  const [people, setPeople] = useState<GraphPerson[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [spinning, setSpinning] = useState(true);
  const [spread, setSpread] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [photoVersion, setPhotoVersion] = useState(0);

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Everything the render loop reads lives in refs, so changing a control
  // never tears the loop down and restarts it.
  const view = useRef({ yaw: 1.15, pitch: 0.16, vyaw: 0, vpitch: 0, targetYaw: null as number | null, targetPitch: null as number | null });
  const live = useRef({ spinning: true, spread: 1, zoom: 1, selectedId: null as string | null, hoverId: null as string | null });
  const hits = useRef<{ id: string; x: number; y: number; r: number }[]>([]);
  const images = useRef(new Map<string, HTMLImageElement>());

  live.current.spinning = spinning;
  live.current.spread = spread;
  live.current.zoom = zoom;
  live.current.selectedId = selectedId;

  const brain = useMemo(buildBrain, []);

  useEffect(() => {
    if (!user) { setPeople(EXAMPLE_PEOPLE); return; }
    let mounted = true;
    getGiftRecipients(user.id).then((rows: any[]) => {
      if (!mounted) return;
      setPeople(rows.slice(0, MAX_PEOPLE).map((r) => ({
        id: r.id,
        name: r.name,
        relationship: r.relationship || "",
        interests: r.interests ?? [],
        photoUrl: r.photo_url ?? null,
      })));
    }).catch(() => { if (mounted) setPeople([]); });
    return () => { mounted = false; };
  }, [user]);

  useEffect(() => {
    const onChange = () => setPhotoVersion((v) => v + 1);
    window.addEventListener(RECIPIENT_PHOTOS_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(RECIPIENT_PHOTOS_CHANGED_EVENT, onChange);
  }, []);

  // Photos are drawn into the canvas, so each needs a loaded <img>.
  useEffect(() => {
    if (!people) return;
    for (const person of people) {
      const url = recipientPhotoUrl(user?.id, { id: person.id }) ?? person.photoUrl;
      const existing = images.current.get(person.id);
      if (!url) { images.current.delete(person.id); continue; }
      if (existing?.src === url) continue;
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      images.current.set(person.id, img);
    }
  }, [people, user, photoVersion]);

  const nodes = useMemo(
    () => (people ?? []).map((person, i, all) => {
      const dir = fibonacciDirection(i, all.length);
      return { person, dir, anchor: cortexPoint(dir) };
    }),
    [people],
  );

  function focusPerson(id: string | null) {
    setSelectedId(id);
    const node = nodes.find((n) => n.person.id === id);
    if (!node) { view.current.targetYaw = null; view.current.targetPitch = null; return; }
    // Turn the model so this person faces the viewer.
    const horizontal = Math.hypot(node.dir.x, node.dir.z);
    view.current.targetYaw = Math.atan2(-node.dir.x, node.dir.z);
    view.current.targetPitch = Math.atan2(node.dir.y, horizontal) * 0.7;
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !wrap || !ctx || nodes.length === 0) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = 0;
    let height = 0;
    function resize() {
      width = wrap!.clientWidth;
      height = Math.round(Math.min(620, Math.max(380, width * 0.6)));
      canvas!.style.height = `${height}px`;
      canvas!.width = Math.round(width * dpr);
      canvas!.height = Math.round(height * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    let visible = true;
    const io = new IntersectionObserver(([entry]) => { visible = Boolean(entry?.isIntersecting); });
    io.observe(canvas);

    // --- pointer: drag to rotate, tap to select ---------------------
    let dragging = false;
    let moved = 0;
    let lastX = 0;
    let lastY = 0;
    function localPoint(e: PointerEvent) {
      const rect = canvas!.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }
    function hitTest(x: number, y: number) {
      // Front-most first: hits are stored back to front.
      for (let i = hits.current.length - 1; i >= 0; i--) {
        const h = hits.current[i]!;
        if (Math.abs(x - h.x) <= h.r && Math.abs(y - h.y) <= h.r) return h.id;
      }
      return null;
    }
    function onDown(e: PointerEvent) {
      dragging = true; moved = 0; lastX = e.clientX; lastY = e.clientY;
      canvas!.setPointerCapture(e.pointerId);
      view.current.targetYaw = null; view.current.targetPitch = null;
    }
    function onMove(e: PointerEvent) {
      if (dragging) {
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        lastX = e.clientX; lastY = e.clientY;
        moved += Math.abs(dx) + Math.abs(dy);
        view.current.vyaw = dx * 0.006;
        view.current.vpitch = dy * 0.004;
        view.current.yaw += view.current.vyaw;
        view.current.pitch = Math.max(-0.9, Math.min(0.9, view.current.pitch + view.current.vpitch));
      } else {
        const p = localPoint(e);
        const id = hitTest(p.x, p.y);
        live.current.hoverId = id;
        canvas!.style.cursor = id ? "pointer" : "grab";
      }
    }
    function onUp(e: PointerEvent) {
      if (!dragging) return;
      dragging = false;
      if (moved < 6) {
        const p = localPoint(e);
        const id = hitTest(p.x, p.y);
        focusPersonRef.current(id);
      }
    }
    function onLeave() { live.current.hoverId = null; }
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("pointerleave", onLeave);

    function project(p: Vec3, cosY: number, sinY: number, cosP: number, sinP: number, cx: number, cy: number, R: number) {
      const x1 = p.x * cosY + p.z * sinY;
      const z1 = -p.x * sinY + p.z * cosY;
      const y2 = p.y * cosP - z1 * sinP;
      const z2 = p.y * sinP + z1 * cosP;
      const k = FOCAL / (FOCAL - z2);
      return { sx: cx + x1 * R * k, sy: cy - y2 * R * k, z: z2, k };
    }

    function draw(time: number) {
      const v = view.current;
      const state = live.current;

      // Ease toward a focused person, otherwise coast and (optionally) idle-spin.
      if (v.targetYaw != null && v.targetPitch != null) {
        let diff = (v.targetYaw - v.yaw) % (Math.PI * 2);
        if (diff > Math.PI) diff -= Math.PI * 2;
        if (diff < -Math.PI) diff += Math.PI * 2;
        v.yaw += diff * 0.07;
        v.pitch += (v.targetPitch - v.pitch) * 0.07;
      } else if (!dragging) {
        v.yaw += v.vyaw;
        v.pitch = Math.max(-0.9, Math.min(0.9, v.pitch + v.vpitch));
        v.vyaw *= 0.94; v.vpitch *= 0.9;
        if (state.spinning && !reduceMotion && !state.selectedId) v.yaw += 0.0022;
      }

      const cosY = Math.cos(v.yaw), sinY = Math.sin(v.yaw);
      const cosP = Math.cos(v.pitch), sinP = Math.sin(v.pitch);
      const cx = width / 2;
      const cy = height / 2 + 6;
      const R = Math.min(width * 0.3, height * 0.4) * state.zoom;

      ctx!.clearRect(0, 0, width, height);

      // Soft light behind the model.
      const glow = ctx!.createRadialGradient(cx, cy, 0, cx, cy, R * 2.2);
      glow.addColorStop(0, "rgba(229, 89, 63, 0.13)");
      glow.addColorStop(0.5, "rgba(255, 47, 135, 0.05)");
      glow.addColorStop(1, "rgba(255, 47, 135, 0)");
      ctx!.fillStyle = glow;
      ctx!.fillRect(0, 0, width, height);

      // --- the brain ------------------------------------------------
      ctx!.globalCompositeOperation = "lighter";
      const pulse = reduceMotion ? 0 : time * 0.0006;
      for (const p of brain) {
        const q = project(p, cosY, sinY, cosP, sinP, cx, cy, R);
        const depth = (q.z + 1.1) / 2.2; // 0 back .. 1 front
        // A slow wave of activity crossing the cortex front to back.
        const wave = 0.85 + 0.15 * Math.sin(p.z * 5 - pulse * 3 + p.x * 2);
        const alpha = p.bright * (0.1 + 0.9 * depth * depth) * wave * 1.25;
        const r = EMBER[0] + (CORAL[0] - EMBER[0]) * (1 - p.tone);
        const g = EMBER[1] + (CORAL[1] - EMBER[1]) * (1 - p.tone) + 60 * p.bright * depth;
        const b = EMBER[2] + (CORAL[2] - EMBER[2]) * (1 - p.tone);
        const size = p.size * q.k * (0.7 + state.zoom * 0.5);
        ctx!.fillStyle = `rgba(${r | 0}, ${Math.min(255, g) | 0}, ${b | 0}, ${Math.min(1, alpha)})`;
        ctx!.fillRect(q.sx - size / 2, q.sy - size / 2, size, size);
      }
      ctx!.globalCompositeOperation = "source-over";

      // --- people ---------------------------------------------------
      const shell = 1.42 * state.spread;
      const drawn = nodes.map((node) => {
        const bob = reduceMotion ? 0 : Math.sin(time * 0.0009 + node.dir.x * 5) * 0.025;
        const pos = { x: node.dir.x * shell, y: node.dir.y * shell * 0.82 + bob, z: node.dir.z * shell };
        return {
          node,
          at: project(pos, cosY, sinY, cosP, sinP, cx, cy, R),
          anchor: project(node.anchor, cosY, sinY, cosP, sinP, cx, cy, R),
          pos,
        };
      }).sort((a, b) => a.at.z - b.at.z);

      hits.current = [];
      for (const d of drawn) {
        const { person } = d.node;
        const isSelected = person.id === state.selectedId;
        const isHover = person.id === state.hoverId;
        const front = (d.at.z + shell) / (shell * 2); // 0 back .. 1 front
        const dim = state.selectedId && !isSelected ? 0.45 : 1;
        const alpha = (0.35 + 0.65 * front) * dim;

        // Thread from the cortex out to the person.
        const mx = (d.at.sx + d.anchor.sx) / 2 + (d.at.sy - d.anchor.sy) * 0.12;
        const my = (d.at.sy + d.anchor.sy) / 2 - (d.at.sx - d.anchor.sx) * 0.12;
        ctx!.beginPath();
        ctx!.moveTo(d.anchor.sx, d.anchor.sy);
        ctx!.quadraticCurveTo(mx, my, d.at.sx, d.at.sy);
        ctx!.strokeStyle = `rgba(255, 140, 110, ${(isSelected ? 0.9 : 0.28) * alpha})`;
        ctx!.lineWidth = isSelected ? 1.4 : 0.8;
        ctx!.stroke();

        // A signal travelling along the thread of whoever is in focus.
        if ((isSelected || isHover) && !reduceMotion) {
          const t = (time * 0.0007) % 1;
          const px = (1 - t) * (1 - t) * d.anchor.sx + 2 * (1 - t) * t * mx + t * t * d.at.sx;
          const py = (1 - t) * (1 - t) * d.anchor.sy + 2 * (1 - t) * t * my + t * t * d.at.sy;
          ctx!.beginPath();
          ctx!.arc(px, py, 2.4, 0, Math.PI * 2);
          ctx!.fillStyle = "rgba(255, 220, 200, 0.95)";
          ctx!.fill();
        }

        // Interests: tiny marks around the person, with labels only for
        // whoever is in focus so the model stays readable.
        const half = (isSelected ? 30 : isHover ? 26 : 21) * d.at.k * (0.75 + state.zoom * 0.25);
        const shown = person.interests.slice(0, 6);
        shown.forEach((interest, i) => {
          const angle = (i / Math.max(1, shown.length)) * Math.PI * 2 + (reduceMotion ? 0 : time * 0.00025) + d.node.dir.x * 3;
          const orbit = half * (isSelected ? 2.6 : 1.75);
          const ix = d.at.sx + Math.cos(angle) * orbit;
          const iy = d.at.sy + Math.sin(angle) * orbit * 0.8;
          ctx!.beginPath();
          ctx!.arc(ix, iy, isSelected ? 2.6 : 1.6, 0, Math.PI * 2);
          ctx!.fillStyle = `rgba(255, 47, 135, ${0.85 * alpha})`;
          ctx!.fill();
          if (isSelected) {
            ctx!.beginPath();
            ctx!.moveTo(d.at.sx, d.at.sy);
            ctx!.lineTo(ix, iy);
            ctx!.strokeStyle = "rgba(255, 47, 135, 0.25)";
            ctx!.lineWidth = 0.7;
            ctx!.stroke();
            ctx!.font = "500 11px Inter, ui-sans-serif, system-ui, sans-serif";
            ctx!.textAlign = Math.cos(angle) >= 0 ? "left" : "right";
            ctx!.textBaseline = "middle";
            ctx!.fillStyle = "rgba(255, 255, 255, 0.82)";
            const label = interest.length > 18 ? `${interest.slice(0, 17)}…` : interest;
            ctx!.fillText(label, ix + (Math.cos(angle) >= 0 ? 7 : -7), iy);
          }
        });

        // The portrait itself: photo if there is one, monogram if not.
        const x = d.at.sx - half;
        const y = d.at.sy - half;
        const corner = half * 0.42;
        ctx!.save();
        ctx!.globalAlpha = alpha;
        if (isSelected || isHover) {
          ctx!.shadowColor = "rgba(229, 89, 63, 0.8)";
          ctx!.shadowBlur = 22;
        }
        roundedRect(ctx!, x, y, half * 2, half * 2, corner);
        ctx!.fillStyle = "#17161b";
        ctx!.fill();
        ctx!.shadowBlur = 0;
        ctx!.clip();
        const img = images.current.get(person.id);
        if (img && img.complete && img.naturalWidth > 0) {
          const scale = Math.max((half * 2) / img.naturalWidth, (half * 2) / img.naturalHeight);
          const w = img.naturalWidth * scale;
          const h = img.naturalHeight * scale;
          ctx!.drawImage(img, d.at.sx - w / 2, d.at.sy - h / 2, w, h);
        } else {
          ctx!.fillStyle = "rgba(255, 255, 255, 0.88)";
          ctx!.font = `300 ${Math.round(half * 0.85)}px Inter, ui-sans-serif, system-ui, sans-serif`;
          ctx!.textAlign = "center";
          ctx!.textBaseline = "middle";
          ctx!.fillText(initials(person.name), d.at.sx, d.at.sy + 1);
          // Same corner ribbon as the monogram portraits elsewhere.
          ctx!.translate(x + half * 1.62, y + half * 0.38);
          ctx!.rotate(Math.PI / 4);
          const band = ctx!.createLinearGradient(-half, 0, half, 0);
          band.addColorStop(0, "rgb(229, 89, 63)");
          band.addColorStop(1, "rgb(255, 47, 135)");
          ctx!.fillStyle = band;
          ctx!.fillRect(-half, -half * 0.09, half * 2, half * 0.18);
        }
        ctx!.restore();

        ctx!.save();
        ctx!.globalAlpha = alpha;
        roundedRect(ctx!, x, y, half * 2, half * 2, corner);
        ctx!.strokeStyle = isSelected ? "rgba(229, 89, 63, 1)" : "rgba(255, 255, 255, 0.22)";
        ctx!.lineWidth = isSelected ? 1.8 : 1;
        ctx!.stroke();
        ctx!.font = `${isSelected ? 600 : 500} ${isSelected ? 13 : 11.5}px Inter, ui-sans-serif, system-ui, sans-serif`;
        ctx!.textAlign = "center";
        ctx!.textBaseline = "top";
        ctx!.fillStyle = "rgba(255, 255, 255, 0.9)";
        const shortName = person.name.length > 16 ? `${person.name.slice(0, 15)}…` : person.name;
        ctx!.fillText(shortName, d.at.sx, d.at.sy + half + 7);
        ctx!.restore();

        hits.current.push({ id: person.id, x: d.at.sx, y: d.at.sy, r: Math.max(half, 18) });
      }
    }

    let raf = 0;
    function loop(time: number) {
      if (visible) draw(time);
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("pointerleave", onLeave);
    };
  }, [brain, nodes]);

  // The render loop is set up once per data change; it reaches the
  // current focusPerson through this ref.
  const focusPersonRef = useRef(focusPerson);
  focusPersonRef.current = focusPerson;

  if (!people) return null;
  const isExample = !user;

  const heading = (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-widest text-givit-ember">
          <span className="tech-dot" /> Memory
        </p>
        <h2 className="mt-1 text-3xl font-light tracking-tight text-foreground md:text-4xl">
          Everyone, in <span className="font-semibold">one mind</span>
        </h2>
      </div>
      {isExample ? (
        <p className="max-w-xs text-right text-xs text-muted-foreground">
          An example with made-up people. <Link href="/signup?next=/home" className="givit-link font-semibold">Create an account</Link> to build your own.
        </p>
      ) : (
        <Link href="/people" className="givit-link shrink-0 text-sm font-medium">Manage people →</Link>
      )}
    </div>
  );

  if (people.length === 0) {
    return (
      <section className="container py-10 md:py-14">
        {heading}
        <Link
          href="/people"
          className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border py-14 text-center transition hover:border-givit-ember/50"
        >
          <UserRound className="h-7 w-7 text-givit-ember" />
          <p className="font-semibold text-givit-ink">Nothing to remember yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">Add a person and they appear here, connected to what GIVIT learns about them over time.</p>
        </Link>
      </section>
    );
  }

  const selected = people.find((p) => p.id === selectedId) ?? null;
  const interestTotal = people.reduce((sum, p) => sum + p.interests.length, 0);
  const controlClass = "flex h-8 w-8 items-center justify-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-givit-ember";

  return (
    <section className="container py-10 md:py-14">
      {heading}

      <div ref={wrapRef} className="relative overflow-hidden rounded-3xl" style={{ background: BG }}>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`A rotating 3D brain with ${people.length} saved ${people.length === 1 ? "person" : "people"} connected to it. Use the list below to select someone.`}
          className="block w-full cursor-grab touch-pan-y select-none active:cursor-grabbing"
        />

        {/* Readout, top left: plain numbers, no chrome. */}
        <div className="pointer-events-none absolute left-4 top-4 font-mono text-[10px] uppercase leading-relaxed tracking-widest text-white/45 sm:left-6 sm:top-5">
          <p><span className="text-white/85">{String(people.length).padStart(2, "0")}</span> people</p>
          <p><span className="text-white/85">{String(interestTotal).padStart(2, "0")}</span> things known</p>
          <p className="mt-1 hidden text-white/30 sm:block">Drag to turn</p>
        </div>

        {/* Controls, top right. */}
        <div className="absolute right-3 top-3 flex items-center gap-0.5 rounded-full bg-white/[0.06] p-1 backdrop-blur-sm sm:right-5 sm:top-4">
          <button type="button" className={controlClass} onClick={() => setSpinning((s) => !s)} aria-label={spinning ? "Pause rotation" : "Resume rotation"} title={spinning ? "Pause rotation" : "Resume rotation"}>
            {spinning ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </button>
          <button type="button" className={controlClass} onClick={() => setZoom((z) => Math.max(0.7, +(z - 0.15).toFixed(2)))} aria-label="Zoom out" title="Zoom out">
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button type="button" className={controlClass} onClick={() => setZoom((z) => Math.min(1.6, +(z + 0.15).toFixed(2)))} aria-label="Zoom in" title="Zoom in">
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className={controlClass}
            onClick={() => { setZoom(1); setSpread(1); focusPerson(null); view.current.pitch = 0.18; view.current.vyaw = 0; view.current.vpitch = 0; }}
            aria-label="Reset view"
            title="Reset view"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Spread: how far the people sit from the brain. */}
        <label className="absolute bottom-4 right-4 hidden items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-white/45 sm:flex sm:right-6">
          Spread
          <input
            type="range"
            min={0.8}
            max={1.5}
            step={0.01}
            value={spread}
            onChange={(e) => setSpread(Number(e.target.value))}
            className="h-1 w-28 cursor-pointer accent-[#e5593f]"
          />
        </label>

        {/* Whoever is in focus. */}
        {selected && (
          <div className="slide-up absolute inset-x-3 bottom-3 flex items-center gap-4 rounded-2xl bg-black/70 p-3 backdrop-blur-md sm:inset-x-auto sm:bottom-5 sm:left-5 sm:w-80 sm:p-4">
            <PersonPortrait recipientId={selected.id} name={selected.name} photoUrl={selected.photoUrl} size="md" editable={!isExample} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-light tracking-tight text-white">{selected.name}</p>
              <p className="truncate text-xs text-white/55">
                {[selected.relationship, selected.interests.length ? `${selected.interests.length} thing${selected.interests.length === 1 ? "" : "s"} known` : "nothing known yet"].filter(Boolean).join(" · ")}
              </p>
              <Link
                href={`/gift?q=${encodeURIComponent(`Gift for ${selected.name}${selected.interests.length ? `, loves ${selected.interests.slice(0, 4).join(", ")}` : ""}`)}`}
                className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-givit-ember hover:underline"
              >
                <RibbonBow className="h-3.5 w-3.5" /> Find a gift
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* The same people as real buttons: the keyboard and screen-reader
          route into the model, and a quick index for everyone else. */}
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
        {people.map((person) => (
          <button
            key={person.id}
            type="button"
            onClick={() => focusPerson(person.id === selectedId ? null : person.id)}
            aria-pressed={person.id === selectedId}
            className={`border-b pb-0.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-givit-ember ${
              person.id === selectedId ? "border-givit-ember font-semibold text-givit-ember" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {person.name}
          </button>
        ))}
      </div>
    </section>
  );
}
