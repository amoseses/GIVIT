import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { ArrowRight, PlusCircle, ShieldCheck } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/use-auth";
import { createSecretSantaGroup, listMySecretSantaGroups, type SecretSantaGroup } from "@/lib/supabase/secret-santa";
import { RoundTableScene, type RoundTableStep } from "@/components/roundtable/round-table-scene";

// The opening walkthrough: the real flow on this page and the group page.
// The "pairing" arcs on the table are a fixed decorative pattern, they
// never reflect an actual draw.
const SECRET_SANTA_STEPS: RoundTableStep[] = [
  { highlight: "center", title: "Start a group", body: "Name it, set a budget and an exchange date. It takes about 20 seconds." },
  { highlight: "seats", title: "Add everyone", body: "Each person needs a GIVIT account so their wishlist stays theirs to edit." },
  { highlight: "pairing", title: "Shuffle and reveal", body: "One click assigns everyone privately. Not even the organizer can see the full list." },
  { highlight: "delivery", title: "Everyone gets their person", body: "Each giver sees only the one name they drew, along with that person's wishlist." },
];

const HOW_IT_WORKS = SECRET_SANTA_STEPS.slice(0, 3);

const FIELD = "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-givit-ember/20";

export default function SecretSantaPage() {
  const { user, loading } = useAuth();
  const [, navigate] = useLocation();
  const [groups, setGroups] = useState<SecretSantaGroup[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [occasion, setOccasion] = useState("Secret Santa");
  const [budget, setBudget] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && !user) navigate("/login?next=/secret-santa");
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    // listMySecretSantaGroups() throws on any Supabase error (missing
    // table/RLS issue, network blip) -- with no .catch(), that rejection
    // was unhandled and `groups` stayed null forever, which is exactly
    // "stuck loading" from the caller's point of view since the loading
    // spinner below is keyed on `groups === null`.
    listMySecretSantaGroups()
      .then((rows) => { if (mounted) setGroups(rows); })
      .catch((err) => {
        console.error("Failed to load Secret Santa groups:", err);
        if (mounted) { setGroups([]); setLoadError("Couldn't load your groups. Refresh to try again."); }
      });
    return () => { mounted = false; };
  }, [user]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !name.trim() || creating) return;
    setCreating(true);
    setError("");
    const { data, error: err } = await createSecretSantaGroup({
      organizerId: user.id,
      name: name.trim(),
      occasion: occasion.trim() || undefined,
      budgetCents: budget ? Math.round(Number(budget) * 100) : undefined,
      eventDate: eventDate || undefined,
    });
    setCreating(false);
    if (err || !data) {
      console.error("Failed to create Secret Santa group:", err);
      setError("Couldn't create the group. Please try again.");
      return;
    }
    navigate(`/secret-santa/${data.id}`);
  }

  if (loading || !user) {
    return (
      <PageShell>
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-givit-ember border-t-transparent" />
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell wide>
      {/* The round table is the page's hero: Secret Santa is a group of
          people around one exchange, so that is what the page opens on. */}
      <RoundTableScene
        className="mb-10"
        seats={[]}
        steps={SECRET_SANTA_STEPS}
        eyebrow="GIVIT Group gifting"
        title={<>Secret <span className="font-semibold givit-gradient-text">Santa</span></>}
        lede="Create a group, everyone adds a wishlist, and we shuffle who gives to whom. It stays private, so not even the organizer can see the full list once it's drawn."
      >
        <Button onClick={() => setShowCreate((v) => !v)} aria-expanded={showCreate} className="h-11 rounded-full givit-gradient px-6 text-white hover:brightness-110">
          <PlusCircle className="h-4 w-4" /> New group
        </Button>
        <p className="flex items-center gap-1.5 text-xs font-medium text-white/50">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" /> Assignments are never readable by anyone but the giver
        </p>
      </RoundTableScene>

      {showCreate && (
        <form onSubmit={handleCreate} className="slide-up mb-12 border-y border-border py-8">
          <p className="text-xs font-bold uppercase tracking-widest text-givit-ember">New group</p>
          <h2 className="mt-1 text-2xl font-light tracking-tight text-givit-ink">Start a <span className="font-semibold givit-gradient-text">new group</span></h2>
          <div className="mt-5 grid max-w-2xl gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="ss-name" className="text-xs font-semibold text-muted-foreground">Group name</label>
              <input id="ss-name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Family Secret Santa 2026" className={FIELD} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="ss-occasion" className="text-xs font-semibold text-muted-foreground">Occasion</label>
              <input id="ss-occasion" value={occasion} onChange={(e) => setOccasion(e.target.value)} placeholder="Secret Santa" className={FIELD} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="ss-budget" className="text-xs font-semibold text-muted-foreground">Budget per person (optional)</label>
              <input id="ss-budget" value={budget} onChange={(e) => setBudget(e.target.value)} type="number" min="0" step="1" placeholder="$50" className={FIELD} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="ss-date" className="text-xs font-semibold text-muted-foreground">Exchange date (optional)</label>
              <input id="ss-date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} type="date" className={FIELD} />
            </div>
          </div>
          {error && <p className="mt-3 text-xs font-medium text-destructive">{error}</p>}
          <div className="mt-5 flex gap-2">
            <Button type="submit" disabled={creating || !name.trim()} className="rounded-full bg-givit-ember text-white hover:bg-givit-ember-hover">
              {creating ? "Creating..." : "Create group"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setShowCreate(false)} className="rounded-full">Cancel</Button>
          </div>
        </form>
      )}

      <div className="grid gap-x-12 gap-y-12 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="min-w-0">
          <div className="border-b border-border pb-3">
            <p className="text-xs font-bold uppercase tracking-widest text-givit-ember">Your exchanges</p>
            <h2 className="mt-1 text-2xl font-light tracking-tight text-givit-ink sm:text-3xl">Groups you're <span className="font-semibold givit-gradient-text">part of</span></h2>
          </div>

          {loadError && <p className="mt-4 text-sm font-medium text-destructive">{loadError}</p>}

          {groups === null ? (
            <div className="flex min-h-[160px] items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-4 border-givit-ember border-t-transparent" />
            </div>
          ) : groups.length === 0 ? (
            <div className="py-10">
              <p className="text-xl font-light tracking-tight text-givit-ink">No groups yet</p>
              <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">Start one for family, friends, or a team. Everyone needs a GIVIT account to be added.</p>
              <Button onClick={() => setShowCreate(true)} className="mt-5 rounded-full bg-givit-ember text-white hover:bg-givit-ember-hover">
                <PlusCircle className="h-4 w-4" /> Start your first group
              </Button>
            </div>
          ) : (
            <ul className="stagger-children">
              {groups.map((g) => (
                <li key={g.id} className="slide-up border-b border-border">
                  <Link href={`/secret-santa/${g.id}`} className="group flex items-center justify-between gap-4 py-4">
                    <div className="min-w-0">
                      <p className="truncate text-lg font-medium tracking-tight text-givit-ink transition-colors group-hover:text-givit-ember">{g.name}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {g.occasion || "Gift exchange"}
                        {g.budget_cents ? ` · $${(g.budget_cents / 100).toFixed(0)} budget` : ""}
                        {g.organizer_id === user.id ? " · You're organizing" : ""}
                      </p>
                    </div>
                    <span className="flex shrink-0 items-center gap-3">
                      <span className={`font-mono text-[11px] font-bold uppercase tracking-widest ${g.status === "shuffled" ? "text-success" : "text-amber-600"}`}>
                        {g.status === "shuffled" ? "Shuffled" : "Open"}
                      </span>
                      <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-givit-ember" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* How it works -- a first-time visitor to this page has no other
            context for what a "group" or "shuffle" even means here, and the
            walkthrough above only plays for a few seconds. */}
        <aside className="min-w-0 lg:border-l lg:border-border lg:pl-8">
          <p className="text-xs font-bold uppercase tracking-widest text-givit-ember">How it works</p>
          <ol className="mt-3">
            {HOW_IT_WORKS.map((step, i) => (
              <li key={step.title} className="flex gap-3 border-t border-border py-3">
                <span className="pt-0.5 font-mono text-xs font-bold text-givit-ember">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <p className="text-sm font-semibold text-givit-ink">{step.title}</p>
                  <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </PageShell>
  );
}
