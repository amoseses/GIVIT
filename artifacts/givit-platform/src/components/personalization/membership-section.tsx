import { Link } from "wouter";
import { ArrowRight, Check, Crown } from "lucide-react";

import { Reveal } from "@/components/ui/reveal";
import { useAuth } from "@/lib/auth/use-auth";
import { MEMBERSHIP_ENABLED, MEMBERSHIP_PERKS, MEMBERSHIP_PRICE_LABEL, MEMBERSHIP_TIERS, isActiveMember } from "@/lib/credits/credits";

// The membership pitch as a full section, for the landing page ("dark",
// on its black canvas) and the dashboard ("app", in the normal light/dark
// card palette). Same gate as every other membership surface: renders
// nothing until VITE_ENABLE_MEMBERSHIP is on, and nothing for someone
// who's already a member -- they don't need selling to.
//
// Every number shown comes from credits.ts (price, credits, the derived
// savings percent), so this can't drift from what Stripe actually charges.
export function MembershipSection({ tone = "app" }: { tone?: "dark" | "app" }) {
  const { user, profile } = useAuth();
  if (!MEMBERSHIP_ENABLED) return null;
  if (isActiveMember(profile?.membership_status)) return null;

  const tier = MEMBERSHIP_TIERS[0];
  const dark = tone === "dark";
  // A guest can't check out, so they go through signup first and land on
  // the membership card afterwards.
  const href = user ? "/account#membership" : "/signup?next=/account";

  return (
    <section id="membership" className={dark ? "relative bg-black px-6 py-24 text-white" : "container py-10 md:py-14"}>
      <Reveal variant="blur">
        <div
          id="tour-membership"
          className={`relative mx-auto grid max-w-4xl items-center gap-8 overflow-hidden rounded-3xl p-7 md:grid-cols-[1.1fr_1fr] md:p-10 ${
            dark ? "border border-white/10 bg-white/[0.04]" : "border border-givit-ember/25 bg-card shadow-lg shadow-givit-ember/10"
          }`}
        >
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 animate-drift rounded-full bg-givit-ember/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-28 -left-20 h-64 w-64 animate-drift-slow rounded-full bg-givit-coral/15 blur-3xl" />

          <div className="relative">
            <p className={`flex items-center gap-2 text-xs font-bold uppercase tracking-widest ${dark ? "text-givit-coral" : "text-givit-ember"}`}>
              <Crown className="h-3.5 w-3.5" /> {tier.label}
            </p>
            <h2 className={`mt-3 text-3xl font-light leading-tight tracking-tight md:text-4xl ${dark ? "text-white" : "text-foreground"}`}>
              Gifting on autopilot, <span className="givit-gradient-text font-semibold">for less.</span>
            </h2>
            <p className={`mt-3 max-w-sm text-sm leading-relaxed ${dark ? "text-white/60" : "text-muted-foreground"}`}>
              Your Gift AI stays free. Membership is for AutoGift: credits arrive every month, so the gifts you approve just go out.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <Link
                href={href}
                className="inline-flex h-11 items-center gap-2 rounded-full givit-gradient px-6 text-sm font-bold text-white givit-glow transition-transform hover:-translate-y-0.5 hover:brightness-110"
              >
                Become a Member <ArrowRight className="h-4 w-4" />
              </Link>
              <p className={`text-sm ${dark ? "text-white/70" : "text-foreground"}`}>
                <span className="text-2xl font-semibold">{MEMBERSHIP_PRICE_LABEL}</span>
                <span className={dark ? "text-white/50" : "text-muted-foreground"}> / month</span>
              </p>
            </div>
          </div>

          <ul className="relative space-y-3">
            {MEMBERSHIP_PERKS.map((perk) => (
              <li key={perk} className={`flex items-start gap-3 text-sm ${dark ? "text-white/80" : "text-foreground"}`}>
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-givit-ember/15 text-givit-ember">
                  <Check className="h-3 w-3" />
                </span>
                {perk}
              </li>
            ))}
          </ul>
        </div>
      </Reveal>
    </section>
  );
}
