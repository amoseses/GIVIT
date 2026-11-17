import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { ArrowUpRight } from "lucide-react";

import { getAllMarketplaceProducts, type MarketplaceProduct } from "@/lib/data/marketplace";
import { formatMoney } from "@/lib/format";
import { productPhotoFallback, resolveProductImageSrc } from "@/lib/product-photo";
import { getTrendingProductClicks } from "@/lib/supabase/db";

const RAIL_SIZE = 14;
const MAX_REAL = 6;
const SCROLL_PX_PER_SECOND = 28;

// What "in season" means right now, by month. Each entry lists the
// occasion tags (the same ones the catalog's products carry) that count,
// strongest first -- a product tagged "christmas" outranks one that's only
// tagged the generic "holiday" every seed product gets by default.
function currentSeason(now = new Date()): { label: string; occasions: string[] } {
  const month = now.getMonth(); // 0 = January
  if (month === 10 || month === 11) return { label: "Holiday pick", occasions: ["christmas", "stocking stuffer", "holiday"] };
  if (month === 0 || month === 1) return { label: "Valentine's pick", occasions: ["valentine's day", "anniversary"] };
  if (month === 3 || month === 4) return { label: "Mother's Day pick", occasions: ["mother's day"] };
  if (month === 5) return { label: "Dads & grads pick", occasions: ["father's day", "graduation"] };
  return { label: "Seasonal pick", occasions: ["birthday", "thank you", "housewarming"] };
}

// Three kinds of card, and each one says which it is:
//  - "givit":  a catalog product with real clicks on GIVIT ("Trending here")
//  - "etsy":   a live Etsy listing, ranked by Etsy favourites ("Popular on Etsy")
//  - "season": an editorial seasonal pick, used only to fill the rail when
//              the two live sources come up short
type EtsyItem = { id: string; slug: string; title: string; priceCents: number; image: string; url: string; shop: string; favorites: number };
type RailItem =
  | { kind: "givit"; key: string; product: MarketplaceProduct }
  | { kind: "season"; key: string; product: MarketplaceProduct }
  | { kind: "etsy"; key: string; etsy: EtsyItem; internalSlug: string | null };

async function getEtsyTrending(): Promise<EtsyItem[]> {
  try {
    const res = await fetch("/api/metadata?action=trending");
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.items) ? data.items : [];
  } catch {
    return [];
  }
}

function buildRail(clicks: Map<string, number>, etsy: EtsyItem[]) {
  const season = currentSeason();
  const all = getAllMarketplaceProducts();
  const bySlug = new Set(all.map((p) => p.slug));

  const real = all
    .filter((p) => (clicks.get(p.slug) ?? 0) > 0)
    .sort((a, b) => (clicks.get(b.slug) ?? 0) - (clicks.get(a.slug) ?? 0))
    .slice(0, MAX_REAL);
  const taken = new Set(real.map((p) => p.slug));

  const etsyItems: RailItem[] = etsy
    .filter((e) => !taken.has(e.slug))
    .slice(0, RAIL_SIZE - real.length)
    // If the daily Etsy sync already brought this listing into the
    // catalog, open GIVIT's own page for it; otherwise go to Etsy.
    .map((e) => ({ kind: "etsy" as const, key: e.slug, etsy: e, internalSlug: bySlug.has(e.slug) ? e.slug : null }));
  for (const item of etsyItems) taken.add(item.key);

  const seasonRank = (p: MarketplaceProduct) => {
    const tags = (p.occasions ?? []).map((o) => o.toLowerCase());
    const index = season.occasions.findIndex((o) => tags.includes(o));
    return index === -1 ? Number.POSITIVE_INFINITY : index;
  };
  const room = Math.max(0, RAIL_SIZE - real.length - etsyItems.length);
  const filler = all
    .filter((p) => !taken.has(p.slug) && Number.isFinite(seasonRank(p)))
    .sort((a, b) => seasonRank(a) - seasonRank(b) || b.gift_match_score - a.gift_match_score)
    .slice(0, room);

  const items: RailItem[] = [
    ...real.map((product) => ({ kind: "givit" as const, key: product.slug, product })),
    ...etsyItems,
    ...filler.map((product) => ({ kind: "season" as const, key: product.slug, product })),
  ];
  return { items, season, realCount: real.length, etsyCount: etsyItems.length, fillerCount: filler.length };
}

