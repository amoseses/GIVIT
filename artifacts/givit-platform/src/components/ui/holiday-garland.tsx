import { useId } from "react";

// A real garland -- green foliage swagged in curves, gold bells hanging
// at each dip, red berries along the way -- strung along the seam above
// the nav row (Your Gift AI / Dashboard / People / ...) rather than one
// small icon. Built as an SVG <pattern> tiled left-to-right rather than
// one wide path stretched with preserveAspectRatio="none": a pattern
// repeats its one tile cleanly at any viewport width instead of
// distorting the curves wider on a big screen.
//
// Sits in the border strip ABOVE the nav row's own text, not behind it --
// the tile's dip/bell bottoms out well short of where the nav labels'
// text actually sits, by design, so nothing needs covering up.
export function HolidayGarland({ className = "" }: { className?: string }) {
  const patternId = useId();
  return (
    // No viewBox: with width/height given directly, 1 SVG user unit = 1
    // rendered pixel, so the pattern's own 100-unit tile repeats roughly
    // every 100px across the real width instead of being stretched into
    // one giant tile the way a stretched viewBox would.
    <svg
      width="100%"
      height="26"
      className={className}
      aria-hidden="true"
    >
      <pattern id={patternId} width="100" height="26" patternUnits="userSpaceOnUse">
        {/* The swag itself: three overlapping dashed curves, offset a
            couple pixels from each other with staggered dash patterns and
            two green shades -- one thin dashed line read as a wire, not
            foliage with volume. Same layering trick as the wreath. */}
        <path d="M -5 2.5 Q 25 18.5 50 18.5 Q 75 18.5 105 2.5" fill="none" stroke="#166534" strokeWidth="2.4" strokeLinecap="round" strokeDasharray="2 1.5" opacity="0.85" />
        <path d="M -5 4 Q 25 20 50 20 Q 75 20 105 4" fill="none" stroke="#1f8a4c" strokeWidth="3.2" strokeLinecap="round" strokeDasharray="2.2 1.7" strokeDashoffset="1.2" />
        <path d="M -5 5.5 Q 25 21.5 50 21.5 Q 75 21.5 105 5.5" fill="none" stroke="#2fa360" strokeWidth="2.2" strokeLinecap="round" strokeDasharray="1.8 1.8" strokeDashoffset="0.6" opacity="0.9" />
        {/* Gold bell hanging at the lowest point of the dip. */}
        <g transform="translate(50 21)">
          <path d="M -2.6 0 Q -2.6 -4 0 -4 Q 2.6 -4 2.6 0 Z" fill="#d4a017" />
          <rect x="-0.5" y="-4.6" width="1" height="1.4" fill="#d4a017" />
          <circle cy="1.3" r="0.9" fill="#d4a017" />
        </g>
        {/* Red berry clusters partway up each side of the swag. */}
        <circle cx="16" cy="10" r="1.6" fill="#d62f3f" />
        <circle cx="19" cy="12.5" r="1.6" fill="#d62f3f" />
        <circle cx="84" cy="10" r="1.6" fill="#d62f3f" />
        <circle cx="81" cy="12.5" r="1.6" fill="#d62f3f" />
      </pattern>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  );
}
