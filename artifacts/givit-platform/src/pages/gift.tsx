import { GiftFinderChat } from "@/components/gift/gift-finder-chat";
import { useSearchParams } from "@/lib/hooks/use-search-params";
import { GiftCosmos } from "@/components/ui/gift-cosmos";
import { PageShell } from "@/components/layout/page-shell";

export default function GiftFinderPage() {
  const { get } = useSearchParams();
  const initialQuery = get("q");

  return (
    // PageShell instead of a custom bg-gradient wrapper -- that gradient
    // (givit-mist to givit-page) is near-opaque in dark mode and painted
    // right over the body's own dot-grid + soft color-wash background
    // every other page shows through, which is what read as "just black"
    // instead of matching everything else's textured look.
    <PageShell wide>
      {/* The same dark viewport as the Marketplace and landing heroes: a
          rounded near-black frame with the ribbon cosmos turning behind
          the headline. The chat itself stays on a calm surface below --
          a reading and typing area wants nothing moving behind the text. */}
      <section data-cosmos-dark className="relative mb-5 overflow-hidden rounded-[24px] border border-white/10 bg-[#0a0a0d] px-4 py-9 text-center text-white sm:mb-8 sm:rounded-[28px] sm:px-6 sm:py-12 md:py-16">
        <GiftCosmos intensity={0.55} centerY={0.62} scale={1.5} tilt={70} />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_20%,#0a0a0d_82%)]" />
        <div className="relative">
          <h1 className="text-4xl font-light leading-[1.05] tracking-tight md:text-6xl">
            Your <span className="givit-gradient-text font-semibold">Gift AI</span>
          </h1>
          <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-white/60">
            Tell GIVIT who you're shopping for and your budget. It finds tailored gift ideas, then checks eBay for the lowest matching second-hand price.
          </p>
          <div className="mx-auto mt-5 max-w-xl rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-left sm:px-5">
            <p className="text-sm font-semibold text-white">Free while we're testing</p>
            <p className="mt-1 text-xs leading-relaxed text-white/65">Planned membership: one flat $5/month for access to GIVIT's AI recommendations and lowest-price comparisons across connected stores. No membership charges or credits are active during beta.</p>
          </div>
        </div>
      </section>
      <GiftFinderChat initialQuery={initialQuery} />
    </PageShell>
  );
}
