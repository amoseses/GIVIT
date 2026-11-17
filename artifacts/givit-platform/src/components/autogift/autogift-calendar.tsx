import { useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowUpRight, Bell, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { getHolidaysForRegion } from "@/lib/data/holidays";
import { upcomingAge, isMilestoneAge } from "@/lib/date-utils";
import { GiftCosmos } from "@/components/ui/gift-cosmos";
import { GiftNode, HolidayBeacon } from "@/components/calendar/calendar-glyphs";
import "@/components/calendar/calendar-space.css";

type Occasion = { label: string; date: string };
type Recipient = { id: string; name: string; relationship?: string; interests?: string[]; occasions: Occasion[] };
type DayOccasion = { recipient: string; label: string; date: string; isHoliday?: boolean; category?: string; relationship?: string; topInterest?: string; age?: number | null; milestone?: boolean };

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const FILTERS = [
  { id: "all", label: "All" },
  { id: "personal", label: "Personal" },
  { id: "holidays", label: "Holidays" },
] as const;

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-givit-ember";

function relativeLabel(daysUntil: number) {
  if (daysUntil <= 0) return "today";
  if (daysUntil === 1) return "tomorrow";
  if (daysUntil < 14) return `in ${daysUntil} days`;
  if (daysUntil < 60) return `in ${Math.round(daysUntil / 7)} weeks`;
  return `in ${Math.round(daysUntil / 30)} months`;
}

function daysUntilNextOccurrence(month: number, day: number, from: Date) {
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  let next = new Date(from.getFullYear(), month, day);
  if (next < today) next = new Date(from.getFullYear() + 1, month, day);
  return Math.round((next.getTime() - today.getTime()) / 86400000);
}

function initialsOf(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function AutoGiftCalendar({
  recipients,
  scheduledKeys,
  region,
}: {
  recipients: Recipient[];
  scheduledKeys?: Set<string>;
  region: string;
}) {
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  // Computed for whichever year is actually on screen, not a fixed year
  // handed down once from the parent -- the year picker below lets someone
  // navigate to any year, and holidays needs to follow that, not just the
  // real current year.
  const holidays = useMemo(() => getHolidaysForRegion(region, cursor.year), [region, cursor.year]);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [hoveredDay, setHoveredDay] = useState<number | null>(null);
  const [filter, setFilter] = useState<"all" | "personal" | "holidays">("all");
  // Which way the last month change travelled, so the incoming month can
  // drift in from that side.
  const [direction, setDirection] = useState<"next" | "prev">("next");

  // Month & Year picker state
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pickerYear, setPickerYear] = useState(cursor.year);

  const occasionsByDay = useMemo(() => {
    const map = new Map<number, DayOccasion[]>();

    // Personal recipient occasions
    if (filter === "all" || filter === "personal") {
      for (const r of recipients) {
        for (const o of r.occasions) {
          if (!o.date) continue;
          const d = new Date(`${o.date}T12:00:00`);
          if (Number.isNaN(d.getTime()) || d.getMonth() !== cursor.month) continue;
          const day = d.getDate();
          const age = o.label === "Birthday" ? upcomingAge(o.date) : null;
          map.set(day, [...(map.get(day) ?? []), {
            recipient: r.name,
            label: o.label,
            date: o.date,
            relationship: r.relationship,
            topInterest: r.interests?.[0],
            age,
            milestone: isMilestoneAge(age),
          }]);
        }
      }
    }

    // Public regional holidays -- checked against cursor.year too, not just
    // cursor.month: holidays is computed once for a single fixed year by
    // the parent, so without the year check, browsing to a different year
    // silently redisplayed that same fixed year's holidays on the wrong
    // dates instead of showing none.
    if (filter === "all" || filter === "holidays") {
      for (const h of holidays) {
        if (!h.date) continue;
        const d = new Date(`${h.date}T12:00:00`);
        if (Number.isNaN(d.getTime()) || d.getMonth() !== cursor.month || d.getFullYear() !== cursor.year) continue;
        const day = d.getDate();
        map.set(day, [
          ...(map.get(day) ?? []),
          { recipient: h.name, label: `${h.category.toUpperCase()} HOLIDAY`, date: h.date, isHoliday: true, category: h.category },
        ]);
      }
    }

    return map;
  }, [recipients, holidays, cursor.month, filter]);

  const today = new Date();
  const isCurrentMonth = today.getFullYear() === cursor.year && today.getMonth() === cursor.month;
  const firstWeekday = new Date(cursor.year, cursor.month, 1).getDay();
  const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const monthName = MONTH_NAMES[cursor.month] ?? "";
  const selectedOccasions = selectedDay ? occasionsByDay.get(selectedDay) : undefined;
  // Some months genuinely have zero holidays for a given region (August
  // has none in the US/global list, for example) -- without this, that
  // reads as "the holidays feature is broken" rather than "there's just
  // nothing this month."
  const hasHolidayThisMonth = holidays.some((h) => {
    const d = new Date(`${h.date}T12:00:00`);
    return !Number.isNaN(d.getTime()) && d.getMonth() === cursor.month && d.getFullYear() === cursor.year;
  });
  let datesInView = 0;
  for (const list of occasionsByDay.values()) datesInView += list.length;

  function shiftMonth(delta: number) {
    setDirection(delta < 0 ? "prev" : "next");
    setCursor((prev) => {
      const d = new Date(prev.year, prev.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
    setSelectedDay(null);
  }

  return (
    // Always dark, whatever the site theme: a viewport onto the ribbon
    // cosmos with the month floating in front of it. The cosmos is clipped
    // in its own layer so day popovers can still escape the panel's edge.
    <div data-cosmos-dark className="relative rounded-2xl border border-white/10 bg-[#0a0a0d] text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl" aria-hidden="true">
        <GiftCosmos intensity={0.5} centerX={0.74} centerY={0.38} scale={1.55} tilt={58} />
        <div className="absolute inset-0 bg-[#0a0a0d]/45" />
      </div>

      <div className="relative p-3 sm:p-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
          {/* Month & Year title, also the trigger for the month/year picker */}
          <div className="relative min-w-0">
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-white/45">
              {datesInView === 0 ? "Nothing in view" : `${datesInView} ${datesInView === 1 ? "date" : "dates"} in view`}
            </p>
            <button
              type="button"
              onClick={() => {
                setPickerYear(cursor.year);
                setShowDatePicker(!showDatePicker);
              }}
              aria-expanded={showDatePicker}
              aria-label={`${monthLabel}. Choose month and year`}
              className={`group mt-1 flex items-baseline gap-2 rounded-md text-left text-2xl font-light tracking-tight text-white sm:text-4xl ${FOCUS_RING}`}
              title="Click to select month and year"
            >
              <span>{monthName}</span>
              <span className="givit-gradient-text font-semibold">{cursor.year}</span>
              <ChevronDown className={`h-4 w-4 shrink-0 self-center transition-transform duration-200 ${showDatePicker ? "rotate-180 text-givit-ember" : "text-white/40 group-hover:text-white"}`} />
            </button>

            {/* Month & Year Picker Popover */}
            {showDatePicker && (
              <div className="cal-pop absolute left-0 top-full z-50 mt-2 w-64 max-w-[calc(100vw-3rem)] rounded-xl border border-white/15 bg-[#121116]/95 p-4 shadow-2xl backdrop-blur-md">
                {/* Year Navigation Header */}
                <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2">
                  <button
                    type="button"
                    onClick={() => setPickerYear((y) => y - 1)}
                    className={`rounded-md p-1 text-white/50 transition hover:text-white ${FOCUS_RING}`}
                    aria-label="Previous year"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="font-mono text-sm font-semibold tabular-nums text-white">{pickerYear}</span>
                  <button
                    type="button"
                    onClick={() => setPickerYear((y) => y + 1)}
                    className={`rounded-md p-1 text-white/50 transition hover:text-white ${FOCUS_RING}`}
                    aria-label="Next year"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>

                {/* 12 Months Grid */}
                <div className="grid grid-cols-3 gap-1.5">
                  {MONTH_NAMES.map((name, mIdx) => {
                    const isSelected = cursor.year === pickerYear && cursor.month === mIdx;
                    const isCurrentMonthThisYear = today.getFullYear() === pickerYear && today.getMonth() === mIdx;
                    return (
                      <button
                        key={name}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => {
                          const target = pickerYear * 12 + mIdx;
                          const current = cursor.year * 12 + cursor.month;
                          setDirection(target < current ? "prev" : "next");
                          setCursor({ year: pickerYear, month: mIdx });
                          setSelectedDay(null);
                          setShowDatePicker(false);
                        }}
                        className={`rounded-md border py-2 font-mono text-[11px] uppercase tracking-wider transition ${FOCUS_RING} ${
                          isSelected
                            ? "border-givit-ember bg-givit-ember/15 font-bold text-white"
                            : isCurrentMonthThisYear
                              ? "border-white/10 font-bold text-givit-ember hover:border-white/30"
                              : "border-transparent text-white/60 hover:border-white/20 hover:text-white"
                        }`}
                      >
                        {name.slice(0, 3)}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {/* Filter: plain typographic tabs, the active one underlined */}
            <div className="flex items-center gap-4 font-mono text-[10px] font-bold uppercase tracking-widest" role="group" aria-label="Filter dates">
              {FILTERS.map((f) => {
                const active = filter === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setFilter(f.id)}
                    className={`flex items-center gap-1.5 rounded-sm border-b pb-1 transition ${FOCUS_RING} ${
                      active ? "border-givit-ember text-white" : "border-transparent text-white/45 hover:text-white"
                    }`}
                  >
                    {f.id === "holidays" && <HolidayBeacon className="h-3.5 w-3.5 text-[#ffc478]" />}
                    {f.label}
                  </button>
                );
              })}
            </div>

            <div className="flex gap-1.5">
              <button type="button" onClick={() => shiftMonth(-1)} className={`rounded-full border border-white/15 p-1.5 text-white/60 transition hover:border-white/40 hover:text-white ${FOCUS_RING}`} aria-label="Previous month">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => shiftMonth(1)} className={`rounded-full border border-white/15 p-1.5 text-white/60 transition hover:border-white/40 hover:text-white ${FOCUS_RING}`} aria-label="Next month">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {filter === "holidays" && !hasHolidayThisMonth && (
          <p className="mb-3 flex items-center gap-2 text-xs text-white/55">
            <HolidayBeacon className="h-4 w-4 shrink-0 text-[#ffc478]" /> No holidays for this region in {monthName}. Try another month.
          </p>
        )}

        <div className="grid grid-cols-7 gap-1 text-center font-mono text-[10px] font-bold uppercase tracking-widest text-white/35 sm:gap-1.5">
          {WEEKDAY_LABELS.map((d, i) => <div key={i}>{d}</div>)}
        </div>
        <div
          key={`${cursor.year}-${cursor.month}`}
          className={`mt-2 grid grid-cols-7 gap-1 sm:gap-1.5 ${direction === "next" ? "cal-month-next" : "cal-month-prev"}`}
        >
          {cells.map((day, i) => {
            if (!day) return <div key={i} aria-hidden="true" />;

            const dayOccasions = occasionsByDay.get(day);
            const isToday = isCurrentMonth && day === today.getDate();
            const hasPersonal = dayOccasions?.some((o) => !o.isHoliday);
            const holidayItem = dayOccasions?.find((o) => o.isHoliday);
            const hasHoliday = Boolean(holidayItem);
            const hasReminder = dayOccasions?.some((o) => !o.isHoliday && scheduledKeys?.has(`${o.recipient}-${o.label}-${o.date}`));
            const isHovered = hoveredDay === day;
            const isSelected = selectedDay === day;

            // Determine list of people for the hover popover:
            // Personal recipients on this date, or if it's a general holiday, fallback to recipients list
            const personalPeople = dayOccasions?.filter((o) => !o.isHoliday) ?? [];
            const peopleForPopover = personalPeople.length > 0
              ? personalPeople.map((o) => ({ name: o.recipient, label: o.label, milestone: o.milestone, age: o.age }))
              : recipients.slice(0, 4).map((r) => ({ name: r.name, label: holidayItem?.recipient || "Holiday", milestone: false, age: null as number | null }));

            const firstPerson = personalPeople[0];
            const nodeLabel = firstPerson
              ? `${initialsOf(firstPerson.recipient)}${personalPeople.length > 1 ? `+${personalPeople.length - 1}` : ""}`
              : "";
            const column = i % 7;
            const dateLabel = new Date(cursor.year, cursor.month, day).toLocaleDateString("en-US", { month: "long", day: "numeric" });
            const ariaParts = [dateLabel];
            if (isToday) ariaParts.push("today");
            for (const o of dayOccasions ?? []) ariaParts.push(o.isHoliday ? `${o.recipient}, public holiday` : `${o.recipient}, ${o.label}`);
            if (hasReminder) ariaParts.push("reminder scheduled");

            return (
              <div
                key={i}
                className={`relative ${isHovered ? "z-30" : ""}`}
                onMouseEnter={() => setHoveredDay(day)}
                onMouseLeave={() => setHoveredDay(null)}
                onFocus={() => setHoveredDay(day)}
                onBlur={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHoveredDay(null);
                }}
              >
                <button
                  type="button"
                  onClick={() => setSelectedDay(day === selectedDay ? null : day)}
                  aria-pressed={isSelected}
                  aria-label={ariaParts.join(". ")}
                  data-lifted={isHovered ? "true" : undefined}
                  className={`cal-day relative flex aspect-square w-full items-center justify-center rounded-lg border ${FOCUS_RING} ${
                    isSelected
                      ? "border-white/60 bg-white/[0.1]"
                      : isToday
                        ? "border-givit-ember/80 bg-givit-ember/[0.08] shadow-[0_0_22px_-6px_rgba(255,90,61,0.75)]"
                        : dayOccasions
                          ? "border-white/20 bg-white/[0.05] hover:border-white/45"
                          : "border-white/10 bg-white/[0.03] hover:border-white/30 hover:bg-white/[0.06]"
                  }`}
                >
                  <span className={`absolute left-1 top-0.5 font-mono text-[10px] tabular-nums sm:left-2 sm:top-1.5 sm:text-xs ${isToday ? "font-bold text-givit-ember" : dayOccasions ? "font-semibold text-white" : "text-white/55"}`}>
                    {day}
                  </span>

                  {hasReminder && (
                    <Bell className="absolute right-1 top-1 h-2.5 w-2.5 fill-givit-coral text-givit-coral sm:right-2 sm:top-2 sm:h-3 sm:w-3" aria-hidden="true" />
                  )}

                  {dayOccasions && (
                    <span
                      className="cal-float mt-2.5 flex flex-col items-center gap-0.5 sm:mt-3"
                      style={{ animationDelay: `${-(day % 7) * 0.8}s` }}
                    >
                      <span className="flex items-center justify-center -space-x-0.5">
                        {hasPersonal && <GiftNode className="h-4 w-4 sm:h-6 sm:w-6" />}
                        {hasHoliday && <HolidayBeacon className="h-4 w-4 text-[#ffc478] sm:h-6 sm:w-6" />}
                      </span>
                      {nodeLabel && (
                        <span className="hidden font-mono text-[9px] font-bold uppercase leading-none tracking-wider text-white/80 sm:block">{nodeLabel}</span>
                      )}
                    </span>
                  )}
                </button>

                {/* Hover Popover Window */}
                {isHovered && (dayOccasions?.length || recipients.length > 0) && (
                  <div
                    className={`absolute bottom-full z-50 w-56 pb-2 text-left sm:w-64 ${
                      column <= 2 ? "left-0" : column >= 4 ? "right-0" : "left-1/2 -translate-x-1/2"
                    }`}
                  >
                    <div className="cal-pop rounded-xl border border-white/15 bg-[#121116]/95 p-3.5 shadow-2xl backdrop-blur-md">
                      {/* Popover Header */}
                      <div className="mb-2 border-b border-white/10 pb-2">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-white/50">
                            {new Date(cursor.year, cursor.month, day).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </span>
                          {hasHoliday && (
                            <span className="inline-flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-widest text-[#ffc478]">
                              <HolidayBeacon className="h-3.5 w-3.5" /> Holiday
                            </span>
                          )}
                        </div>
                        {holidayItem && (
                          <p className="mt-1 text-sm font-semibold tracking-tight text-white">
                            {holidayItem.recipient}
                          </p>
                        )}
                      </div>

                      {/* People list (Max 2 visible at once, scrollable container) */}
                      <p className="mb-1 font-mono text-[10px] font-bold uppercase tracking-widest text-white/40">
                        {personalPeople.length > 0 ? "People to gift:" : "Suggested Recipients:"}
                      </p>

                      <div className="max-h-24 divide-y divide-white/10 overflow-y-auto pr-1 text-xs">
                        {peopleForPopover.map((p, idx) => {
                          const giftQuery = `Gift ideas for ${p.name}${holidayItem ? ` for ${holidayItem.recipient}` : p.label ? ` for ${p.label}` : ""}`;
                          return (
                            <div key={idx} className="flex items-center justify-between gap-2 py-1.5">
                              <div className="min-w-0 flex-1">
                                <p className="flex items-center gap-1.5 truncate font-semibold text-white">
                                  {p.name}
                                  {p.milestone && <span className="shrink-0 font-mono text-[10px] font-bold text-givit-ember">{p.age}</span>}
                                </p>
                                <p className="truncate text-[10px] text-white/50">{p.label}</p>
                              </div>
                              <Link
                                href={`/gift?q=${encodeURIComponent(giftQuery)}`}
                                className={`inline-flex shrink-0 items-center gap-0.5 rounded-full border border-givit-ember/60 px-2.5 py-1 text-[11px] font-bold text-givit-ember transition hover:bg-givit-ember hover:text-white ${FOCUS_RING}`}
                              >
                                Gift me! <ArrowUpRight className="h-3 w-3" />
                              </Link>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Selected Day Details */}
        {selectedOccasions && selectedOccasions.length > 0 && (
          <div className="cal-pop mt-4 divide-y divide-white/10 border-t border-white/15">
            {selectedOccasions.map((o, i) => {
              const parsed = new Date(`${o.date}T12:00:00`);
              const daysUntil = daysUntilNextOccurrence(parsed.getMonth(), parsed.getDate(), today);
              const scheduled = !o.isHoliday && scheduledKeys?.has(`${o.recipient}-${o.label}-${o.date}`);
              return (
                <div key={i} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-3 text-xs">
                  <div className="flex min-w-0 items-start gap-3">
                    {o.isHoliday ? <HolidayBeacon className="mt-0.5 h-5 w-5 shrink-0 text-[#ffc478]" /> : <GiftNode className="mt-0.5 h-5 w-5 shrink-0" />}
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-x-2 text-sm font-semibold tracking-tight text-white">
                        {o.isHoliday ? (
                          <span>{o.recipient}</span>
                        ) : (
                          <span>{o.recipient} · {o.label}</span>
                        )}
                        {o.milestone && (
                          <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-givit-ember">Turning {o.age}</span>
                        )}
                      </p>
                      {!o.isHoliday && (o.relationship || o.topInterest) && (
                        <p className="mt-0.5 text-[11px] text-white/50">
                          {[o.relationship, o.topInterest ? `loves ${o.topInterest}` : null].filter(Boolean).join(" · ")}
                        </p>
                      )}
                      <p className="mt-0.5 flex items-center gap-1 text-white/50">
                        {o.isHoliday ? (
                          <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#ffc478]">Public Holiday</span>
                        ) : scheduled ? (
                          <><Bell className="h-3 w-3 text-givit-coral" /> Reminder scheduled</>
                        ) : (
                          "No reminder scheduled"
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className={`font-mono text-[10px] font-bold uppercase tracking-widest ${o.isHoliday ? "text-[#ffc478]" : "text-white/60"}`}>
                      {relativeLabel(daysUntil)}
                    </span>
                    <Link
                      href={`/gift?q=${encodeURIComponent(`Gift ideas for ${o.recipient}`)}`}
                      className={`inline-flex items-center gap-0.5 rounded-full border border-givit-ember/60 px-3 py-1 text-[11px] font-bold text-givit-ember transition hover:bg-givit-ember hover:text-white ${FOCUS_RING}`}
                    >
                      Gift me! <ArrowUpRight className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Key */}
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-white/10 pt-3 font-mono text-[10px] uppercase tracking-widest text-white/40">
          <span className="flex items-center gap-1.5"><GiftNode className="h-3.5 w-3.5" /> Personal</span>
          <span className="flex items-center gap-1.5"><HolidayBeacon className="h-3.5 w-3.5 text-[#ffc478]" /> Holiday</span>
          <span className="flex items-center gap-1.5"><Bell className="h-3 w-3 fill-givit-coral text-givit-coral" aria-hidden="true" /> Reminder set</span>
        </div>
      </div>
    </div>
  );
}
