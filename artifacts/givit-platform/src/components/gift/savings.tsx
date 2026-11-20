import { useAuth } from "@/lib/auth/use-auth";
import { MEMBERSHIP_ENABLED, isActiveMember } from "@/lib/credits/credits";

// "Found for X% less" is only ever computed from two prices we actually
// hold for the item (its list price and its current sale price) -- never
// a made-up comparison. No sale price, no tag.
export function savingsPercent(priceCents: number, salePriceCents?: number | null): number {
  if (!salePriceCents || !priceCents || salePriceCents >= priceCents) return 0;
  return Math.round((1 - salePriceCents / priceCents) * 100);
}

// Items that carry a real saving are the members' perk: free users get the
// tag and a blurred card, members see the product. Gated on
// MEMBERSHIP_ENABLED so nothing is locked until membership is switched on.
// This is a soft gate on the UI (the product page itself is public), which
// is fine for an upsell; it is not access control.
export function useMemberLock(hasSavings: boolean) {
  const { user, profile } = useAuth();
  const member = isActiveMember(profile?.membership_status);
  return { locked: MEMBERSHIP_ENABLED && hasSavings && !member, signedIn: Boolean(user) };
}

export function unlockHref(signedIn: boolean) {
  return signedIn ? "/account#membership" : "/signup?next=/account";
}

// Cheapest of a set of picks, by what you'd actually pay. Only meaningful
// with a few to compare, so it needs at least three.
export function lowestPriceId<T extends { id: string; price_cents: number; sale_price_cents?: number | null }>(results: T[]): string | null {
  if (results.length < 3) return null;
  let best = results[0]!;
  for (const r of results) {
    if ((r.sale_price_cents ?? r.price_cents) < (best.sale_price_cents ?? best.price_cents)) best = r;
  }
  return best.id;
}
