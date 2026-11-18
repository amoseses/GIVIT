// A wreath drawn leaf by leaf rather than suggested with dashed rings:
// two rows of pointed leaves laid around a circle (the outer row leaning
// one way, the inner row the other, which is what gives a real wreath its
// woven look), three small berry pairs, and a proper tied bow with tails
// at the bottom in the brand's ember-to-coral.
//
// Greens are intentionally not the brand palette -- a wreath only reads
// as a wreath in green -- but the bow is, so it still belongs to GIVIT.
// Everything is flat fills with no blur, so it stays crisp at 20px.
const LEAF = "M 0 -4.6 C 1.9 -2.6 1.9 2.6 0 4.6 C -1.9 2.6 -1.9 -2.6 0 -4.6 Z";
const OUTER_COUNT = 16;
const INNER_COUNT = 13;
const GREENS = ["#14532d", "#1f7a43", "#2f9e5b"];

function ring(count: number, radius: number, lean: number, offset: number) {
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * 360 + offset;
    const rad = (angle * Math.PI) / 180;
    return {
      x: 24 + Math.sin(rad) * radius,
      y: 23 - Math.cos(rad) * radius,
      // Tangent to the circle, then leaned in or out.
      rotate: angle + 90 + lean,
      fill: GREENS[(i * 2 + (lean > 0 ? 1 : 0)) % GREENS.length]!,
    };
  });
}

const OUTER = ring(OUTER_COUNT, 15.5, 28, 0);
const INNER = ring(INNER_COUNT, 11.8, -30, 12);
const BERRIES = [
  { x: 24, y: 6.4 },
  { x: 10.4, y: 15.2 },
  { x: 37.6, y: 15.2 },
];

export function HolidayWreath({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="wreath-bow" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e5593f" />
          <stop offset="1" stopColor="#e0467f" />
        </linearGradient>
      </defs>
      {OUTER.map((leaf, i) => (
        <path key={`o${i}`} d={LEAF} fill={leaf.fill} transform={`translate(${leaf.x.toFixed(2)} ${leaf.y.toFixed(2)}) rotate(${leaf.rotate.toFixed(1)})`} />
      ))}
      {INNER.map((leaf, i) => (
        <path key={`i${i}`} d={LEAF} fill={leaf.fill} transform={`translate(${leaf.x.toFixed(2)} ${leaf.y.toFixed(2)}) rotate(${leaf.rotate.toFixed(1)}) scale(0.82)`} />
      ))}
      {BERRIES.map((b, i) => (
        <g key={`b${i}`} fill="#e11d48">
          <circle cx={b.x - 1.3} cy={b.y} r="1.7" />
          <circle cx={b.x + 1.5} cy={b.y + 0.9} r="1.5" />
          <circle cx={b.x - 1.8} cy={b.y - 0.5} r="0.45" fill="#fff" opacity="0.7" />
        </g>
      ))}
      {/* The bow: tails first, then two loops, then the knot on top. */}
      <g transform="translate(24 38.5)" fill="url(#wreath-bow)">
        <path d="M -1.2 0.5 L -5.4 8 L -3.2 7 L -2.4 9 L 0.4 1.5 Z" />
        <path d="M 1.2 0.5 L 5.4 8 L 3.2 7 L 2.4 9 L -0.4 1.5 Z" />
        <path d="M 0 0 C -3 -5.2 -9.5 -4.6 -9 -0.4 C -8.6 3 -3.4 2.6 0 0 Z" />
        <path d="M 0 0 C 3 -5.2 9.5 -4.6 9 -0.4 C 8.6 3 3.4 2.6 0 0 Z" />
        <rect x="-1.9" y="-1.9" width="3.8" height="3.8" rx="1.1" fill="#ff7a52" />
      </g>
    </svg>
  );
}
