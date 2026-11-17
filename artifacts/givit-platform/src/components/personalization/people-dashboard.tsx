import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Camera, Plus, UserRound } from "lucide-react";

import { PersonPortrait } from "@/components/personalization/person-portrait";
import { RibbonBow } from "@/components/ui/givit-glyphs";
import { toast } from "@/hooks/use-toast";
import { saveRecipientPhoto } from "@/lib/recipient-photos";

import { useAuth } from "@/lib/auth/use-auth";
import { getGiftRecipients } from "@/lib/supabase/db";
import { nextOccurrenceDate } from "@/lib/date-utils";

type Occasion = { label: string; date: string };
type Person = {
  id: string;
  name: string;
  relationship: string;
  interests: string[];
  avoidTerms: string[];
  budgetCents: number | null;
  occasions: Occasion[];
  photoUrl: string | null;
};

function nextOccasion(occasions: Occasion[]) {
  return occasions
    .filter((o) => o.date)
    .map((o) => ({ ...o, parsed: nextOccurrenceDate(o.date) }))
    .sort((a, b) => a.parsed.getTime() - b.parsed.getTime())[0];
}

function buildShopQuery(person: Person, occasion?: Occasion) {
  const parts = [`Gift for ${person.name}${person.relationship ? ` (${person.relationship})` : ""}`];
  if (occasion) parts.push(occasion.label.toLowerCase());
  if (person.budgetCents) parts.push(`budget ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(person.budgetCents / 100)}`);
  if (person.interests.length) parts.push(`loves ${person.interests.join(", ")}`);
  if (person.avoidTerms.length) parts.push(`avoid ${person.avoidTerms.join(", ")}`);
  return parts.join(", ");
}

// A profile, not a contact chip: the person's photo (or a monogram until
// there is one) leads, their name sits on it, and what GIVIT knows about
// them reads as plain type underneath instead of a stack of pills. The
// whole portrait opens Gift AI primed for them; the camera adds or
// replaces their photo.
function PersonCard({ person }: { person: Person }) {
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const upcoming = nextOccasion(person.occasions);
  const daysUntil = upcoming ? Math.ceil((upcoming.parsed.getTime() - Date.now()) / 86400000) : null;
  const soon = daysUntil != null && daysUntil <= 14;
  const shopHref = `/gift?q=${encodeURIComponent(buildShopQuery(person, upcoming))}`;

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user) return;
    setUploading(true);
    try {
      const { synced } = await saveRecipientPhoto(user.id, person.id, file);
      if (!synced) toast({ description: "Photo saved on this device. It will sync to your other devices once the database update has been applied." });
    } catch (err: any) {
      toast({ description: err?.message || "Couldn't upload that photo. Please try again." });
    } finally {
      setUploading(false);
    }
  }

  return (
    <article className="slide-up group opacity-0">
      <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-neutral-950">
        <Link href={shopHref} aria-label={`Find a gift for ${person.name}`} className="absolute inset-0 block outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-givit-ember">
          <PersonPortrait recipientId={person.id} name={person.name} photoUrl={person.photoUrl} size="fill" className="transition-transform duration-700 ease-out group-hover:scale-[1.04]" />
          <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent" />
          <span className="pointer-events-none absolute inset-x-0 bottom-0 p-4">
            <span className="block truncate text-2xl font-light tracking-tight text-white">{person.name}</span>
            {person.relationship && <span className="mt-0.5 block text-xs text-white/60">{person.relationship}</span>}
          </span>
        </Link>
        {upcoming && daysUntil != null && (
          <span className={`pointer-events-none absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-widest backdrop-blur-sm ${soon ? "text-givit-ember" : "text-white/80"}`}>
            {soon && <span className="tech-dot" />}
            {upcoming.label} · {daysUntil === 0 ? "today" : `${daysUntil}d`}
          </span>
        )}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          aria-label={`Add or change ${person.name}'s photo`}
          title="Add or change photo"
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white/80 opacity-0 backdrop-blur-sm transition hover:text-white focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
        >
          {uploading ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Camera className="h-3.5 w-3.5" />}
        </button>
        <input ref={inputRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
      </div>

      <p className="mt-3 line-clamp-1 text-sm text-muted-foreground">
        {person.interests.length > 0 ? person.interests.slice(0, 3).join(" · ") : "Nothing learned yet"}
      </p>
      <div className="mt-1.5 flex items-center justify-between gap-2 text-sm">
        <Link href={shopHref} className="inline-flex items-center gap-1.5 font-semibold text-givit-ember hover:underline">
          <RibbonBow className="h-4 w-4" /> Find a gift
        </Link>
        {person.budgetCents ? <span className="font-mono text-xs tabular-nums text-muted-foreground">~${Math.round(person.budgetCents / 100)}</span> : null}
      </div>
    </article>
  );
}

/**
 * The homepage's front door for logged-in users with saved people — leads
 * with who you're shopping for, not a product grid. Reuses the same
 * gift_recipients + gift_occasions data AutoGift already collects, so this
 * is a second read of an existing "memory," not a new subsystem.
 */
export function PeopleDashboard() {
  const { user } = useAuth();
  const [people, setPeople] = useState<Person[] | null>(null);

  useEffect(() => {
    if (!user) { setPeople(null); return; }
    let mounted = true;
    getGiftRecipients(user.id).then((rows: any[]) => {
      if (!mounted) return;
      setPeople(rows.map((row) => ({
        id: row.id,
        name: row.name,
        relationship: row.relationship || "",
        interests: row.interests ?? [],
        avoidTerms: row.avoid_terms ?? [],
        budgetCents: row.default_budget_cents ?? null,
        photoUrl: row.photo_url ?? null,
        occasions: (row.gift_occasions ?? []).map((occ: any) => ({ label: occ.occasion, date: occ.occasion_date })),
      })));
    });
    return () => { mounted = false; };
  }, [user]);

  if (!user || people === null) return null;

  return (
    <section className="container py-10">
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-givit-ember">Your people</p>
          <h2 className="mt-1 text-3xl font-light tracking-tight text-givit-ink md:text-4xl">
            {people.length > 0 ? <>{people.length} {people.length === 1 ? "person" : "people"} <span className="font-semibold">remembered</span></> : "Add the people you shop for"}
          </h2>
        </div>
        {people.length > 0 && <Link href="/people" className="givit-link shrink-0 text-sm font-medium">Manage all →</Link>}
      </div>

      {people.length === 0 ? (
        <Link
          href="/people"
          className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-border py-12 text-center transition hover:border-givit-ember/40 hover:bg-givit-sand/40"
        >
          <UserRound className="h-8 w-8 text-givit-ember" />
          <p className="font-semibold text-givit-ink">Add your first person</p>
          <p className="max-w-sm text-sm text-muted-foreground">Name, relationship, interests, and a budget: about 30 seconds. Your Gift AI remembers them from then on.</p>
        </Link>
      ) : (
        <div className="stagger-children grid grid-cols-2 gap-x-5 gap-y-8 md:grid-cols-3 lg:grid-cols-4">
          {people.map((p) => <PersonCard key={p.id} person={p} />)}
          <Link
            href="/people"
            className="flex aspect-[4/5] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border text-center text-muted-foreground transition hover:border-givit-ember/50 hover:text-givit-ember"
          >
            <Plus className="h-5 w-5" />
            <span className="font-mono text-[10px] font-bold uppercase tracking-widest">Add person</span>
          </Link>
        </div>
      )}
    </section>
  );
}
