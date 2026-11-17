import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { Bell, Check, ChevronDown, Globe, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/layout/page-shell";
import { useAuth } from "@/lib/auth/use-auth";
import { useRecipients, nextOccurrenceDate } from "@/lib/hooks/use-recipients";
import { upcomingAge, isMilestoneAge } from "@/lib/date-utils";
import { AutoGiftCalendar } from "@/components/autogift/autogift-calendar";
import { GoogleCalendarConnect } from "@/components/calendar/google-calendar-connect";
import { getHolidaysForRegion, SUPPORTED_REGIONS } from "@/lib/data/holidays";
import { useUserRegion } from "@/lib/hooks/use-user-region";
import { GiftCosmos } from "@/components/ui/gift-cosmos";
import { GiftNode, HolidayBeacon } from "@/components/calendar/calendar-glyphs";

export default function CalendarPage() {
  const { user, profile, loading } = useAuth();
  const { recipients, notifications, localReady } = useRecipients(user, profile?.default_reminder_lead_days ?? undefined);
  // Shared, persisted preference -- previously local-only state that reset
  // to auto-detected on every reload. Now the same choice also drives the
  // localized price estimate shown on marketplace listings.
  const [region, setRegion] = useUserRegion();
  const [showRegionPicker, setShowRegionPicker] = useState(false);

  // Landing back here is how the Google OAuth redirect
  // (api/auth/google-calendar/callback) reports success/failure when the
  // connect flow was started from this page -- there's no other channel
  // back to the SPA from a full-page redirect Google itself controls.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get("calendar");
    if (!result) return;
    if (result === "connected") toast.success("Google Calendar connected. Hit \"Sync now\" to pull in birthdays.");
    else if (result === "denied") toast("Google Calendar wasn't connected.");
    else if (result === "error") toast.error("Couldn't connect Google Calendar. Try again.");
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  const currentYear = new Date().getFullYear();
  const holidays = useMemo(() => getHolidaysForRegion(region, currentYear), [region, currentYear]);

  const scheduledKeys = new Set(notifications.map((n) => `${n.recipientName}-${n.occasion}-${n.date}`));

  const upcomingPersonal = recipients
    .flatMap((r) =>
      r.occasions.filter((o) => o.date).map((o) => {
        // Age only means anything for an actual birthday -- other occasion
        // types (anniversaries, etc.) reuse the same date field but a
        // stored year there isn't someone's birth year.
        const age = o.label === "Birthday" ? upcomingAge(o.date) : null;
        return {
          recipient: r.name,
          label: o.label,
          date: o.date,
          parsed: nextOccurrenceDate(o.date),
          isHoliday: false,
          age,
          milestone: isMilestoneAge(age),
        };
      })
    );

  const upcomingHolidays = holidays.map((h) => ({
    recipient: h.name,
    label: `${h.category.toUpperCase()} HOLIDAY`,
    date: h.date,
    parsed: nextOccurrenceDate(h.date),
    isHoliday: true,
    age: null as number | null,
    milestone: false,
  }));

  const upcomingAll = [...upcomingPersonal, ...upcomingHolidays]
    .sort((a, b) => a.parsed.getTime() - b.parsed.getTime())
    .slice(0, 10);

  if (loading && !localReady) {
    return (
      <PageShell>
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-givit-ember border-t-transparent" />
        </div>
      </PageShell>
    );
  }

  if (!user) {
    return (
      <PageShell>
        <div data-cosmos-dark className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0a0a0d] px-6 py-20 sm:px-12 sm:py-28">
          <GiftCosmos intensity={0.6} centerX={0.78} centerY={0.45} scale={1.5} />
          <div className="relative max-w-xl">
            <p className="font-mono text-xs font-bold uppercase tracking-widest text-givit-ember">Calendar</p>
            <h2 className="mt-3 text-4xl font-light tracking-tight text-white sm:text-5xl">Every date and holiday, <span className="givit-gradient-text font-semibold">in one place.</span></h2>
            <p className="mt-4 max-w-md text-sm leading-6 text-white/65">Save birthdays and anniversaries in People and track regional public holidays automatically, year-round.</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button asChild className="rounded-full bg-givit-ember px-6 text-white hover:bg-givit-ember-hover"><Link href="/signup?next=/calendar">Create free account</Link></Button>
              <Button asChild variant="outline" className="rounded-full border-white/20 bg-transparent px-6 text-white hover:bg-white/10 hover:text-white"><Link href="/login?next=/calendar">Log in</Link></Button>
            </div>
          </div>
        </div>
      </PageShell>
    );
  }

  const selectedRegion = SUPPORTED_REGIONS.find((r) => r.code === region) ?? SUPPORTED_REGIONS[0];

  return (
    <PageShell>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs font-bold uppercase tracking-widest text-givit-ember">Calendar</p>
          <h1 className="mt-2 text-4xl font-light tracking-tight text-givit-ink sm:text-5xl">Your gifting <span className="givit-gradient-text font-semibold">calendar</span></h1>
          <p className="mt-2 text-sm text-muted-foreground">Every date saved in <Link href="/people" className="text-givit-ember hover:underline">People</Link> plus regional public holidays.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Google Calendar Connect / Sync Button */}
          <GoogleCalendarConnect />
          {/* Custom Styled Region Picker */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowRegionPicker(!showRegionPicker)}
              aria-expanded={showRegionPicker}
              className="flex max-w-full items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-givit-ember/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-givit-ember cursor-pointer"
            >
              <Globe className="h-3.5 w-3.5 shrink-0 text-givit-ember" />
              <span className="text-muted-foreground font-medium">Region:</span>
              <span className="truncate">{selectedRegion.flag} {selectedRegion.name} ({selectedRegion.gmt})</span>
              <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${showRegionPicker ? "rotate-180 text-givit-ember" : ""}`} />
            </button>

            {showRegionPicker && (
              <div className="cal-pop absolute left-0 top-10 z-50 w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-card/95 p-1.5 shadow-2xl backdrop-blur-md sm:left-auto sm:right-0">
                <div className="max-h-72 overflow-y-auto pr-1 text-xs">
                  {SUPPORTED_REGIONS.map((r) => {
                    const isSelected = r.code === region;
                    return (
                      <button
                        key={r.code}
                        type="button"
                        onClick={() => {
                          setRegion(r.code);
                          setShowRegionPicker(false);
                        }}
                        className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-givit-ember ${
                          isSelected
                            ? "font-bold text-givit-ember"
                            : "font-medium text-foreground hover:bg-muted"
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <span>{r.flag}</span>
                          <span>{r.name}</span>
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="font-mono text-[10px] font-normal opacity-70">{r.gmt}</span>
                          {isSelected && <Check className="h-3.5 w-3.5 text-givit-ember" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <Button asChild variant="outline" className="rounded-full">
            <Link href="/people"><UserRound className="h-4 w-4" /> Manage people</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <AutoGiftCalendar recipients={recipients} scheduledKeys={scheduledKeys} region={region} />
        </div>

        <aside className="space-y-5">
          <div>
            <div className="flex items-baseline justify-between border-b border-border pb-3">
              <h2 className="font-mono text-xs font-bold uppercase tracking-widest text-givit-ink">Upcoming Dates</h2>
              <span className="text-xs font-medium text-muted-foreground">{selectedRegion.flag} {selectedRegion.name}</span>
            </div>

            {upcomingAll.length === 0 ? (
              <p className="pt-3 text-sm text-muted-foreground">No upcoming dates found.</p>
            ) : (
              <div className="divide-y divide-border/60">
                {upcomingAll.map((o, i) => {
                  const daysUntil = Math.ceil((o.parsed.getTime() - Date.now()) / 86400000);
                  const urgency = o.isHoliday
                    ? "text-givit-coral"
                    : daysUntil <= 14
                    ? "text-destructive"
                    : daysUntil <= 42
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-success";

                  const scheduled = !o.isHoliday && scheduledKeys.has(`${o.recipient}-${o.label}-${o.date}`);

                  return (
                    <div key={i} className="flex items-center gap-3 py-3">
                      {o.isHoliday ? (
                        <HolidayBeacon className="h-6 w-6 shrink-0 text-givit-coral" />
                      ) : (
                        <GiftNode className="h-6 w-6 shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 text-sm font-semibold tracking-tight text-foreground">
                          <span className="truncate">{o.recipient}</span>
                          {o.milestone && (
                            <span className="shrink-0 font-mono text-[10px] font-bold uppercase tracking-widest text-givit-ember">Turning {o.age}</span>
                          )}
                        </p>
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                          {o.isHoliday ? (
                            <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-givit-coral">Public Holiday</span>
                          ) : scheduled ? (
                            <><Bell className="h-3 w-3 text-givit-ember" /> Reminder scheduled</>
                          ) : (
                            "No reminder scheduled"
                          )}
                        </p>
                      </div>
                      <span className="shrink-0 text-right font-mono text-[11px] tabular-nums leading-tight">
                        <span className="block font-semibold text-foreground">{o.parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                        <span className={`block font-bold ${urgency}`}>{daysUntil}d</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <Button asChild className="w-full rounded-full bg-givit-ember text-white hover:bg-givit-ember-hover">
            <Link href="/concierge"><Bell className="h-4 w-4" /> Open AutoGift</Link>
          </Button>
        </aside>
      </div>
    </PageShell>
  );
}
