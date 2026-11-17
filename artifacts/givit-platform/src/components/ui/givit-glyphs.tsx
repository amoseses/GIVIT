import type { SVGProps } from "react";

// GIVIT's own small marks, drawn for this product rather than pulled from
// a stock icon set. They replace the four-point "sparkle" that every AI
// product reaches for: nothing here is a star, a wand or a spark.
//
// All of them follow the same rules so they sit next to lucide icons
// without looking foreign: 24x24 box, currentColor, 2px round strokes,
// and they accept the same props (className for size and colour).

type GlyphProps = SVGProps<SVGSVGElement>;

function base(props: GlyphProps) {
  return {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    ...props,
  };
}

/** A tied bow: two loops, a knot, two tails. The mark for Your Gift AI and "pick this for me". */
export function RibbonBow(props: GlyphProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 11C9.5 7 6 5.5 4 7c-1.8 1.4-.6 5 2.6 5.6 2 .4 4-.3 5.4-1.6Z" />
      <path d="M12 11c2.5-4 6-5.500 8-4 1.8 1.400.600 5-2.600 5.600-2 .400-4-.300-5.400-1.600Z" />
      <path d="M11 12.500 8 20" />
      <path d="m13 12.500 3 7.500" />
      <circle cx="12" cy="11.300" r="1.300" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** A length of ribbon curling off a spool. For "ideas", "suggestions", loose ends. */
export function RibbonCurl(props: GlyphProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 6c5-3 9 1 6 4s-4 6 1 7 7-2 9-5" />
      <path d="M17 9.500 20 12l-3.500 1.500" />
    </svg>
  );
}

/** A gift tag on its string. For labels, occasions, "who it's for". */
export function GiftTag(props: GlyphProps) {
  return (
    <svg {...base(props)}>
      <path d="M11 4H5.500A1.500 1.500 0 0 0 4 5.500V11l8.600 8.600a1.500 1.500 0 0 0 2.100 0l4.900-4.900a1.500 1.500 0 0 0 0-2.100Z" />
      <circle cx="8" cy="8" r="1.200" />
      <path d="M8 6.800C8 4 10 2.500 12.500 3" />
    </svg>
  );
}

/** A wrapped parcel seen from the front, ribbon crossed. For orders and delivery. */
export function WrappedBox(props: GlyphProps) {
  return (
    <svg {...base(props)}>
      <rect x="4" y="9" width="16" height="11" rx="1.500" />
      <path d="M3 9h18" />
      <path d="M12 9v11" />
      <path d="M12 9C10 5.500 7.500 5 7 6.500S9 9 12 9Z" />
      <path d="M12 9c2-3.500 4.500-4 5-2.500S15 9 12 9Z" />
    </svg>
  );
}
