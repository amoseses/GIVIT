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
  return <path id={id} d="M 0 0 L -1.7 6.5 L 1.7 6.5 Z" />;
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

export function HolidayGarland({ className = "" }: { className?: string }) {
  const patternId = useId();
  const spikeId = `${useId()}-${SPIKE_ID}`;
  return (
    // No viewBox: with width/height given directly, 1 SVG user unit = 1
    // rendered pixel, so the pattern's own 100-unit tile repeats roughly
    // every 100px across the real width instead of being stretched into
    // one giant tile the way a stretched viewBox would.
    <svg width="100%" height="28" className={className} aria-hidden="true">
      <defs>
        <SpikeDef id={spikeId} />
      </defs>
      <pattern id={patternId} width="100" height="28" patternUnits="userSpaceOnUse">
        {/* Thin branch line underneath the spikes -- without it the spikes
            read as scattered marks, not a garland strung along something. */}
        <path d="M -5 3 Q 25 20 50 20 Q 75 20 105 3" fill="none" stroke="#166534" strokeWidth="1" opacity="0.7" />
        {SPIKES.map((s, i) => (
          <use key={i} href={`#${spikeId}`} transform={`translate(${s.x} ${s.y}) rotate(${s.rotation}) scale(${0.85 + (i % 3) * 0.12})`} fill={SHADE_COLOR[s.shade]} />
        ))}
        {/* A second, shorter layer of spikes offset slightly behind the
            first for fullness -- same idea as the wreath's overlapping
            rings, adapted to a spike shape instead of a dashed stroke. */}
        {SPIKES.map((s, i) => (
          <use key={`b${i}`} href={`#${spikeId}`} transform={`translate(${s.x + 3} ${s.y - 1.5}) rotate(${s.rotation + 10}) scale(0.6)`} fill={SHADE_COLOR[s.shade === "dark" ? "mid" : "dark"]} opacity="0.85" />
        ))}
        {/* Gold bell hanging at the lowest point of the dip. */}
        <g transform="translate(50 21.5)">
          <path d="M -2.6 0 Q -2.6 -4 0 -4 Q 2.6 -4 2.6 0 Z" fill="#d4a017" />
          <rect x="-0.5" y="-4.6" width="1" height="1.4" fill="#d4a017" />
          <circle cy="1.3" r="0.9" fill="#d4a017" />
        </g>
        {/* Red berry clusters partway up each side of the swag. */}
        <circle cx="18" cy="10.5" r="1.7" fill="#d62f3f" />
        <circle cx="21.5" cy="13" r="1.7" fill="#d62f3f" />
        <circle cx="82" cy="10.5" r="1.7" fill="#d62f3f" />
        <circle cx="78.5" cy="13" r="1.7" fill="#d62f3f" />
      </pattern>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  );
}
