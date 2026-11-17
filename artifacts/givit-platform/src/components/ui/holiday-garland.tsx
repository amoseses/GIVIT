import { useId } from "react";

// A real garland -- spiky pine-needle foliage swagged in curves, gold
// bells hanging at each dip, red berries along the way -- strung along
// the seam above the nav row (Your Gift AI / Dashboard / People / ...)
// rather than one small icon. Built as an SVG <pattern> tiled
// left-to-right rather than one wide path stretched with
// preserveAspectRatio="none": a pattern repeats its one tile cleanly at
// any viewport width instead of distorting the curves wider on a big
// screen.
//
// Hangs low enough to sit right at the top edge of the nav row's own
// text -- close enough to read as "draped over" the row, not floating a
// safe distance above it -- without the spikes' tips actually reaching
// down into the letters. Verify in the browser after touching the
// y-coordinates here; see the curve's approximate y(x) in the comment
// below if you need to recompute spike placement.
const SPIKE_ID = "spike";

// One pine-needle spike: a tall thin triangle, tip at the origin. Reused
// via <use> at several points/rotations along the curve rather than a
// dozen near-duplicate <path> elements.
function SpikeDef({ id }: { id: string }) {
  return <path id={id} d="M 0 0 L -2.6 9.5 L 2.6 9.5 Z" />;
}

// Curve is the sine-ish dip y = 3 + 17*sin(pi*x/100) (touches y=3 at the
// tile edges, y=20 at the center) -- spikes below are placed along that
// same curve, each rotated to roughly match its local slope so they
// point outward from the swag rather than all straight up.
const SPIKES: { x: number; y: number; rotation: number; shade: "dark" | "mid" | "light" }[] = [
  { x: 6, y: 5.3, rotation: -62, shade: "dark" },
  { x: 14, y: 8.6, rotation: -48, shade: "mid" },
  { x: 22, y: 12.1, rotation: -34, shade: "light" },
  { x: 30, y: 15.2, rotation: -20, shade: "dark" },
  { x: 38, y: 17.8, rotation: -8, shade: "mid" },
  { x: 62, y: 17.8, rotation: 8, shade: "mid" },
  { x: 70, y: 15.2, rotation: 20, shade: "dark" },
  { x: 78, y: 12.1, rotation: 34, shade: "light" },
  { x: 86, y: 8.6, rotation: 48, shade: "mid" },
  { x: 94, y: 5.3, rotation: 62, shade: "dark" },
];
const SHADE_COLOR = { dark: "#166534", mid: "#1f8a4c", light: "#2fa360" };

// Fairy lights strung along the same curve, a few px below the branch so
// they hang off it. Drawn as repeating CSS radial-gradients (one 100px
// tile each, matching the SVG pattern's tile) rather than inside the SVG
// <pattern>: CSS animation on pattern contents is unreliable across
// browsers, while opacity on a plain div is not. Two interleaved sets
// that fade against each other read as twinkling, not blinking.
function lightsBackground(lights: { x: number; y: number; color: string }[]) {
  return lights
    .map((l) => `radial-gradient(circle at ${l.x}px ${l.y}px, #fff 0, ${l.color} 1.4px, ${l.color}66 2.6px, transparent 5px)`)
    .join(", ");
}
const LIGHTS_A = lightsBackground([
  { x: 9, y: 10.5, color: "#ffd166" },
  { x: 64, y: 22, color: "#ff5a5f" },
]);
const LIGHTS_B = lightsBackground([
  { x: 36, y: 22, color: "#7dd3fc" },
  { x: 91, y: 10.5, color: "#ffd166" },
]);
const LIGHTS_STYLE = { backgroundSize: "100px 34px", backgroundRepeat: "repeat-x" } as const;

export function HolidayGarland({ className = "" }: { className?: string }) {
  const patternId = useId();
  const spikeId = `${useId()}-${SPIKE_ID}`;
  return (
    // No viewBox: with width/height given directly, 1 SVG user unit = 1
    // rendered pixel, so the pattern's own 100-unit tile repeats roughly
    // every 100px across the real width instead of being stretched into
    // one giant tile the way a stretched viewBox would.
    <div className={className} style={{ height: 34 }} aria-hidden="true">
    <svg width="100%" height="34" className="absolute inset-0">
      <defs>
        <SpikeDef id={spikeId} />
      </defs>
      <pattern id={patternId} width="100" height="34" patternUnits="userSpaceOnUse">
        {/* Branch line underneath the spikes -- without it the spikes read
            as scattered marks, not a garland strung along something. */}
        <path d="M -5 3 Q 25 20 50 20 Q 75 20 105 3" fill="none" stroke="#166534" strokeWidth="1.8" opacity="0.7" />
        {/* Three layers at increasing scale/offset, not two -- this is
            the actual "thicker, bushier" lever: more overlapping needle
            clusters per position, not just bigger ones. */}
        {SPIKES.map((s, i) => (
          <use key={`c${i}`} href={`#${spikeId}`} transform={`translate(${s.x - 2} ${s.y + 1}) rotate(${s.rotation - 8}) scale(${1.1 + (i % 3) * 0.15})`} fill={SHADE_COLOR[s.shade === "light" ? "dark" : "light"]} opacity="0.8" />
        ))}
        {SPIKES.map((s, i) => (
          <use key={i} href={`#${spikeId}`} transform={`translate(${s.x} ${s.y}) rotate(${s.rotation}) scale(${1.3 + (i % 3) * 0.18})`} fill={SHADE_COLOR[s.shade]} />
        ))}
        {SPIKES.map((s, i) => (
          <use key={`b${i}`} href={`#${spikeId}`} transform={`translate(${s.x + 3} ${s.y - 1.5}) rotate(${s.rotation + 10}) scale(1.05)`} fill={SHADE_COLOR[s.shade === "dark" ? "mid" : "dark"]} opacity="0.85" />
        ))}
        {/* Gold bell hanging at the lowest point of the dip. */}
        <g transform="translate(50 23)">
          <path d="M -3.4 0 Q -3.4 -5.2 0 -5.2 Q 3.4 -5.2 3.4 0 Z" fill="#d4a017" />
          <rect x="-0.6" y="-6" width="1.2" height="1.8" fill="#d4a017" />
          <circle cy="1.7" r="1.2" fill="#d4a017" />
        </g>
        {/* Red berry clusters partway up each side of the swag. */}
        <circle cx="18" cy="10.5" r="2.3" fill="#d62f3f" />
        <circle cx="22" cy="13.5" r="2.3" fill="#d62f3f" />
        <circle cx="82" cy="10.5" r="2.3" fill="#d62f3f" />
        <circle cx="78" cy="13.5" r="2.3" fill="#d62f3f" />
      </pattern>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
    <div className="garland-lights-a absolute inset-0" style={{ ...LIGHTS_STYLE, backgroundImage: LIGHTS_A }} />
    <div className="garland-lights-b absolute inset-0" style={{ ...LIGHTS_STYLE, backgroundImage: LIGHTS_B }} />
    </div>
  );
}
