import { useEffect, useRef, useState } from "react";

export type RailSection = { id: string; label: string };

const TRACK_HEIGHT = 168;

// A thin vertical progress rail pinned to the right edge of a long page:
// one dot per section, a line that fills as you scroll, and the current
// section's name beside its dot. It answers "how much of this is there
// and where am I" on a page that is otherwise several full-height
// screens with no scrollbar cue worth looking at. Dots are real buttons,
// so it doubles as section navigation.
//
// Sections are looked up by element id; any id that isn't on the page
// (a section hidden behind a flag, say) is simply left off the rail.
// Desktop only -- on a phone it would sit on top of the content.
export function ScrollProgressRail({ sections }: { sections: RailSection[] }) {
  const [present, setPresent] = useState<RailSection[]>([]);
  const [active, setActive] = useState(0);
  const fillRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    let lastIds = "";
    function update() {
      const found = sections
        .map((section) => ({ section, el: document.getElementById(section.id) }))
        .filter((entry): entry is { section: RailSection; el: HTMLElement } => Boolean(entry.el));
      const ids = found.map((f) => f.section.id).join("|");
      if (ids !== lastIds) {
        lastIds = ids;
        setPresent(found.map((f) => f.section));
      }
      if (found.length > 1) {
        // The "reading line" sits 40% down the viewport: a section counts
        // as current once its top has passed that line.
        const line = window.scrollY + window.innerHeight * 0.4;
        const tops = found.map((f) => f.el.getBoundingClientRect().top + window.scrollY);
        let index = 0;
        for (let i = 0; i < tops.length; i++) if (tops[i]! <= line) index = i;
        const start = tops[index]!;
        const end = tops[index + 1] ?? document.documentElement.scrollHeight;
        const within = end > start ? Math.min(1, Math.max(0, (line - start) / (end - start))) : 0;
        const atBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
        const fraction = atBottom ? 1 : Math.min(1, (index + (index === tops.length - 1 ? 0 : within)) / (tops.length - 1));
        if (fillRef.current) fillRef.current.style.height = `${fraction * 100}%`;
        setActive((prev) => (prev === index ? prev : index));
      }
      raf = requestAnimationFrame(update);
    }
    raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
  }, [sections]);

  if (present.length < 2) return null;

  return (
    <nav aria-label="Page sections" className="fixed right-6 top-1/2 z-40 hidden -translate-y-1/2 lg:block">
      <div className="relative w-3" style={{ height: TRACK_HEIGHT }}>
        <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/15" />
        <div ref={fillRef} className="absolute left-1/2 top-0 w-px -translate-x-1/2 bg-gradient-to-b from-givit-ember to-givit-coral" style={{ height: 0 }} />
        {present.map((section, i) => {
          const isActive = i === active;
          const reached = i <= active;
          return (
            <button
              key={section.id}
              type="button"
              aria-label={section.label}
              aria-current={isActive ? "true" : undefined}
              onClick={() => document.getElementById(section.id)?.scrollIntoView({ behavior: "smooth", block: "start" })}
              className="group absolute left-1/2 flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
              style={{ top: `${(i / (present.length - 1)) * 100}%` }}
            >
              <span
                className={`block rounded-full transition-all duration-300 ${
                  isActive ? "rail-dot-active h-2.5 w-2.5 bg-givit-ember" : reached ? "h-1.5 w-1.5 bg-givit-ember/80" : "h-1.5 w-1.5 bg-white/30 group-hover:bg-white/70"
                }`}
              />
              <span
                className={`pointer-events-none absolute right-6 whitespace-nowrap text-[10px] font-semibold uppercase tracking-widest transition-opacity duration-300 ${
                  isActive ? "text-white/80 opacity-100" : "text-white/60 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
                }`}
              >
                {section.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
