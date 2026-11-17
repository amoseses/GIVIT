import "./calendar-space.css";

// Hand-drawn marks for the calendar. Both are decoration: the day button or
// list row they sit in carries the accessible text.

type GlyphProps = { className?: string };

/** A personal occasion: a small wrapped box seen from above one corner, ribbon over the lid and down both faces. */
export function GiftNode({ className = "" }: GlyphProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" fill="#ff5a3d" fillOpacity="0.14" stroke="#ff5a3d" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M4 7.5l8 4.5 8-4.5M12 12v9" stroke="#ff5a3d" strokeWidth="1.2" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M8 5.25l8 4.5v9M16 5.25l-8 4.5v9" stroke="#ff2f87" strokeWidth="1.1" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** A public holiday: a diamond marker with a dashed orbit travelling round it. The diamond takes currentColor. */
export function HolidayBeacon({ className = "" }: GlyphProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <ellipse className="cal-orbit" cx="12" cy="12" rx="10.5" ry="4" transform="rotate(-24 12 12)" stroke="#ff2f87" strokeWidth="1" strokeLinecap="round" />
      <path d="M12 6.5l5.5 5.5-5.5 5.5L6.5 12z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="1.3" fill="#ff2f87" />
    </svg>
  );
}
