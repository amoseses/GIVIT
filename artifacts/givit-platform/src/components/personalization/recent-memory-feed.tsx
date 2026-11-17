import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Brain } from "lucide-react";
import { RibbonBow } from "@/components/ui/givit-glyphs";

import { useAuth } from "@/lib/auth/use-auth";
import { getGiftRecipients } from "@/lib/supabase/db";
import { PersonPortrait } from "@/components/personalization/person-portrait";

type MemoryEntry = {
  id: string;
  name: string;
  interests: string[];
  updatedAt: string;
  photoUrl: string | null;
};

function timeAgo(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Replaces a generic "trending products" rail on the dashboard — a
 * relationship-memory product should show its memory growing, not a
 * marketplace feed. Pulls whichever saved people were touched most
 * recently (real gift_recipients.updated_at, not a fabricated timeline)
 * and shows what GIVIT currently knows about them.
 */
export function RecentMemoryFeed() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<MemoryEntry[] | null>(null);

  useEffect(() => {
    if (!user) { setEntries(null); return; }
    let mounted = true;
    getGiftRecipients(user.id).then((rows: any[]) => {
      if (!mounted) return;
      const withInterests = rows
        .filter((r) => (r.interests ?? []).length > 0)
        .sort((a, b) => new Date(b.updated_at ?? b.created_at).getTime() - new Date(a.updated_at ?? a.created_at).getTime())
        .slice(0, 4)
        .map((r) => ({ id: r.id, name: r.name, interests: r.interests ?? [], updatedAt: r.updated_at ?? r.created_at, photoUrl: r.photo_url ?? null }));
      setEntries(withInterests);
    });
    return () => { mounted = false; };
  }, [user]);

  if (!user || !entries || entries.length === 0) return null;

  return (
    <section className="container py-8 md:py-12">
      <div className="mb-5">
        <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-givit-ember">Recently learned</p>
        <h2 className="mt-1 text-3xl font-light tracking-tight text-foreground md:text-4xl">Latest <span className="font-semibold">notes</span></h2>
      </div>
      {/* A divided list instead of a grid of bordered cards -- four
          near-identical boxes in a row reads as a dashboard template, and a
          feed of memories is more naturally a list than a grid anyway. */}
      <div className="stagger-children divide-y divide-border/40">
        {entries.map((entry) => (
          <div key={entry.id} className="slide-up flex items-start gap-4 py-4 opacity-0 first:pt-0 last:pb-0">
            <PersonPortrait recipientId={entry.id} name={entry.name} photoUrl={entry.photoUrl} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="text-base text-foreground">
                <span className="font-semibold">{entry.name}</span>
                <span className="text-muted-foreground"> · updated {timeAgo(entry.updatedAt)}</span>
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{entry.interests.slice(0, 5).join(" · ")}</p>
            </div>
            <Link href={`/gift?q=${encodeURIComponent(`Gift for ${entry.name}`)}`} className="shrink-0 self-center inline-flex items-center gap-1 text-sm font-semibold text-givit-ember hover:underline">
              <RibbonBow className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Find something</span>
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}
