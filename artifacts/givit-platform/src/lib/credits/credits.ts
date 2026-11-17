// Client-side wrapper around the credits endpoints branched onto
// /api/metadata (see api/metadata.ts for why they live there, not at
// their own path -- Vercel Hobby-plan 12-function cap).
import { createClient } from "@/lib/supabase/client";

export type CreditStatus = {
  balance: number;
  freeAutogiftRemaining: number;
  freeAutogiftLimit: number;
  freeAiRemaining: number;
  freeAiLimit: number;
  membershipTier?: string | null;
  membershipStatus?: string | null;
};

// "unavailable" = we couldn't reach/verify the ledger at all (network,
// server misconfig, signed out) -- distinct from a real empty balance so
// the UI doesn't tell someone with credits that they're out.
export type SpendResult =
  | { ok: true; usedFree: boolean; balance: number }
  | { ok: false; usedFree: false; balance: number; error: "insufficient_credits" | "unavailable" };

// Display copy for the packs; prices/credit counts are authoritative in
// CREDIT_PACKS in server/api-lib/credits.mjs -- keep the two in sync.
export const CREDIT_PACKS = [
  { id: "starter", label: "Starter", credits: 20, priceCents: 599 },
  { id: "standard", label: "Standard", credits: 45, priceCents: 1099 },
] as const;
export type CreditPackId = (typeof CREDIT_PACKS)[number]["id"];

// Display copy for membership; authoritative pricing lives in
// MEMBERSHIP_TIERS in server/api-lib/credits.mjs -- keep in sync.
// $6.99/mo for 40 credits, ~28% cheaper per credit than the best
// one-time pack -- see that file's comment for the full reasoning.
export const MEMBERSHIP_TIERS = [
  { id: "member", label: "GIVIT Member", priceCents: 699, monthlyCredits: 40 },
] as const;
export type MembershipTierId = (typeof MEMBERSHIP_TIERS)[number]["id"];
// Still behind VITE_ENABLE_MEMBERSHIP=true: the checkout/sync backend is
// fixed, but the account page doesn't yet call syncMembership() when
// Checkout redirects back, and no real subscription has been run end to
// end. Turn it on only after both.
export const MEMBERSHIP_ENABLED = import.meta.env.VITE_ENABLE_MEMBERSHIP === "true";
export const MEMBERSHIP_PRICE_LABEL = `$${(MEMBERSHIP_TIERS[0].priceCents / 100).toFixed(2)}`;
// What the same credits cost bought as the best one-time pack -- the
// honest basis for the "save N%" line, derived rather than hard-coded so
// it can't drift from the real prices above.
const bestPack = CREDIT_PACKS.reduce<(typeof CREDIT_PACKS)[number]>((a, b) => (a.priceCents / a.credits <= b.priceCents / b.credits ? a : b), CREDIT_PACKS[0]);
export const MEMBERSHIP_SAVINGS_PERCENT = Math.round(
  (1 - MEMBERSHIP_TIERS[0].priceCents / MEMBERSHIP_TIERS[0].monthlyCredits / (bestPack.priceCents / bestPack.credits)) * 100,
);
export const MEMBERSHIP_PERKS = [
  `${MEMBERSHIP_TIERS[0].monthlyCredits} credits every month, added automatically`,
  `About ${Math.floor(MEMBERSHIP_TIERS[0].monthlyCredits / 10)} AutoGifts a month, handled end to end`,
  `${MEMBERSHIP_SAVINGS_PERCENT}% cheaper per credit than buying packs`,
  "Cancel any time, and credits you have stay yours",
] as const;
export function isActiveMember(status: string | null | undefined) {
  return status === "active" || status === "trialing";
}

// Fired after anything that changes the balance (a spend, a purchase) so
// the header badge can refetch instead of showing a stale number until
// the next full page load.
export const CREDITS_CHANGED_EVENT = "givit:credits-changed";
function notifyCreditsChanged() {
  window.dispatchEvent(new Event(CREDITS_CHANGED_EVENT));
}

