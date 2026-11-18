import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { RotateCcw } from "lucide-react";
import { GiftCosmos } from "@/components/ui/gift-cosmos";
import { initials } from "@/lib/utils";
import "./roundtable.css";

// A calm 3D round table that opens a page. It plays a short walkthrough
// (one thing on the table lights up per step), then settles into a smaller
// resting state. It is inline page content, never a modal: nothing below
// it is blocked while it plays.
//
// The table is plain CSS 3D (see roundtable.css for the coordinate notes).
// One small rAF loop writes the spin angle to a custom property; the place
// cards read the same property to counter-rotate and stay facing the viewer.

export type RoundTableSeat = { id: string; label: string };
export type RoundTableHighlight = "seats" | "center" | "pairing" | "delivery";
export type RoundTableStep = { title: string; body: string; highlight: RoundTableHighlight };

type Props = {
  seats: RoundTableSeat[];
  steps: RoundTableStep[];
  eyebrow: string;
  title: ReactNode;
  /** Optional sentence under the title. */
  lede?: ReactNode;
  /** Stays at the resting size while the walkthrough plays (for inner pages). */
  compact?: boolean;
  className?: string;
  /** Rendered as actions under the copy. */
  children?: ReactNode;
};

const STEP_MS = 2600;
const MAX_SEATS = 10;
const PLACEHOLDER_SEATS = 6;
const AUTO_SPEED = 0.005; // degrees per ms, about 72s per turn
const MAX_SPEED = 0.6;
const START_ANGLE = -18;
const SEAT_RADIUS = 0.84; // fraction of the table radius

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

function Box3D({ size, height, bow = false, className = "" }: { size: number; height: number; bow?: boolean; className?: string }) {
  return (
    <div className={`rt-box ${className}`} style={{ "--bs": `${size}px`, "--bh": `${height}px` } as CSSProperties}>
      <div className="rt-box-glow" />
      <div className="rt-box-face" data-f="back" />
      <div className="rt-box-face" data-f="left" />
      <div className="rt-box-face" data-f="right" />
      <div className="rt-box-face" data-f="front" />
      <div className="rt-box-lid">
        {bow && (
          <>
            <span className="rt-bow" data-b="a" />
            <span className="rt-bow" data-b="b" />
          </>
        )}
      </div>
    </div>
  );
}

