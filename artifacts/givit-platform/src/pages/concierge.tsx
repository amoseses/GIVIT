import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Bell, CalendarDays, Gift, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/layout/page-shell";
import { useAuth } from "@/lib/auth/use-auth";
import { useRecipients, nextOccurrenceDate, type ConciergeNotification } from "@/lib/hooks/use-recipients";
import { detectUserRegion } from "@/lib/data/holidays";
import { initials } from "@/lib/utils";
import { CountUp } from "@/components/ui/count-up";
import { AutoGiftOnboardingWizard } from "@/components/autogift/autogift-onboarding-wizard";
import { GiftSurveyModal } from "@/components/autogift/autogift-survey-modal";
import { AutoGiftCalendar } from "@/components/autogift/autogift-calendar";
import { RoundTableScene, type RoundTableStep } from "@/components/roundtable/round-table-scene";

// The walkthrough that opens the page. Every line restates something the
// page already says further down (see "How the agent works").
const AUTOGIFT_STEPS: RoundTableStep[] = [
  {
    highlight: "seats",
    title: "Your people, saved once",
    body: "Add people and their key dates in People. A reminder is set weeks ahead of each one.",
  },
  {
    highlight: "center",
    title: "A gift, with a reason",
    body: "The agent reasons through their profile and proposes what to give, with a reason for each pick.",
  },
  {
    highlight: "delivery",
    title: "Nothing ships until you approve",
    body: "You approve first. Only then is your saved card charged and the order fulfilled and shipped.",
  },
];

const HERO_OUTLINE_BUTTON = "rounded-full border-white/20 bg-white/5 px-5 text-white hover:bg-white/15 hover:text-white";

