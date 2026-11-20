import { useEffect, useState } from "react";
import { ExternalLink, LoaderCircle, ShoppingBag } from "lucide-react";

type EbayItem = {
  id: string;
  title: string;
  imageUrl: string | null;
  price: number;
  currency: string;
  shipping: number | null;
  total: number | null;
  condition: string | null;
  seller: string | null;
  sellerFeedback: string | null;
  url: string;
};

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value);
}

/** Live eBay results are shown alongside GIVIT's own curated catalog. */
export function EbaySearchResults({ query }: { query?: string }) {
  const [items, setItems] = useState<EbayItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const cleanQuery = query?.trim();
    if (!cleanQuery || cleanQuery.length < 2) {
      setItems([]);
      setMessage("");
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setMessage("");
    fetch(`/api/metadata?action=ebay_search&q=${encodeURIComponent(cleanQuery)}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "eBay search is unavailable.");
        return data;
      })
      .then((data) => {
        if (!controller.signal.aborted) {
          setItems(Array.isArray(data.items) ? data.items : []);
          setMessage("");
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setItems([]);
          setMessage(error instanceof Error ? error.message : "eBay search is unavailable.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [query]);

  if (!query?.trim()) return null;

  return (
    <section className="mb-8 rounded-3xl border border-givit-ember/20 bg-card p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-givit-ember">Live retailer prices</p>
          <h2 className="mt-1 flex items-center gap-2 text-xl font-semibold text-foreground">
            <ShoppingBag className="h-5 w-5" /> Compare on eBay
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">Fixed-price US listings, ordered by eBay's price sort.</p>
        </div>
        {loading ? <span className="inline-flex items-center gap-2 text-xs text-muted-foreground"><LoaderCircle className="h-4 w-4 animate-spin" /> Checking prices…</span> : null}
      </div>

      {message ? (
        <p className="rounded-xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">{message}</p>
      ) : !loading && items.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">No eBay listings found for this search.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item) => (
            <a key={item.id} href={item.url} target="_blank" rel="noopener noreferrer sponsored" className="group overflow-hidden rounded-2xl border border-border/60 bg-background transition hover:-translate-y-0.5 hover:border-givit-ember/40 hover:shadow-md">
              <div className="aspect-square overflow-hidden bg-muted">
                {item.imageUrl ? <img src={item.imageUrl} alt={item.title} loading="lazy" className="h-full w-full object-contain transition group-hover:scale-[1.03]" /> : <div className="flex h-full items-center justify-center text-xs text-muted-foreground">No image</div>}
              </div>
              <div className="p-3">
                <p className="line-clamp-2 min-h-10 text-xs font-semibold text-foreground">{item.title}</p>
                <p className="mt-2 text-lg font-bold text-givit-ember">{money(item.price, item.currency)}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {item.shipping === 0 ? "Free shipping" : item.shipping != null ? `Shipping ${money(item.shipping, item.currency)}` : "Shipping shown at eBay"}
                </p>
                {item.total != null ? <p className="mt-1 text-[11px] font-semibold text-foreground">Item + shipping: {money(item.total, item.currency)}</p> : null}
                <p className="mt-1 truncate text-[10px] text-muted-foreground">{[item.condition, item.seller ? `Seller: ${item.seller}` : null].filter(Boolean).join(" · ")}</p>
                <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-givit-ember">View on eBay <ExternalLink className="h-3 w-3" /></span>
              </div>
            </a>
          ))}
        </div>
      )}
      <p className="mt-4 text-[10px] leading-relaxed text-muted-foreground">Prices and availability can change. Purchases are completed on eBay. GIVIT may earn a commission on qualifying purchases.</p>
    </section>
  );
}