export function RoundTableScene({ seats, steps, eyebrow, title, lede, compact = false, className = "", children }: Props) {
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const wide = useMediaQuery("(min-width: 1024px)");
  const gradientId = useId();

  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(() => !window.matchMedia("(prefers-reduced-motion: reduce)").matches && steps.length > 0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const paused = hovered || focused;

  useEffect(() => {
    if (reduced) setPlaying(false);
  }, [reduced]);

  // ----- walkthrough clock: pausing keeps the time already spent on a step -----
  const remainingRef = useRef(STEP_MS);
  useEffect(() => {
    remainingRef.current = STEP_MS;
  }, [step, playing]);
  useEffect(() => {
    if (!playing || paused) return;
    const started = performance.now();
    const timer = window.setTimeout(() => {
      if (step >= steps.length - 1) setPlaying(false);
      else setStep((s) => s + 1);
    }, remainingRef.current);
    return () => {
      window.clearTimeout(timer);
      remainingRef.current = Math.max(250, remainingRef.current - (performance.now() - started));
    };
  }, [playing, paused, step, steps.length]);

  function goTo(index: number) {
    setStep(index);
    setPlaying(true);
  }

  // ----- seats -----
  const isPlaceholder = seats.length === 0;
  const shown: RoundTableSeat[] = isPlaceholder
    ? Array.from({ length: PLACEHOLDER_SEATS }, (_, i) => ({ id: `placeholder-${i}`, label: "" }))
    : seats.length <= MAX_SEATS
      ? seats
      : [...seats.slice(0, MAX_SEATS - 1), { id: "rt-more", label: `+${seats.length - (MAX_SEATS - 1)}` }];
  const count = shown.length;
  // Seat 0 sits nearest the viewer when the table is at angle 0.
  const seatAngle = (i: number) => Math.PI / 2 + (i / count) * Math.PI * 2;

  // Decorative arcs only: a fixed star pattern over seat positions. It is
  // derived from the seat count alone and has nothing to do with any draw.
  const arcStep = count <= 3 ? 1 : Math.floor((count - 1) / 2);
  const arcCount = count < 2 ? 0 : count === 2 ? 1 : count;
  const arcs = Array.from({ length: arcCount }, (_, i) => {
    const a = seatAngle(i);
    const b = seatAngle((i + arcStep) % count);
    const r = 68;
    const x1 = Math.cos(a) * r;
    const y1 = Math.sin(a) * r;
    const x2 = Math.cos(b) * r;
    const y2 = Math.sin(b) * r;
    const cx = ((x1 + x2) / 2) * 0.3;
    const cy = ((y1 + y2) / 2) * 0.3;
    return `M ${x1.toFixed(2)} ${y1.toFixed(2)} Q ${cx.toFixed(2)} ${cy.toFixed(2)} ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  });

  // ----- rotation: slow auto-spin, drag to spin with inertia -----
  const discRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const motion = useRef({ angle: START_ANGLE, velocity: AUTO_SPEED, dragging: false, lastX: 0, lastT: 0 });

  useEffect(() => {
    const disc = discRef.current;
    const viewport = viewportRef.current;
    if (!disc || !viewport) return;
    const seatEls = Array.from(disc.querySelectorAll<HTMLElement>(".rt-seat"));
    const baseAngles = seatEls.map((_, i) => Math.PI / 2 + (i / seatEls.length) * Math.PI * 2);

    function apply() {
      const m = motion.current;
      disc!.style.setProperty("--rt-a", `${m.angle.toFixed(2)}deg`);
      const rad = (m.angle * Math.PI) / 180;
      // Seats on the far side of the table sit back a little.
      seatEls.forEach((el, i) => {
        const near = (Math.sin(baseAngles[i]! + rad) + 1) / 2;
        el.style.opacity = (0.5 + near * 0.5).toFixed(3);
      });
    }
    apply();
    if (reduced) return;

    let visible = true;
    const observer = new IntersectionObserver(([entry]) => { visible = Boolean(entry?.isIntersecting); });
    observer.observe(viewport);

    let raf = 0;
    let last = performance.now();
    function loop(now: number) {
      const dt = Math.min(64, now - last);
      last = now;
      if (visible) {
        const m = motion.current;
        if (!m.dragging) {
          // Ease whatever speed a drag left behind back to the slow drift.
          m.velocity += (AUTO_SPEED - m.velocity) * (1 - Math.exp(-dt / 900));
          m.angle += m.velocity * dt;
        }
        apply();
      }
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [reduced, count]);

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (reduced || (e.pointerType === "mouse" && e.button !== 0)) return;
    const m = motion.current;
    m.dragging = true;
    m.lastX = e.clientX;
    m.lastT = performance.now();
    m.velocity = 0;
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const m = motion.current;
    if (!m.dragging) return;
    const now = performance.now();
    const dt = Math.max(1, now - m.lastT);
    // Dragging right carries the near edge of the table to the right.
    const delta = -(e.clientX - m.lastX) * 0.35;
    m.angle += delta;
    m.velocity = m.velocity * 0.5 + (delta / dt) * 0.5;
    m.lastX = e.clientX;
    m.lastT = now;
  }
  function endDrag(e: ReactPointerEvent<HTMLDivElement>) {
    const m = motion.current;
    if (!m.dragging) return;
    m.dragging = false;
    // A drag that stopped before release should not fling.
    if (performance.now() - m.lastT > 120) m.velocity = 0;
    m.velocity = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, m.velocity));
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (reduced) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const dir = e.key === "ArrowRight" ? -1 : 1;
      motion.current.velocity = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, motion.current.velocity + dir * 0.14));
    }
  }

  // ----- pause on hover (mouse only) and on keyboard focus -----
  function onFocus(e: FocusEvent<HTMLElement>) {
    if (e.target instanceof HTMLElement && e.target.matches(":focus-visible")) setFocused(true);
  }
  function onBlur(e: FocusEvent<HTMLElement>) {
    if (!(e.relatedTarget instanceof Node) || !e.currentTarget.contains(e.relatedTarget)) setFocused(false);
  }

  const current = steps[step];
  const highlight = playing && current ? current.highlight : undefined;
  const resting = compact || !playing;
  const tableLabel = isPlaceholder
    ? "A round table with empty seats."
    : `A round table with ${seats.length} ${seats.length === 1 ? "seat" : "seats"}: ${seats.map((s) => s.label).join(", ")}.`;

  return (
    <section
      aria-label={eyebrow}
      data-cosmos-dark
      data-highlight={highlight}
      data-resting={resting}
      data-compact={compact}
      data-paused={paused}
      onPointerEnter={(e) => { if (e.pointerType === "mouse") setHovered(true); }}
      onPointerLeave={() => setHovered(false)}
      onFocus={onFocus}
      onBlur={onBlur}
      className={`rt-stage relative overflow-hidden rounded-3xl text-white ${className}`}
    >
      <GiftCosmos intensity={0.45} centerX={wide ? 0.74 : 0.5} centerY={wide ? 0.52 : 0.26} scale={wide ? 1.15 : 0.95} interactive={false} />

      <div className={`relative grid items-center gap-x-8 gap-y-4 px-5 sm:px-8 lg:grid-cols-2 lg:px-12 ${compact ? "py-6 lg:py-8" : "py-7 sm:py-9 lg:py-12"}`}>
        {/* The table */}
        <div className="min-w-0 lg:order-2">
          <div
            ref={viewportRef}
            className="rt-viewport"
            tabIndex={reduced ? undefined : 0}
            role="group"
            aria-label={`${tableLabel}${reduced ? "" : " Drag, or use the left and right arrow keys, to turn it."}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onKeyDown={onKeyDown}
          >
            <div className="rt-scale" aria-hidden="true">
              <div className="rt-tilt">
                <div className="rt-shadow" />
                <div className="rt-slab" />
                <div className="rt-surface" />
                <div ref={discRef} className="rt-disc">
                  <svg className="rt-marks" viewBox="-100 -100 200 200">
                    <defs>
                      <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0" stopColor="#e5593f" />
                        <stop offset="1" stopColor="#e0467f" />
                      </linearGradient>
                    </defs>
                    <circle className="rt-ring" r="97" />
                    <circle className="rt-ring" r="68" />
                    <circle className="rt-ring" r="38" />
                    {shown.map((seat, i) => {
                      const a = seatAngle(i);
                      return <line key={seat.id} className="rt-tick" x1={Math.cos(a) * 68} y1={Math.sin(a) * 68} x2={Math.cos(a) * 76} y2={Math.sin(a) * 76} />;
                    })}
                    <g className="rt-arcs">
                      {arcs.map((d, i) => (
                        <path key={i} className="rt-arc" d={d} pathLength={1} stroke={`url(#${gradientId})`} style={{ "--i": i } as CSSProperties} />
                      ))}
                    </g>
                  </svg>

                  <Box3D size={38} height={28} bow className="rt-gift" />
                  <div className="rt-parcel">
                    <Box3D size={15} height={11} />
                  </div>

                  {shown.map((seat, i) => {
                    const a = seatAngle(i);
                    const isMore = seat.id === "rt-more";
                    const firstName = seat.label.trim().split(/\s+/)[0] ?? "";
                    return (
                      <div
                        key={seat.id}
                        className="rt-seat"
                        data-target={i === 0}
                        style={{ "--sx": (Math.cos(a) * SEAT_RADIUS).toFixed(4), "--sy": (Math.sin(a) * SEAT_RADIUS).toFixed(4), "--i": i } as CSSProperties}
                      >
                        <div className="rt-card" data-empty={isPlaceholder}>
                          {isPlaceholder ? (
                            <span className="rt-card-blank" />
                          ) : (
                            <>
                              <span className="rt-card-initials">{isMore ? seat.label : initials(seat.label) || "?"}</span>
                              {!isMore && firstName.length > 1 && <span className="rt-card-name">{firstName}</span>}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* The copy */}
        <div className="min-w-0 lg:order-1">
          <p className="font-mono text-xs font-bold uppercase tracking-widest text-givit-ember">{eyebrow}</p>
          <h1 className={`mt-3 break-words font-light leading-[1.08] tracking-tight text-white ${compact ? "text-2xl sm:text-3xl" : "text-3xl sm:text-4xl lg:text-5xl"}`}>
            {title}
          </h1>
          {lede && <div className="mt-3 max-w-lg text-sm leading-6 text-white/60">{lede}</div>}

          {steps.length > 0 && reduced && (
            <ol className="mt-5 max-w-lg space-y-3 border-l border-white/15 pl-4">
              {steps.map((s, i) => (
                <li key={s.title}>
                  <p className="text-sm font-medium text-white">
                    <span className="mr-2 font-mono text-[11px] text-white/40">{String(i + 1).padStart(2, "0")}</span>
                    {s.title}
                  </p>
                  <p className="mt-0.5 text-sm leading-6 text-white/60">{s.body}</p>
                </li>
              ))}
            </ol>
          )}

          {steps.length > 0 && !reduced && (
            <>
              <div className="rt-steps" data-open={playing} aria-hidden={!playing}>
                <div>
                  {current && (
                    <div key={step} className="rt-copy-in mt-5 min-h-[8.5rem] border-l border-white/15 pl-4 sm:min-h-[7rem]" aria-live="polite">
                      <p className="font-mono text-[11px] tracking-widest text-white/40">
                        {String(step + 1).padStart(2, "0")} / {String(steps.length).padStart(2, "0")}
                      </p>
                      <p className="mt-1 text-lg font-medium text-white">{current.title}</p>
                      <p className="mt-1 max-w-md text-sm leading-6 text-white/60">{current.body}</p>
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-3 flex min-h-6 items-center gap-4">
                {playing ? (
                  <>
                    <div className="flex items-center">
                      {steps.map((s, i) => (
                        <button
                          key={s.title}
                          type="button"
                          className="rt-dot"
                          aria-label={`Step ${i + 1} of ${steps.length}: ${s.title}`}
                          aria-current={i === step ? "step" : undefined}
                          onClick={() => goTo(i)}
                        >
                          <span>{i === step && <i key={step} className="rt-dot-fill" style={{ animationDuration: `${STEP_MS}ms` }} />}</span>
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => setPlaying(false)}
                      className="font-mono text-[11px] font-bold uppercase tracking-widest text-white/50 underline-offset-4 hover:text-white hover:underline focus-visible:text-white focus-visible:underline focus-visible:outline-none"
                    >
                      Skip
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => goTo(0)}
                    className="inline-flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-widest text-white/50 underline-offset-4 hover:text-white hover:underline focus-visible:text-white focus-visible:underline focus-visible:outline-none"
                  >
                    <RotateCcw className="h-3 w-3" aria-hidden="true" /> Replay walkthrough
                  </button>
                )}
              </div>
            </>
          )}

          {children && <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-3">{children}</div>}
        </div>
      </div>
    </section>
  );
}
