// Thin wrapper around the spend_credits / grant_credits / get_credit_status
// Postgres functions (the CREDITS block at the end of
// artifacts/givit-platform/src/lib/supabase/admin-schema.sql). All the real
// logic -- free-tier draw-down, atomic balance checks, ledger writes --
// lives in those SQL functions so a spend can never race itself; this
// file just calls them over PostgREST's /rpc/ endpoint with the
// service-role key, same as every other _lib module.
import { restFetch } from "./supabase-rest.mjs";

export async function getCreditStatus(userId) {
  const rows = await restFetch(`rpc/get_credit_status`, {
    method: "POST",
    body: JSON.stringify({ p_user_id: userId }),
  });
  // Postgres functions returning a single JSONB value come back as the
  // bare value itself (not wrapped in an array) via PostgREST's rpc call.
  return rows;
}

export async function hasGrantedForPaymentIntent(paymentIntentId) {
  if (!paymentIntentId) return false;
  const rows = await restFetch(`credit_transactions?stripe_payment_intent_id=eq.${encodeURIComponent(paymentIntentId)}&select=id&limit=1`);
  return Array.isArray(rows) && rows.length > 0;
}

export async function spendCredits(userId, amount, reason, referenceId) {
  const result = await restFetch(`rpc/spend_credits`, {
    method: "POST",
    body: JSON.stringify({ p_user_id: userId, p_amount: amount, p_reason: reason, p_reference_id: referenceId ?? null }),
  });
  return result;
}

export async function grantCredits(userId, amount, reason, stripePaymentIntentId) {
  const result = await restFetch(`rpc/grant_credits`, {
    method: "POST",
    body: JSON.stringify({ p_user_id: userId, p_amount: amount, p_reason: reason, p_stripe_payment_intent_id: stripePaymentIntentId ?? null }),
  });
  return result;
}

// ============================================================
// Credit pack purchases -- one-time Stripe Checkout charges, distinct
// from AutoGift's saved-card-for-later flow in api/stripe/setup-intent.ts.
// Prices/credit counts from credit-system-proposal.md §2.2; keep these
// two files in sync if pricing changes.
// ============================================================
export const CREDIT_PACKS = {
  starter: { credits: 20, amountCents: 599, label: "Starter" },
  standard: { credits: 45, amountCents: 1099, label: "Standard" },
};

function resolveAppUrl() {
  if (process.env.NEXT_PUBLIC_APP_URL?.trim()) return process.env.NEXT_PUBLIC_APP_URL.trim().replace(/\/+$/, "");
  if (process.env.VERCEL_URL?.trim()) return `https://${process.env.VERCEL_URL.trim()}`;
  return "http://localhost:3000";
}

export async function createCreditCheckoutSession(stripe, userId, userEmail, packId) {
  const pack = CREDIT_PACKS[packId];
  if (!pack) throw new Error(`Unknown credit pack: ${packId}`);

  const appUrl = resolveAppUrl();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: userEmail,
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: pack.amountCents,
          product_data: { name: `GIVIT Credits -- ${pack.label} pack (${pack.credits} credits)` },
        },
        quantity: 1,
      },
    ],
    success_url: `${appUrl}/account?credits_purchase=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/account?credits_purchase=cancelled`,
    metadata: { source: "givit_credit_pack", user_id: userId, pack_id: packId, credits: String(pack.credits) },
  });
  return session;
}

// Confirms a completed Checkout Session and grants the credits. Idempotent
// by design: grant_credits() only ever gets called once per
// payment_intent, because we check for an existing credit_transactions
// row with that stripe_payment_intent_id first -- so a user refreshing
// the success page, or the same session_id being confirmed twice for any
// reason, never double-grants. This confirm-on-return approach (rather
// than a webhook) matches how api/stripe/setup-intent.ts's charge flow
// already works in this codebase -- no webhook handler exists yet (see
// the note in credit-system-proposal.md); the known tradeoff is that a
// user who pays and closes the tab before hitting the success page won't
// get auto-granted until they revisit it. A real webhook handler would
// close that gap and is worth building once this pattern is validated.
export async function confirmCreditCheckoutSession(stripe, userId, sessionId, alreadyGrantedFn, grantFn) {
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.metadata?.user_id !== userId) {
    throw new Error("This checkout session doesn't belong to you.");
  }
  return grantCreditsForPaidSession(session, alreadyGrantedFn, grantFn);
}

