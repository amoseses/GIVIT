import { Link } from "wouter";
import { ArrowRight, Bell, Gift, Heart, PackageCheck, UserRound, Zap } from "lucide-react";
import { RibbonBow } from "@/components/ui/givit-glyphs";

import { PeopleDashboard } from "@/components/personalization/people-dashboard";
import { ProfileCompletionCard } from "@/components/personalization/profile-completion-card";
import { RecentMemoryFeed } from "@/components/personalization/recent-memory-feed";
import { RelationshipGraph } from "@/components/personalization/relationship-graph";
import { RelationshipInsights } from "@/components/personalization/relationship-insights";
import { WelcomeTour } from "@/components/personalization/welcome-tour";
import { Button } from "@/components/ui/button";
import { GiftBox3D } from "@/components/ui/gift-box-3d";
import { GiftCosmos } from "@/components/ui/gift-cosmos";
import { Reveal } from "@/components/ui/reveal";
import { TypewriterText } from "@/components/ui/typewriter-text";
import { useAuth } from "@/lib/auth/use-auth";
import { useScrollProgress } from "@/lib/hooks/use-scroll-progress";
import { TrendingRail } from "@/components/product/trending-rail";
import { MembershipSection } from "@/components/personalization/membership-section";

const HOW_IT_WORKS_STEPS = [
  { icon: RibbonBow, title: "Add someone, once", desc: "Name, interests, budget, dates to avoid — about 30 seconds." },
  { icon: Bell, title: "The agent watches the calendar", desc: "Reminders 5–6 weeks before every important date." },
  { icon: PackageCheck, title: "You approve, GIVIT handles it", desc: "Gift proposed with a reason, then ordered and shipped once you say go." },
];

