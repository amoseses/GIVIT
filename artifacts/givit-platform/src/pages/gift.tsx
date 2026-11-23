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
      <section data-cosmos-dark className="relative mb-8 overflow-hidden rounded-[28px] border border-white/10 bg-[#0a0a0d] px-6 py-12 text-center text-white md:py-16">
        <GiftCosmos intensity={0.55} centerY={0.62} scale={1.5} tilt={70} />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_20%,#0a0a0d_82%)]" />
        <div className="relative">
          <h1 className="text-4xl font-light leading-[1.05] tracking-tight md:text-6xl">
            Your <span className="givit-gradient-text font-semibold">Gift AI</span>
          </h1>
          <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-white/60">
            Tell it who, what for, and how much. It reasons through the catalog and shows its work.
          </p>
        </div>
      </section>
      <GiftFinderChat initialQuery={initialQuery} />
    </PageShell>
  );
}
