// A small line-art wreath accent for the holiday season -- hand-drawn
// rather than a lucide icon (none fits) or an emoji (reads as clipart next
// to the rest of the site's thin-stroke, brand-colored iconography). Kept
// to GIVIT's own ember/amber palette rather than literal red-and-green, so
// it reads as "this site, decorated" instead of generic holiday clipart --
// same reasoning that shaped the ribbon/bow ambient particles.
export function HolidayWreath({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      fill="none"
      aria-hidden="true"
    >
      {/* Foliage ring: a dashed circle reads as leaf texture without drawing
          individual leaves, which is what tips a wreath into "clipart." */}
      <circle
        cx="24"
        cy="22"
        r="15"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="3.2 4.5"
        opacity="0.85"
      />
      {/* Three berries, evenly spaced around the upper ring. */}
      <circle cx="24" cy="7" r="1.6" fill="currentColor" />
      <circle cx="12.2" cy="15.5" r="1.6" fill="currentColor" />
      <circle cx="35.8" cy="15.5" r="1.6" fill="currentColor" />
      {/* Small bow at the bottom, same two-loop-plus-knot shape as the
          ambient particles' bow accent. */}
      <g transform="translate(24 40)">
        <ellipse cx="-4.5" cy="0" rx="4.5" ry="2.6" transform="rotate(20)" stroke="currentColor" strokeWidth="1.6" />
        <ellipse cx="4.5" cy="0" rx="4.5" ry="2.6" transform="rotate(-20)" stroke="currentColor" strokeWidth="1.6" />
        <circle r="1.4" fill="currentColor" />
      </g>
    </svg>
  );
}