function compactCount(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n);
}

// Cards are deliberately not boxes: a photo, a hairline, and type. The
// kind of pick is a small mono caption under the photo rather than a
// pill stuck on top of it, and the rank numeral is the only ornament.
function RailCard({ item, index, seasonLabel }: { item: RailItem; index: number; seasonLabel: string }) {
  const isEtsy = item.kind === "etsy";
  const product = isEtsy ? null : item.product;
  const [src, setSrc] = useState(() =>
    isEtsy ? item.etsy.image : resolveProductImageSrc(product!.id, product!.images, product!.category?.slug),
  );
  const name = isEtsy ? item.etsy.title : product!.name;
  const maker = isEtsy ? item.etsy.shop : product!.brand;
  const price = isEtsy ? item.etsy.priceCents : product!.sale_price_cents ?? product!.price_cents;
  const caption =
    item.kind === "givit" ? "Trending here"
    : item.kind === "etsy" ? (item.etsy.favorites > 0 ? `Etsy · ${compactCount(item.etsy.favorites)} favorites` : "Popular on Etsy")
    : seasonLabel;

  const body = (
    <>
      <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-neutral-100">
        <img
          src={src}
          alt={name}
          loading="lazy"
          draggable={false}
          onError={() => { if (product) setSrc(productPhotoFallback(product.id || product.slug, product.category?.slug)); }}
          className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
        />
        <span className="absolute bottom-2 left-2.5 font-mono text-[11px] font-bold tabular-nums text-white mix-blend-difference">
          {String(index + 1).padStart(2, "0")}
        </span>
        {isEtsy && !item.internalSlug && (
          <ArrowUpRight className="absolute right-2 top-2 h-4 w-4 text-white mix-blend-difference" aria-hidden="true" />
        )}
      </div>
      <p className={`mt-2.5 flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-widest ${item.kind === "givit" ? "text-givit-ember" : "text-muted-foreground"}`}>
        {item.kind === "givit" && <span className="tech-dot" />}
        {caption}
      </p>
      <p className="mt-1 line-clamp-1 text-sm font-medium text-foreground transition-colors group-hover:text-givit-ember">{name}</p>
      <p className="mt-0.5 flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
        <span className="line-clamp-1">{maker}</span>
        <span className="price-tag shrink-0 text-sm">{formatMoney(price)}</span>
      </p>
    </>
  );

  const className = "group block w-40 shrink-0 sm:w-48";
  if (isEtsy && !item.internalSlug) {
    return <a href={item.etsy.url} target="_blank" rel="noopener noreferrer" draggable={false} className={className}>{body}</a>;
  }
  return <Link href={`/products/${isEtsy ? item.internalSlug : product!.slug}`} draggable={false} className={className}>{body}</Link>;
}