// getUserFromRequest (server/api-lib/auth.mjs) reads the caller's identity
// from an Authorization: Bearer <token> header -- it does NOT read
// cookies. A plain fetch() with no headers always comes back 401, which
// is why the credit badge looked "broken" (silently returned null) even
// once it started actually making the request. Mirrors authedFetch() in
// autogift-onboarding-wizard.tsx.
async function authedFetch(path: string, init?: RequestInit) {
  const { data } = await createClient().auth.getSession();
  const token = data.session?.access_token;
  if (!token) return null;
  return fetch(path, {
    ...init,
    headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
}

export async function getCreditStatus(): Promise<CreditStatus | null> {
  try {
    const res = await authedFetch("/api/metadata?action=credits");
    if (!res || !res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Spends a credit for a metered action. Call this BEFORE running the
// actual action (sending the AI message, running the match, placing the
// order) -- never after, so a user never gets charged for something that
// then fails, and never gets the AI output for free because the spend
// check happened too late.
export async function spendCredit(reason: "gift_ai_chat" | "secret_santa_match" | "autogift_purchase", amount: number, referenceId?: string): Promise<SpendResult> {
  try {
    const res = await authedFetch("/api/metadata?action=credits_spend", {
      method: "POST",
      body: JSON.stringify({ amount, reason, referenceId }),
    });
    if (!res) {
      return { ok: false, usedFree: false, balance: 0, error: "unavailable" };
    }
    const data = await res.json().catch(() => null);
    // Only a 402 means "really out of credits"; a 500 means the ledger
    // itself failed, which the user can't fix by buying more.
    if (res.status === 402) {
      return { ok: false, usedFree: false, balance: data?.balance ?? 0, error: "insufficient_credits" };
    }
    if (!res.ok || !data?.ok) {
      return { ok: false, usedFree: false, balance: data?.balance ?? 0, error: "unavailable" };
    }
    notifyCreditsChanged();
    return data;
  } catch {
    // Network failure: fail closed (block the action) rather than silently
    // letting a metered feature run for free.
    return { ok: false, usedFree: false, balance: 0, error: "unavailable" };
  }
}

// Sends the browser to Stripe's hosted Checkout. Resolves with an error
// message only if it couldn't get there.
export async function startCreditCheckout(packId: CreditPackId): Promise<string | null> {
  try {
    const res = await authedFetch("/api/metadata?action=credits_checkout", {
      method: "POST",
      body: JSON.stringify({ packId }),
    });
    if (!res) return "Sign in to buy credits.";
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.url) return data?.error || "Couldn't start checkout -- try again.";
    window.location.assign(data.url);
    return null;
  } catch {
    return "Couldn't start checkout -- check your connection and try again.";
  }
}

// Membership goes through api/stripe/setup-intent.ts (a different
// endpoint than credit packs), since that's where the rest of the Stripe
// subscription/webhook plumbing already lives.
export async function startMembershipCheckout(tierId: MembershipTierId): Promise<string | null> {
  try {
    // Tier travels in the query string: that function runs with body
    // parsing off (Stripe webhook signatures need the raw bytes), so a
    // JSON body is never read there.
    const res = await authedFetch(`/api/stripe/setup-intent?action=membership_checkout&tier=${encodeURIComponent(tierId)}`, { method: "POST" });
    if (!res) return "Sign in to become a member.";
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.url) return data?.error || "Couldn't start membership checkout -- try again.";
    window.location.assign(data.url);
    return null;
  } catch {
    return "Couldn't start membership checkout -- check your connection and try again.";
  }
}

// Asks the server to re-read this user's subscription from Stripe and
// apply it (status + any monthly credits not yet granted). Used when
// Checkout redirects back, so membership activates even if the webhook
// is slow or was never subscribed to those events.
export async function syncMembership(): Promise<{ status: string | null; tier: string | null } | null> {
  try {
    const res = await authedFetch("/api/stripe/setup-intent?action=membership_sync", { method: "POST" });
    if (!res || !res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!data?.ok) return null;
    notifyCreditsChanged();
    return { status: data.status ?? null, tier: data.tier ?? null };
  } catch {
    return null;
  }
}

export type ConfirmPurchaseResult =
  | { ok: true; alreadyGranted: boolean; creditsGranted?: number; balance?: number }
  | { ok: false; status?: string; error?: string };

export async function confirmCreditPurchase(sessionId: string): Promise<ConfirmPurchaseResult> {
  try {
    const res = await authedFetch("/api/metadata?action=credits_confirm", {
      method: "POST",
      body: JSON.stringify({ sessionId }),
    });
    if (!res) return { ok: false, error: "Sign in to finish your purchase." };
    const data = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, error: data?.error };
    if (data?.ok) notifyCreditsChanged();
    return data;
  } catch {
    return { ok: false, error: "Couldn't confirm that purchase -- refresh to try again." };
  }
}