// Same pinned-scroll technique as the landing page's story section, in the
// app's own light/card palette instead of the marketing page's black --
// scroll position through the section drives which step is active and how
// far the gift box has turned, rather than a static 3-up grid.
function HowItWorksScroll() {
  const { ref, progress } = useScrollProgress<HTMLDivElement>();
  const activeStep = Math.min(HOW_IT_WORKS_STEPS.length - 1, Math.floor(progress * HOW_IT_WORKS_STEPS.length));
  const step = HOW_IT_WORKS_STEPS[activeStep]!;
  const Icon = step.icon;
  const rotationY = 8 + progress * 460;

  return (
    <section ref={ref} className="relative border-y border-border/50 bg-givit-sand/40" style={{ height: `${HOW_IT_WORKS_STEPS.length * 110}vh` }}>
      <div className="sticky top-0 flex h-screen items-center overflow-hidden">
        <div className="container grid items-center gap-10 md:grid-cols-[1fr_auto]">
          <div className="order-2 flex min-h-[180px] flex-col items-center text-center md:order-1 md:items-start md:text-left">
            <div key={activeStep} className="slide-up">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-lg border border-border/40 bg-card shadow-sm md:mx-0">
                <Icon className="h-5 w-5 text-givit-ember" />
              </div>
              <p className="mt-4 text-xs font-bold uppercase tracking-widest text-givit-ember">
                Step {activeStep + 1} of {HOW_IT_WORKS_STEPS.length}
              </p>
              <h3 className="mt-1 text-3xl font-light leading-tight tracking-tight text-foreground md:text-4xl">{step.title}</h3>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground md:mx-0">{step.desc}</p>
            </div>
          </div>
          <div className="order-1 flex items-center justify-center md:order-2">
            <GiftBox3D size={110} rotation={{ x: 8, y: rotationY }} glow={0.3 + progress * 0.4} />
          </div>
        </div>
        <div className="absolute bottom-8 left-1/2 flex -translate-x-1/2 gap-2">
          {HOW_IT_WORKS_STEPS.map((_, i) => (
            <div
              key={i}
              className="h-1.5 w-6 rounded-full transition-colors duration-300"
              style={{ backgroundColor: i === activeStep ? "var(--givit-ember)" : "var(--border)" }}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

export default function HomePage() {
  const { user } = useAuth();
  return (
    <div className="pb-12">
      <WelcomeTour />
      {/* Hero — minimal, relationship-first, no product wall */}
      <section className="relative overflow-hidden border-b border-border/50 bg-card">
        <GiftCosmos intensity={0.5} centerX={0.5} centerY={0.6} scale={1.3} tilt={68} />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_25%,var(--card)_80%)]" />

        <div className="container relative py-16 md:py-24">
          <div className="slide-up mx-auto max-w-xl text-center" style={{ animationDelay: "0ms" }}>
            {/* A dark instrument viewport for the mark, not a plain icon on
                the page background -- the same charcoal used for the memory
                graph, so the hero's "AI core" and the graph's "AI core"
                read as one material, not two unrelated treatments. A
                gradient + top sheen + ember-tinted glow give it depth so it
                reads as a lit glass tile in light mode too, instead of a
                flat black square with nothing around it to blend into. */}
            <div className="pointer-events-none relative mx-auto mb-5 flex h-20 w-20 items-center justify-center overflow-hidden rounded-3xl bg-gradient-to-br from-[#232228] via-[#18171c] to-[#0a0a0d] shadow-lg shadow-givit-ember/20 ring-1 ring-white/10">
              <div className="absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-transparent" />
              {/* Sized down from the viewport and nudged a couple px lower --
                  the bow sits above the box's own bounding size via
                  translateZ, and as it spins that pushed it right up against
                  the top edge of this tile at the old size. */}
              <div className="mt-1.5">
                <GiftBox3D size={40} />
              </div>
            </div>
            <p className="mb-3 font-mono text-[10px] font-bold uppercase tracking-widest text-givit-ember">Member-powered shopping & savings</p>
            <h1 className="text-4xl font-light leading-[1.08] tracking-tight text-foreground md:text-6xl">
              Find the <span className="givit-gradient-text font-semibold">best price.</span>
            </h1>
            <p className="mt-4 text-base leading-7 text-muted-foreground">
              Search across products and retailer listings. GIVIT helps compare prices, shipping, and value before you buy.
            </p>

            <div className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
              <Button asChild className="h-12 rounded-full bg-foreground px-6 text-sm font-bold text-background hover:bg-foreground/90">
                <Link href="/people">
                  Shop Products <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Link href="/gift" className="inline-flex items-center gap-1.5 border-b border-transparent pb-0.5 text-sm font-semibold text-foreground transition hover:border-foreground/40">
                Browse deals <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* How it works — explains the mechanism before showing it in action below */}
      <HowItWorksScroll />

      {user && (
        <div className="container mt-6">
          <ProfileCompletionCard />
        </div>
      )}

      {/* People dashboard — the actual front door for returning, logged-in users */}
      <div id="tour-people">
        <PeopleDashboard />
      </div>

      {/* Visual map of who GIVIT remembers, right after the people it's about --
          a faint tint here (rather than the bare page background) is what
          actually separates it from the sections above and below; without
          it the whole run from the people grid through relationship
          intelligence reads as one undifferentiated scroll. */}
      <div id="tour-graph" className="bg-givit-sand/30">
        <RelationshipGraph />
      </div>

      {/* What GIVIT has learned recently — a real, growing memory feed, not a product rail */}
      <RecentMemoryFeed />

      {/* Relationship intelligence — what GIVIT knows and is doing for you, not a product rail */}
      <div className="bg-givit-sand/30">
        <RelationshipInsights />
      </div>

      {/* The one product rail on the dashboard, kept below everything
          about your own people: what's being clicked right now, topped up
          with seasonal picks and labelled as such (see TrendingRail). */}
      <Reveal variant="blur">
        <div className="container mt-10">
          <TrendingRail />
        </div>
      </Reveal>

      <MembershipSection />

      {/* Footer CTA -- deliberately not a card. This is the closing line of
          the page, not one more panel in a stack of panels, so it gets
          typed out rather than boxed in. */}
      <Reveal variant="blur">
        <section className="container mt-4 py-10 text-center md:py-14">
          <div className="mx-auto max-w-2xl">
            <h2 className="font-serif text-2xl font-bold text-foreground md:text-3xl">
              <TypewriterText text="Every AI conversation starts from zero. GIVIT starts with years of context." />
            </h2>
            <p className="mt-3 mb-6 text-sm leading-7 text-muted-foreground">
              {user
                ? "AutoGift reminds you early and handles fulfillment once you approve."
                : (
                  <><Link href="/login" className="givit-link underline">Sign in</Link> to let AutoGift remind you early and handle fulfillment once you approve.</>
                )}
            </p>
            {user ? (
              <Button asChild className="rounded-full bg-givit-ember px-5 text-white transition-transform hover:-translate-y-0.5 hover:bg-givit-ember-hover">
                <Link href="/concierge"><Zap className="h-4 w-4" /> Go to AutoGift</Link>
              </Button>
            ) : (
              <Button asChild className="rounded-full bg-givit-ember px-5 text-white transition-transform hover:-translate-y-0.5 hover:bg-givit-ember-hover">
                <Link href="/people"><Bell className="h-4 w-4" /> Add your first person</Link>
              </Button>
            )}
          </div>
        </section>
      </Reveal>
    </div>
  );
}