// A slowly self-scrolling rail of what's hot right now, built from live
// signals and honest about each one:
//   1. products people have actually clicked on GIVIT (the same
//      get_trending_products RPC behind the Marketplace "Trending" sort);
//   2. what's popular on Etsy this season, fetched live through
//      /api/metadata?action=trending and ranked by Etsy favourites;
//   3. editorial seasonal picks, only when 1 and 2 don't fill the rail.
// Nothing is called "trending" without a real number behind it.
//
// The scroll is driven by scrollLeft on a real overflow container rather
// than a CSS marquee transform, so it can still be swiped or dragged by
// hand; it pauses while hovered, focused or touched, and never starts at
// all under prefers-reduced-motion.
export function TrendingRail({ className = "" }: { className?: string }) {
  const [clicks, setClicks] = useState<Map<string, number>>(new Map());
  const [etsy, setEtsy] = useState<EtsyItem[]>([]);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const dupRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void getTrendingProductClicks().then((m) => { if (!cancelled) setClicks(m); }).catch(() => undefined);
    void getEtsyTrending().then((items) => { if (!cancelled) setEtsy(items); });
    return () => { cancelled = true; };
  }, []);

  const { items, season, realCount, etsyCount, fillerCount } = useMemo(() => buildRail(clicks, etsy), [clicks, etsy]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || items.length === 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    let last = performance.now();
    // scrollLeft rounds to whole pixels in some browsers, so the true
    // position is tracked here and written out, not read back each frame.
    let position = el.scrollLeft;
    function tick(now: number) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      // The list is rendered twice. One "period" is the distance from the
      // first card of copy one to the first card of copy two -- measured,
      // not scrollWidth / 2, which is off by the container's padding.
      const first = el!.firstElementChild as HTMLElement | null;
      const period = first && dupRef.current ? dupRef.current.offsetLeft - first.offsetLeft : 0;
      if (pausedRef.current) {
        position = el!.scrollLeft; // pick up wherever a manual scroll left it
      } else if (period > el!.clientWidth / 2) {
        position += SCROLL_PX_PER_SECOND * dt;
        el!.scrollLeft = position;
      }
      // Once the first copy has fully scrolled past, jump back by exactly
      // one period -- the frame looks identical, so the loop never shows.
      if (period > 0 && el!.scrollLeft >= period) {
        position = el!.scrollLeft - period;
        el!.scrollLeft = position;
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [items.length]);

  if (items.length === 0) return null;

  const pause = () => { pausedRef.current = true; };
  const resume = () => { pausedRef.current = false; };

  const sources = [
    realCount > 0 ? "clicks on GIVIT" : null,
    etsyCount > 0 ? "live Etsy favorites" : null,
    fillerCount > 0 ? `our ${season.label.toLowerCase()}s` : null,
  ].filter(Boolean) as string[];
  const sourceLine = sources.length > 1 ? `${sources.slice(0, -1).join(", ")} and ${sources[sources.length - 1]}` : sources[0];

  return (
    <section className={`relative ${className}`} aria-label="Trending now">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-widest text-givit-ember">
            <span className="tech-dot" /> Live
          </p>
          <h2 className="mt-1 text-2xl font-light tracking-tight text-foreground md:text-3xl">
            Trending <span className="font-semibold">now</span>
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">Ranked from {sourceLine}.</p>
        </div>
        <Link href="/products?sort=trending" className="text-xs font-semibold text-givit-ember hover:underline">
          See all
        </Link>
      </div>
      {/* The one moving accent: a light travelling along a hairline. */}
      <div className="thinking-rule mb-5 h-px w-full" />

      <div
        ref={scrollerRef}
        className="trending-scroller scrollbar-none relative flex gap-4 overflow-x-auto pb-1"
        onMouseEnter={pause}
        onMouseLeave={resume}
        onFocusCapture={pause}
        onBlurCapture={resume}
        onTouchStart={pause}
        onTouchEnd={() => window.setTimeout(resume, 2500)}
      >
        {items.map((item, i) => (
          <RailCard key={item.key} item={item} index={i} seasonLabel={season.label} />
        ))}
        {/* Second copy for the seamless loop -- hidden from assistive tech
            and the tab order so nobody meets every product twice. */}
        <div ref={dupRef} className="flex shrink-0 gap-4" aria-hidden="true" inert>
          {items.map((item, i) => (
            <RailCard key={`dup-${item.key}`} item={item} index={i} seasonLabel={season.label} />
          ))}
        </div>
      </div>

      {etsyCount > 0 && (
        <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground/70">
          The term "Etsy" is a trademark of Etsy, Inc. This application uses the Etsy API but is not endorsed or certified by Etsy.
        </p>
      )}
    </section>
  );
}
