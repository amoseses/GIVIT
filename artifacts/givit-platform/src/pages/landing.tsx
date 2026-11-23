import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowRight, Bell, ChevronDown, Gift, Heart, PackageCheck, ShieldCheck, UserRound } from "lucide-react";
import { RibbonBow } from "@/components/ui/givit-glyphs";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/use-auth";
import { GiftBox3D } from "@/components/ui/gift-box-3d";
import { GiftCosmos } from "@/components/ui/gift-cosmos";
import { useScrollProgress } from "@/lib/hooks/use-scroll-progress";
import { getMarketplaceProductBySlug } from "@/lib/data/marketplace";
import { formatMoney } from "@/lib/format";
import { Reveal } from "@/components/ui/reveal";
import { ScrollProgressRail, type RailSection } from "@/components/layout/scroll-progress-rail";
import { MembershipSection } from "@/components/personalization/membership-section";

// Sections on the progress rail, in page order. "membership" only exists
// on the page when that flag is on; the rail skips ids it can't find.
const RAIL_SECTIONS: RailSection[] = [
  { id: "top", label: "Start" },
  { id: "story", label: "How it works" },
  { id: "gifts", label: "Real gifts" },
  { id: "membership", label: "Membership" },
  { id: "begin", label: "Begin" },
];

const ROTATING_PROMPTS = [
  "wireless headphones under $100",
  "a coffee maker with free shipping",
  "the lowest price on a laptop",
  "a reliable air fryer under $75",
  "the same product across multiple retailers",
];

// Trimmed from 4 steps to 3 (and from 120vh to 90vh each, ~460vh down to
// ~270vh of scroll) after feedback that the story took too long to get
// through before even reaching an account -- same mechanic, shorter trip.
const STORY_STEPS = [
  {
    Icon: UserRound,
    title: "Tell us what you need",
    body: "Search by product, category, brand, or budget — or ask GIVIT to help narrow the options.",
  },
  {
    Icon: RibbonBow,
    title: "GIVIT compares retailers",
    body: "We bring listings together, compare prices and shipping, and surface the strongest value we can verify.",
  },
  {
    Icon: PackageCheck,
    title: "Choose the best value",
    body: "Review the listing, seller, condition, and delivery details, then complete checkout with the retailer.",
  },
];