export default function ConciergePage() {
  const { user, profile, loading } = useAuth();
  const { recipients, notifications, activeNotifications, localReady, dismissNotification } = useRecipients(user, profile?.default_reminder_lead_days ?? undefined);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarPersonId, setCalendarPersonId] = useState<string | null>(null);
  // useAuth() re-validates the session (and flips loading back to true)
  // whenever the tab regains focus — without this, the full-page spinner
  // below would unmount the whole page, including an in-progress
  // AutoGiftOnboardingWizard, wiping its step/address/card/recipient state
  // back to the first slide every time someone switched tabs and came back.
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  useEffect(() => {
    if (!loading) setHasLoadedOnce(true);
  }, [loading]);
  const [surveyNotification, setSurveyNotification] = useState<ConciergeNotification | null>(null);
  const onboardingComplete = Boolean((profile as any)?.concierge_onboarding_completed) || window.localStorage.getItem("givit-autogift-onboarded") === "1";

  // Require onboarding before anyone can enter AutoGift automation.
  useEffect(() => {
    if (!localReady || loading) return;
    if (!user) {
      if (!window.localStorage.getItem("givit-autogift-onboarded")) setShowOnboarding(true);
      return;
    }
    if (!onboardingComplete) setShowOnboarding(true);
  }, [loading, user, localReady, onboardingComplete]);

  // nextOccurrenceDate, not new Date(o.date) directly -- birthdays are
  // stored with the recipient's real birth year, so a raw date comparison
  // reads every birthday as decades in the past and it never shows up here.
  const upcomingAll = recipients
    .flatMap((r) =>
      r.occasions.filter((o) => o.date).map((o) => ({ ...o, recipient: r.name, parsed: nextOccurrenceDate(o.date) }))
    )
    .sort((a, b) => a.parsed.getTime() - b.parsed.getTime())
    .slice(0, 8);

  // A reminder is already scheduled the moment the occasion is saved (see
  // useRecipients' generateNotifications), so "reminder set" is real status,
  // not decoration — this just surfaces it per item instead of only in the
  // separate notifications dropdown. Deliberately built from the FULL
  // notification list, not activeNotifications (unread-only) -- dismissing
  // the bell notification is just clearing a badge, it must not also flip
  // this "is a reminder scheduled" indicator back to "no" for an occasion
  // that's still genuinely scheduled.
  const scheduledKeys = new Set(notifications.map((n) => `${n.recipientName}-${n.occasion}-${n.date}`));

  const onAutoGift = recipients.filter((r) => r.automationEnabled !== false);
  const region = detectUserRegion();
  const calendarPerson = calendarPersonId ? recipients.find((r) => r.id === calendarPersonId) : null;

  if (loading && !hasLoadedOnce) {
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
        {showOnboarding && (
          <AutoGiftOnboardingWizard
            required={false}
            onClose={() => setShowOnboarding(false)}
          />
        )}
        <RoundTableScene
          seats={[]}
          steps={AUTOGIFT_STEPS}
          eyebrow="GIVIT AutoGift"
          title={<>Gifting on <span className="font-semibold givit-gradient-text">autopilot.</span></>}
          lede="Save your people once in People. AutoGift reminds you 5 to 6 weeks out, builds a personalized bundle, and only charges once you approve it."
        >
          <Button asChild className="rounded-full givit-gradient px-6 text-white hover:brightness-110"><Link href="/signup?next=/concierge">Create free account</Link></Button>
          <Button asChild variant="outline" className={HERO_OUTLINE_BUTTON}><Link href="/login?next=/concierge">Log in</Link></Button>
          <div className="flex w-full flex-col items-start gap-2 pt-1">
            <button type="button" onClick={() => setShowOnboarding(true)} className="text-left text-xs font-semibold text-white/50 underline-offset-4 hover:text-white/80 hover:underline">
              Just want a quick look first? Take the 60-second tour →
            </button>
            <a href="https://calendly.com/atticusmoes/new-meeting?month=2026-07" target="_blank" rel="noopener noreferrer" className="text-xs text-white/40 underline-offset-4 hover:text-white/70 hover:underline">
              Prefer to talk it through? Contact us
            </a>
          </div>
        </RoundTableScene>
      </PageShell>
    );
  }

  return (
    <PageShell>
      {showOnboarding && (
        <AutoGiftOnboardingWizard
          required={Boolean(user) || !window.localStorage.getItem("givit-autogift-onboarded")}
          onClose={() => {
            setShowOnboarding(false);
          }}
        />
      )}
      {surveyNotification && !showOnboarding && (
        <GiftSurveyModal
          recipientName={surveyNotification.recipientName}
          occasion={surveyNotification.occasion}
          occasionDate={surveyNotification.date}
          onClose={() => setSurveyNotification(null)}
        />
      )}

      {calendarPerson && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 backdrop-blur-sm sm:items-center" onClick={() => setCalendarPersonId(null)}>
          <div className="w-full max-w-md rounded-2xl bg-card p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border font-mono text-xs font-bold text-givit-ink">
                  {initials(calendarPerson.name)}
                </div>
                <p className="text-lg font-medium tracking-tight text-givit-ink">{calendarPerson.name}'s dates</p>
              </div>
              <button type="button" onClick={() => setCalendarPersonId(null)} aria-label="Close calendar" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <AutoGiftCalendar recipients={[calendarPerson]} scheduledKeys={scheduledKeys} region={region} />
          </div>
        </div>
      )}

      <RoundTableScene
        className="mb-8"
        seats={recipients.map((r) => ({ id: r.id, label: r.name }))}
        steps={AUTOGIFT_STEPS}
        eyebrow="GIVIT AutoGift"
        title={<>Your <span className="font-semibold givit-gradient-text">gifting agent</span></>}
        lede={
          <>Every date tracked in <Link href="/people" className="text-givit-ember hover:underline">People</Link>: the agent watches the calendar and reasons through what to give, you approve before anything ships.</>
        }
      >
        <Button asChild variant="outline" className={HERO_OUTLINE_BUTTON}>
          <Link href="/people"><UserRound className="h-4 w-4" /> Manage people</Link>
        </Button>
        <Button asChild variant="outline" className={HERO_OUTLINE_BUTTON}>
          <Link href="/gift"><Gift className="h-4 w-4" /> Find a gift now!</Link>
        </Button>
        <span className="font-mono text-xs font-bold uppercase tracking-widest text-white/50">
          <CountUp value={onAutoGift.length} className="font-mono text-white" /> on automation
        </span>
      </RoundTableScene>

      {activeNotifications.length > 0 && (
        <div className="mb-8 flex items-center justify-between gap-3 border-b border-border pb-4">
          <p className="text-xs font-bold uppercase tracking-widest text-givit-ember">
            {activeNotifications.length} {activeNotifications.length === 1 ? "reminder" : "reminders"} waiting
          </p>
          <div className="relative">
            <Button
              onClick={() => setShowNotifications(!showNotifications)}
              variant="outline"
              aria-label="Show AutoGift reminders"
              aria-expanded={showNotifications}
              className="rounded-full relative"
            >
              <Bell className="h-4 w-4" />
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-givit-ember text-[9px] font-bold text-white">
                {activeNotifications.length}
              </span>
            </Button>
            {showNotifications && (
              <div className="absolute right-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2.5rem)] rounded-xl border border-border bg-card shadow-2xl">
                <div className="border-b border-border p-3">
                  <p className="text-xs font-bold uppercase tracking-widest text-givit-ember">Notifications</p>
                </div>
                <div className="max-h-64 divide-y divide-border overflow-y-auto px-3">
                  {activeNotifications.map((n) => (
                    <div key={n.id} className="flex items-center gap-2 py-2.5 text-xs">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-foreground">{n.recipientName}'s {n.occasion}</p>
                        <p className="font-mono text-muted-foreground">{n.daysUntil} days away</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSurveyNotification(n)}
                        className="shrink-0 rounded-full bg-givit-ember px-3 py-1 font-semibold text-white hover:bg-givit-ember-hover"
                      >
                        Survey
                      </button>
                      <button
                        type="button"
                        onClick={() => dismissNotification(n.id)}
                        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label="Dismiss AutoGift reminder"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-x-12 gap-y-12 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div id="reminders" className="min-w-0 scroll-mt-40 space-y-12">
          {recipients.length === 0 ? (
            <div className="border-y border-border py-12">
              <p className="text-xs font-bold uppercase tracking-widest text-givit-ember">Nobody saved yet</p>
              <p className="mt-2 text-2xl font-light tracking-tight text-givit-ink sm:text-3xl">No one to <span className="font-semibold givit-gradient-text">remind you about</span> yet</p>
              <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">Add people and their dates in People. Reminders, calendar, and automation all live here once they're saved.</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button asChild className="rounded-full bg-givit-ember text-white hover:bg-givit-ember-hover">
                  <Link href="/people"><UserRound className="h-4 w-4" /> Go to People</Link>
                </Button>
                <Button onClick={() => setShowOnboarding(true)} variant="outline" className="rounded-full">
                  Retake onboarding tour
                </Button>
              </div>
            </div>
          ) : (
            <>
              <section>
                <div className="flex items-end justify-between gap-3 border-b border-border pb-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-givit-ember">Automation</p>
                    <h2 className="mt-1 text-2xl font-light tracking-tight text-givit-ink">People on <span className="font-semibold givit-gradient-text">AutoGift</span></h2>
                  </div>
                  <span className="shrink-0 font-mono text-xs font-bold uppercase tracking-widest text-success">{onAutoGift.length} active</span>
                </div>
                {onAutoGift.length === 0 ? (
                  <p className="pt-4 text-sm text-muted-foreground">
                    No one has AutoGift turned on yet. Enable it for a person on the <Link href="/people" className="text-givit-ember hover:underline">People</Link> page.
                  </p>
                ) : (
                  <ul className="grid gap-x-10 sm:grid-cols-2">
                    {onAutoGift.map((r) => {
                      const upcoming = r.occasions
                        .filter((o) => o.date)
                        .map((o) => ({ ...o, parsed: nextOccurrenceDate(o.date) }))
                        .sort((a, b) => a.parsed.getTime() - b.parsed.getTime())[0];
                      return (
                        <li key={r.id} className="group flex items-center gap-3 border-b border-border py-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border font-mono text-xs font-bold text-givit-ink transition-colors group-hover:border-givit-ember/60">
                            {initials(r.name)}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setSurveyNotification({
                                id: `build-${r.id}`,
                                recipientName: r.name,
                                occasion: upcoming?.label || "upcoming gift",
                                date: upcoming?.date || new Date(Date.now() + 35 * 86400000).toISOString().slice(0, 10),
                                daysUntil: upcoming ? Math.ceil((upcoming.parsed.getTime() - Date.now()) / 86400000) : 35,
                                dismissed: false,
                                createdAt: new Date().toISOString(),
                              })
                            }
                            className="min-w-0 flex-1 text-left"
                          >
                            <span className="block truncate text-sm font-semibold text-foreground">{r.name}</span>
                            <span className="block truncate text-xs font-medium text-givit-ember">
                              {upcoming ? `Build for ${upcoming.label}, ${upcoming.parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" })} →` : "Build their gift →"}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setCalendarPersonId(r.id)}
                            title={`${r.name}'s reminder dates`}
                            aria-label={`${r.name}'s reminder dates`}
                            className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition hover:bg-givit-sand hover:text-foreground"
                          >
                            <CalendarDays className="h-4 w-4" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              {upcomingAll.length > 0 && (
                <section>
                  <div className="flex items-end justify-between gap-3 border-b border-border pb-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-widest text-givit-ember">Calendar</p>
                      <h2 className="mt-1 text-2xl font-light tracking-tight text-givit-ink">Upcoming</h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowCalendar((v) => !v)}
                      className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-muted-foreground underline-offset-4 transition hover:text-givit-ember hover:underline"
                    >
                      <CalendarDays className="h-3.5 w-3.5" /> {showCalendar ? "Hide calendar" : "View calendar"}
                    </button>
                  </div>
                  <ul>
                    {upcomingAll.map((o, i) => {
                      const daysUntil = Math.ceil((o.parsed.getTime() - Date.now()) / 86400000);
                      const urgency = daysUntil <= 14 ? "text-destructive" : daysUntil <= 42 ? "text-amber-600" : "text-success";
                      const scheduled = scheduledKeys.has(`${o.recipient}-${o.label}-${o.date}`);
                      return (
                        <li key={i} className="flex items-center gap-4 border-b border-border py-3">
                          <span className="w-14 shrink-0 font-mono text-xs font-bold uppercase tracking-wider text-givit-ink">
                            {o.parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-foreground">{o.recipient} · {o.label}</p>
                            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                              {scheduled ? (
                                <><Bell className="h-3 w-3 text-givit-ember" /> Reminder scheduled</>
                              ) : (
                                "No reminder scheduled yet"
                              )}
                            </p>
                          </div>
                          <span className={`shrink-0 font-mono text-sm font-bold ${urgency}`}>{daysUntil}d</span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}

              {showCalendar && <AutoGiftCalendar recipients={recipients} scheduledKeys={scheduledKeys} region={region} />}
            </>
          )}
        </div>

        <aside className="min-w-0 lg:border-l lg:border-border lg:pl-8">
          <p className="text-xs font-bold uppercase tracking-widest text-givit-ember">The process</p>
          <h2 className="mt-1 text-2xl font-light tracking-tight text-givit-ink">How the agent works</h2>
          <ol className="mt-4 text-sm leading-6 text-muted-foreground">
            {[
              "Add people and their key dates in People",
              "35 days before, the agent emails the survey at 10:00 AM EST",
              "It reasons through the profile and proposes gifts, cards (+$5), flowers (+$25), and activities, with a reason for each",
              "You approve, then your saved card is charged and the order is fulfilled and shipped (fully autonomous purchasing is next)",
            ].map((text, i) => (
              <li key={i} className="flex gap-3 border-t border-border py-3">
                <span className="pt-0.5 font-mono text-xs font-bold text-givit-ember">{String(i + 1).padStart(2, "0")}</span>
                <span>{text}</span>
              </li>
            ))}
          </ol>
          <div className="border-t border-border pt-3">
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-givit-ink/80">Pricing</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">Calculated only after AI builds a tailored bundle. You approve before any charge.</p>
          </div>
        </aside>
      </div>
    </PageShell>
  );
}