// Shared by the success-page confirm above and the Stripe webhook
// (api/stripe/setup-intent.ts, ?action=stripe_webhook) -- whichever lands
// first grants; the other comes back alreadyGranted. Caller is responsible
// for having established the session is trustworthy (own-session check for
// confirm, signature verification for the webhook).
export async function grantCreditsForPaidSession(session, alreadyGrantedFn, grantFn) {
  const userId = session.metadata?.user_id;
  if (!userId) throw new Error("Session is missing a user id.");
  if (session.payment_status !== "paid") {
    return { ok: false, status: session.payment_status };
  }
  const already = await alreadyGrantedFn(session.payment_intent);
  if (already) {
    return { ok: true, alreadyGranted: true };
  }
  const credits = Number(session.metadata?.credits || 0);
  if (!credits) throw new Error("Session is missing a credits amount.");
  // grant_credits() is itself idempotent per payment intent (unique
  // index), so two confirms racing past the check above still can't
  // double-grant -- the loser just comes back alreadyGranted.
  const result = await grantFn(userId, credits, "pack_purchase", session.payment_intent);
  return { ok: true, alreadyGranted: Boolean(result?.alreadyGranted), balance: result?.balance, creditsGranted: result?.alreadyGranted ? 0 : credits };
}

// ============================================================
// MEMBERSHIP -- recurring subscription, additive to the one-time credit
// packs above. Deliberately reuses the SAME idempotent grant_credits()
// ledger for the monthly bonus (keyed on the Stripe invoice id, which
// credit_transactions.stripe_payment_intent_id is just a generic UNIQUE
// text column underneath, not actually payment-intent-specific) rather
// than inventing a second grant mechanism -- one ledger, one place a
// double-grant bug could hide, not two.
//
// $6.99/mo, 40 credits/mo -- $0.1748/credit, ~28% cheaper than the best
// one-time pack (Standard, $0.2442/credit), which is what actually makes
// "membership" a real discount worth joining for rather than a label on
// the same price. 40 credits covers 4 AutoGifts/month (10 credits each)
// on top of the 3 free ones/year, a genuinely useful amount for someone
// actively using it for several people. Credits cost GIVIT essentially
// nothing to grant (the real expense -- the gift itself -- is charged
// and fee'd separately at approval), so margin here is high at this
// price even after Stripe's cut. Still the one place to change the
// number if real usage says otherwise -- this isn't carved in stone.
// ============================================================
export const MEMBERSHIP_TIERS = {
  member: { id: "member", label: "GIVIT Member", amountCents: 699, monthlyCredits: 40 },
};

export async function createMembershipCheckoutSession(stripe, userId, userEmail, tierId) {
  const tier = MEMBERSHIP_TIERS[tierId];
  if (!tier) throw new Error(`Unknown membership tier: ${tierId}`);

  const appUrl = resolveAppUrl();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: userEmail,
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: tier.amountCents,
          recurring: { interval: "month" },
          product_data: { name: `${tier.label} -- ${tier.monthlyCredits} bonus credits/month` },
        },
        quantity: 1,
      },
    ],
    success_url: `${appUrl}/account?membership=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/account?membership=cancelled`,
    metadata: { source: "givit_membership", user_id: userId, tier_id: tierId },
  });
  return session;
}

// Mirrors a subscription's current state onto profiles -- called from
// customer.subscription.created/updated/deleted. Looked up by Stripe
// customer id (not user id) since that's all the webhook payload reliably
// carries for every one of those event types.
export async function syncMembershipFromSubscription(subscription) {
  const rows = await restFetch(`profiles?stripe_customer_id=eq.${encodeURIComponent(subscription.customer)}&select=id`);
  const userId = rows?.[0]?.id;
  if (!userId) {
    console.error("syncMembershipFromSubscription: no profile for Stripe customer", subscription.customer);
    return;
  }
  const tierId = subscription.metadata?.tier_id ?? (subscription.status === "canceled" ? null : "member");
  const active = subscription.status === "active" || subscription.status === "trialing";
  await restFetch(`profiles?id=eq.${userId}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      membership_tier: active ? tierId : null,
      membership_status: subscription.status,
      stripe_membership_subscription_id: subscription.id,
      membership_current_period_end: subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000).toISOString()
        : null,
    }),
  });
}

// Grants one month's bonus credits for a paid invoice -- covers both the
// first invoice (new subscription) and every renewal, since Stripe fires
// invoice.payment_succeeded for both. Idempotent the same way pack
// purchases are: grant_credits() rejects a repeat insert for an invoice
// id it's already seen.
export async function grantMembershipCreditsForInvoice(invoice) {
  const tierId = invoice.subscription_details?.metadata?.tier_id ?? invoice.lines?.data?.[0]?.metadata?.tier_id ?? "member";
  const tier = MEMBERSHIP_TIERS[tierId];
  if (!tier) {
    console.error("grantMembershipCreditsForInvoice: unknown tier", tierId);
    return;
  }
  const rows = await restFetch(`profiles?stripe_customer_id=eq.${encodeURIComponent(invoice.customer)}&select=id`);
  const userId = rows?.[0]?.id;
  if (!userId) {
    console.error("grantMembershipCreditsForInvoice: no profile for Stripe customer", invoice.customer);
    return;
  }
  await grantCredits(userId, tier.monthlyCredits, "membership_monthly", invoice.id);
}
