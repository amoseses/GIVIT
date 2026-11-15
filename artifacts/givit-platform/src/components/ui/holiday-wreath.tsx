// A small line-art wreath accent for the holiday season -- hand-drawn
// rather than a lucide icon (none fits) or an emoji (reads as clipart next
// to the rest of the site's thin-stroke iconography).
//
// Colors are hardcoded red/green rather than `currentColor` -- an earlier
// ember-toned version blended into the site's own ember/amber palette and
// was essentially invisible against the logo. A wreath reads as a wreath
// specifically because of the red-and-green, so this is the one accent
// this season that intentionally breaks from the brand palette.
export function HolidayWreath({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" aria-hidden="true">
      {/* Foliage: three overlapping dashed rings at staggered radii/widths/
          dash-offsets rather than one thin ring -- a single dashed circle
          read as a thin line, not foliage with any volume to it. Two
          green shades for a little depth. */}
      <circle cx="24" cy="22" r="17" stroke="#166534" strokeWidth="3" strokeLinecap="round" strokeDasharray="2.2 1.6" strokeDashoffset="0.5" opacity="0.85" />
      <circle cx="24" cy="22" r="15" stroke="#1f8a4c" strokeWidth="3.6" strokeLinecap="round" strokeDasharray="2.4 1.8" strokeDashoffset="2" />
      <circle cx="24" cy="22" r="13" stroke="#2fa360" strokeWidth="2.8" strokeLinecap="round" strokeDasharray="2 2" strokeDashoffset="1" opacity="0.9" />
      {/* Three berries, evenly spaced around the upper ring. */}
      <circle cx="24" cy="7" r="2.1" fill="#d62f3f" />
      <circle cx="12.2" cy="15.5" r="2.1" fill="#d62f3f" />
      <circle cx="35.8" cy="15.5" r="2.1" fill="#d62f3f" />
      {/* Small bow at the bottom, same two-loop-plus-knot shape as the
          ambient particles' bow accent. */}
      <g transform="translate(24 40)">
        <ellipse cx="-4.5" cy="0" rx="4.5" ry="2.6" transform="rotate(20)" stroke="#d62f3f" strokeWidth="2" />
        <ellipse cx="4.5" cy="0" rx="4.5" ry="2.6" transform="rotate(-20)" stroke="#d62f3f" strokeWidth="2" />
        <circle r="1.6" fill="#d62f3f" />
      </g>
    </svg>
  );
}