// A pinned scroll narrative: the section is several viewport-heights tall,
// the inner content stays sticky at the top of the viewport the whole
// time, and scroll position (not a timer) drives which step is showing
// and how far the gift box has turned -- the section itself never moves,
// scrolling through it just advances the story, the same technique behind
// the "things morph as you scroll" feeling on sites like Convexia.
function StoryScroll() {
  const { ref, progress } = useScrollProgress<HTMLDivElement>();
  const activeStep = Math.min(STORY_STEPS.length - 1, Math.floor(progress * STORY_STEPS.length));
  const step = STORY_STEPS[activeStep]!;
  const Icon = step.Icon;
  // Just over one full turn across the whole (now shorter) section -- enough
  // motion to read as continuous without needing as much scroll distance.
  const rotationY = 8 + progress * 380;

  return (
    <section id="story" ref={ref} className="relative bg-black" style={{ height: `${STORY_STEPS.length * 90}vh` }}>
      <div className="sticky top-0 flex h-screen items-center overflow-hidden">
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-[480px] w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-givit-ember/6 blur-3xl" />
        <div className="container relative grid items-center gap-10 md:grid-cols-2 md:gap-16">
          <div className="order-2 flex min-h-[220px] flex-col justify-center text-center md:order-1 md:text-left">
            <div key={activeStep} className="slide-up mx-auto md:mx-0">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl givit-gradient md:mx-0">
                <Icon className="h-5 w-5 text-white" />
              </div>
              <p className="mt-4 text-xs font-bold uppercase tracking-widest text-givit-coral">
                Step {activeStep + 1} of {STORY_STEPS.length}
              </p>
              <h3 className="mt-2 text-4xl font-light leading-tight tracking-tight text-white md:text-5xl">{step.title}</h3>
              <p className="mx-auto mt-3 max-w-sm text-base leading-relaxed text-white/60 md:mx-0">{step.body}</p>
            </div>
          </div>
          <div className="order-1 flex items-center justify-center md:order-2">
            <GiftBox3D size={150} rotation={{ x: 8, y: rotationY }} glow={0.5 + progress * 0.5} />
          </div>
        </div>
        <div className="absolute bottom-10 left-1/2 flex -translate-x-1/2 gap-2">
          {STORY_STEPS.map((_, i) => (
            <div
              key={i}
              className="h-1.5 w-6 rounded-full transition-colors duration-300"
              style={{ backgroundColor: i === activeStep ? "var(--givit-ember)" : "rgba(255,255,255,0.15)" }}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

// A handful of real, in-stock catalog items with real retailer photos --
// the marketing page was previously 100% text/icons/animation with zero
// product proof, which read as "all AI talk, no actual gifts." This is
// deliberately small (4 cards, one row) rather than a full marketplace
// wall: just enough to prove the catalog is real before asking for an
// account, not a second product-browsing surface.
const SHOWCASE_SLUGS = ["sony-wh-1000xm5", "yeti-rambler-bottle", "manduka-pro-yoga-mat", "jacques-torres-chocolate"];

function ProductShowcase() {
  const products = SHOWCASE_SLUGS.map((slug) => getMarketplaceProductBySlug(slug)).filter((p): p is NonNullable<typeof p> => Boolean(p));
  if (products.length === 0) return null;

  return (
    <section id="gifts" className="relative bg-black px-6 py-24 text-center text-white">
      <Reveal variant="blur">
        <p className="text-xs font-bold uppercase tracking-widest text-givit-coral">Real products. Better prices.</p>
        <h2 className="mx-auto mt-3 max-w-2xl text-3xl font-light leading-tight tracking-tight md:text-5xl">
          Explore products and compare offers from <span className="font-semibold">real retailers.</span>
        </h2>
      </Reveal>
      <div className="mx-auto mt-12 grid max-w-4xl grid-cols-2 gap-4 md:grid-cols-4">
        {products.map((product, i) => {
          const image = product.images[0]?.storage_path;
          const price = product.sale_price_cents ?? product.price_cents;
          return (
            <Reveal key={product.slug} variant="blur" delayMs={i * 90}>
            <Link
              href={`/products/${product.slug}`}
              className="group block overflow-hidden rounded-2xl border border-white/10 bg-white/5 text-left transition hover:-translate-y-1 hover:border-white/25"
            >
              <div className="aspect-square overflow-hidden bg-white">
                <img
                  src={image}
                  alt={product.name}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              </div>
              <div className="p-3">
                <p className="line-clamp-1 text-sm font-semibold text-white">{product.name}</p>
                <p className="mt-1 text-sm font-bold text-givit-coral">{formatMoney(price)}</p>
              </div>
            </Link>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}

// Classic startup-site typewriter: types a phrase out, holds it, deletes it,
// then moves to the next. Driven by (text, deleting, phraseIndex) rather than
// a fixed-interval swap so the reveal itself reads as motion, not a slide.
function useTypingCycle(phrases: string[], typeMs = 34, deleteMs = 18, pauseMs = 1600) {
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [text, setText] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const phrase = phrases[phraseIndex];

    if (!deleting && text === phrase) {
      const t = setTimeout(() => setDeleting(true), pauseMs);
      return () => clearTimeout(t);
    }
    if (deleting && text === "") {
      setDeleting(false);
      setPhraseIndex((i) => (i + 1) % phrases.length);
      return;
    }
    const t = setTimeout(() => {
      setText(deleting ? phrase.slice(0, text.length - 1) : phrase.slice(0, text.length + 1));
    }, deleting ? deleteMs : typeMs);
    return () => clearTimeout(t);
  }, [text, deleting, phraseIndex, phrases, typeMs, deleteMs, pauseMs]);

  return text;
}

export default function LandingPage() {
  const { user, loading } = useAuth();
  const [, navigate] = useLocation();
  const typedPrompt = useTypingCycle(ROTATING_PROMPTS);

  function enterAsGuest() {
    navigate("/home");
  }

  if (loading) return null;

  return (
    <div className="bg-black">
    <ScrollProgressRail sections={RAIL_SECTIONS} />
    {/* The hero sits in its own rounded frame, inset from the edge of
        the window, with the ribbon cosmos turning slowly behind it. */}
    <div className="p-2 sm:p-3">
    <div id="top" data-cosmos-dark className="relative flex min-h-[calc(100vh-1rem)] rounded-[28px] border border-white/10 bg-[#0a0a0d] sm:min-h-[calc(100vh-1.5rem)] flex-col items-center justify-center overflow-hidden px-6 py-16 text-center text-white">
      <GiftCosmos intensity={0.6} centerY={0.56} scale={1.25} tilt={66} />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,#0a0a0d_78%)]" />

      <div className="slide-up mb-10 flex flex-col items-center gap-3" style={{ animationDelay: "0ms" }}>
        <div className="relative">
          <div className="animate-pulse-ring pointer-events-none absolute inset-0 rounded-2xl bg-givit-ember/15 blur-xl" />
          <img src="/Screenshot 2026-06-23 095149.png" alt="GIVIT" className="animate-float relative h-20 w-20 rounded-2xl object-cover shadow-2xl md:h-24 md:w-24" />
        </div>
        <span className="font-serif text-3xl font-bold tracking-tight">
          GIVIT
        </span>
      </div>

      <div className="slide-up relative max-w-2xl" style={{ animationDelay: "80ms" }}>
        <p className="eyebrow-dots mb-4 font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-givit-ember">Member-powered shopping & savings</p>
        {/* Large and light rather than heavy: at this size weight reads
            as shouting, so the emphasis is carried by one semibold phrase
            in the brand gradient instead of the whole line being bold. */}
        <h1 className="text-5xl font-light leading-[1.05] tracking-tight text-white/95 md:text-7xl">
          The best price, <span className="givit-gradient-text font-semibold">without the hunt.</span>
        </h1>
        <p className="mt-5 min-h-[3.5rem] text-lg text-white/70 md:min-h-[2.5rem]">
          Search once. GIVIT compares offers across retailers{" "}
          <span className="inline-block font-semibold text-white">
            {typedPrompt}
            <span className="animate-cursor-blink ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] bg-white/80 align-middle" />
          </span>
        </p>
      </div>

      <div className="slide-up mt-6 flex flex-wrap items-center justify-center gap-3" style={{ animationDelay: "160ms" }}>
        {user ? (
          <>
            <Button asChild className="h-12 rounded-md givit-gradient px-7 text-sm font-bold text-white shadow-lg givit-glow transition-transform hover:-translate-y-0.5 hover:brightness-110">
              <Link href="/home">
                Go to Dashboard <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-12 rounded-md border-white/25 bg-white/5 px-7 text-sm font-semibold text-white hover:bg-white/10">
              <Link href="/people">Your people</Link>
            </Button>
          </>
        ) : (
          <>
            <Button asChild className="h-12 rounded-md givit-gradient px-7 text-sm font-bold text-white shadow-lg givit-glow transition-transform hover:-translate-y-0.5 hover:brightness-110">
              <Link href="/signup?next=/home">
                Create free account <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-12 rounded-md border-white/25 bg-white/5 px-7 text-sm font-semibold text-white hover:bg-white/10">
              <Link href="/login?next=/home">Log in</Link>
            </Button>
          </>
        )}
      </div>

      {!user && (
        <button
          type="button"
          onClick={enterAsGuest}
          className="slide-up mt-6 text-sm font-medium text-white/50 underline-offset-4 transition hover:text-white/80 hover:underline"
          style={{ animationDelay: "220ms" }}
        >
          Browse products and prices →
        </button>
      )}

      <div className="slide-up mt-14 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-white/40" style={{ animationDelay: "260ms" }}>
        <span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Price-first product discovery</span>
        <span className="flex items-center gap-1.5"><Gift className="h-3.5 w-3.5" /> Compare listings across retailers</span>
        <span className="flex items-center gap-1.5"><Bell className="h-3.5 w-3.5" /> See price and shipping details before you buy</span>
      </div>

      {/* The hero is a full viewport tall, so the story section right
          below it is otherwise invisible until someone happens to scroll --
          this makes it explicit there's more, rather than the page reading
          as if it ends here. */}
      <div className="slide-up animate-float absolute bottom-6 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1 text-white/40" style={{ animationDelay: "320ms" }}>
        <span className="text-[11px] font-semibold uppercase tracking-widest">See how it works</span>
        <ChevronDown className="h-4 w-4" />
      </div>
    </div>

    </div>

    <StoryScroll />

    <ProductShowcase />

    <MembershipSection tone="dark" />

    <div id="begin" className="relative flex flex-col items-center gap-6 overflow-hidden bg-black px-6 py-32 text-center text-white">
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 animate-drift rounded-full bg-givit-ember/7 blur-3xl" />
      <Reveal variant="blur" className="relative">
        <h2 className="mx-auto max-w-2xl text-4xl font-light leading-tight tracking-tight md:text-6xl">
          Ready to give like you <span className="givit-gradient-text font-semibold">really know</span> them, for less?
        </h2>
      </Reveal>
      {user ? (
        <Button asChild className="h-12 rounded-md givit-gradient px-7 text-sm font-bold text-white shadow-lg givit-glow transition-transform hover:-translate-y-0.5 hover:brightness-110">
          <Link href="/home">Go to Dashboard <ArrowRight className="h-4 w-4" /></Link>
        </Button>
      ) : (
        <Button asChild className="h-12 rounded-md givit-gradient px-7 text-sm font-bold text-white shadow-lg givit-glow transition-transform hover:-translate-y-0.5 hover:brightness-110">
          <Link href="/signup?next=/home">Create free account <ArrowRight className="h-4 w-4" /></Link>
        </Button>
      )}
    </div>
    </div>
  );
}
