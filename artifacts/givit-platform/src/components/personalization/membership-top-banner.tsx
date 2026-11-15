import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Crown, X } from "lucide-react";

import { useAuth } from "@/lib/auth/use-auth";
import { MEMBERSHIP_ENABLED, MEMBERSHIP_TIERS } from "@/lib/credits/credits";

const DISMISS_KEY = "givit-membership-banner-dismissed";

// Site-wide, like UrgentOccasionBanner's -- mounted above the header in
// App.tsx so it's the first thing on every page, not buried in /account.
// Gated on MEMBERSHIP_ENABLED same as the account page's membership card:
// this whole component renders nothing at all until that flag is set, so
// shipping it doesn't by itself put a real price in front of real users.
export function MembershipTopBanner() {
  const { user, profile } = useAuth();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(window.localStorage.getItem(DISMISS_KEY) === "1");
  }, []);

  if (!MEMBERSHIP_ENABLED || dismissed) return null;
  // Already a member, or not signed in yet (nothing to upsell to a guest
  // who can't check out) -- same reasoning UrgentOccasionBanner uses.
  if (user && profile?.membership_status === "active") return null;

  const tier = MEMBERSHIP_TIERS[0];

  function dismiss() {
    window.localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }

  return (
    <div className="border-b border-givit-ember/20 bg-givit-ember/10">
      <div className="container flex flex-wrap items-center justify-center gap-x-3 gap-y-1 py-2 text-center">
        <p className="flex items-center gap-1.5 text-xs font-medium text-givit-ink sm:text-sm">
          <Crown className="h-3.5 w-3.5 shrink-0 text-givit-ember" />
          <span>
            <span className="font-semibold">{tier.label}</span> -- ${(tier.priceCents / 100).toFixed(2)}/mo for {tier.monthlyCredits} bonus credits every month.
          </span>
          <Link href="/account#credits" className="font-semibold text-givit-ember underline-offset-2 hover:underline">
            Join now
          </Link>
        </p>
        <button type="button" onClick={dismiss} aria-label="Dismiss" className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-black/5 hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
