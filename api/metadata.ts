/// <reference path="./mjs-modules.d.ts" />
import { fetchPageMetadata } from "../server/api-lib/metadata.mjs";
import { syncEtsyProducts, fetchEtsyTrending } from "../server/api-lib/etsy.mjs";
import { getUserFromRequest } from "../server/api-lib/auth.mjs";
import { restFetch } from "../server/api-lib/supabase-rest.mjs";
import { getCreditStatus, spendCredits, grantCredits, hasGrantedForPaymentIntent, createCreditCheckoutSession, confirmCreditCheckoutSession, CREDIT_PACKS } from "../server/api-lib/credits.mjs";
import { getStripe } from "../server/api-lib/stripe.mjs";

// The Etsy sync paces its calls to stay under Etsy's 10/sec limit, so a
// full 11-category run takes well over Vercel's 10s default.
export const maxDuration = 60;

// eBay Browse API: public product search, kept on this existing function
// to respect the Vercel Hobby function-count limit. Credentials are server-only.
let ebayAccessToken: string | null = null;
let ebayAccessTokenExpiresAt = 0;

async function getEbayAccessToken() {
  const clientId = process.env.EBAY_CLIENT_ID?.trim();
  const clientSecret = process.env.EBAY_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new Error("eBay API credentials are not configured.");
  if (ebayAccessToken && Date.now() < ebayAccessTokenExpiresAt - 60_000) return ebayAccessToken;

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "https://api.ebay.com/oauth/api_scope",
    }).toString(),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || typeof payload.access_token !== "string") {
    throw new Error(`eBay token request failed (${response.status}).`);
  }
  ebayAccessToken = payload.access_token;
  ebayAccessTokenExpiresAt = Date.now() + Math.max(60, Number(payload.expires_in) || 7200) * 1000;
  return ebayAccessToken;
}

async function searchEbayUsed(query: string) {
  const token = await getEbayAccessToken();
  const params = new URLSearchParams({
    q: query,
    limit: "50",
    sort: "price",
    filter: "buyingOptions:{FIXED_PRICE},deliveryCountry:US,conditionIds:{3000|4000|5000|6000}",
  });
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
    "X-EBAY-C-ENDUSERCTX": "contextualLocation=country%3DUS",
  };
  if (process.env.EBAY_CAMPAIGN_ID?.trim()) {
    headers["X-EBAY-C-ENDUSERCTX"] += `,affiliateCampaignId=${encodeURIComponent(process.env.EBAY_CAMPAIGN_ID.trim())}`;
  }
  const response = await fetch(`https://api.ebay.com/buy/browse/v1/item_summary/search?${params.toString()}`, { headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`eBay Browse API returned ${response.status}`);
  return (Array.isArray(payload.itemSummaries) ? payload.itemSummaries : []).map((item: any) => {
    const price = Number(item.price?.value);
    const shipping = Array.isArray(item.shippingOptions)
      ? Number(item.shippingOptions.find((option: any) => option.shippingCost?.value != null)?.shippingCost?.value)
      : NaN;
    return {
      id: `ebay:${String(item.itemId || "")}`,
      title: String(item.title || "eBay listing"),
      imageUrl: item.image?.imageUrl || item.thumbnailImages?.[0]?.imageUrl || null,
      price: Number.isFinite(price) ? price : null,
      currency: item.price?.currency || "USD",
      shipping: Number.isFinite(shipping) ? shipping : null,
      total: Number.isFinite(price) && Number.isFinite(shipping) ? Math.round((price + shipping) * 100) / 100 : null,
      condition: item.condition || "Used",
      seller: item.seller?.username || null,
      sellerFeedback: item.seller?.feedbackPercentage || null,
      url: item.itemAffiliateWebUrl || item.itemWebUrl || null,
      source: "eBay",
    };
  }).filter((item: any) => item.id !== "ebay:" && item.url && item.price !== null
    && /used|pre[- ]?owned|open box|very good|good|acceptable/i.test(String(item.condition || "")));
}

async function searchDataForSeoUsed(query: string) {
  const login = process.env.DATAFORSEO_LOGIN?.trim();
  const password = process.env.DATAFORSEO_PASSWORD?.trim();
  if (!login || !password) throw new Error("DataForSEO credentials are not configured");
  const authorization = `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}`;
  const headers = { Authorization: authorization, "Content-Type": "application/json" };

  const postResponse = await fetch("https://api.dataforseo.com/v3/merchant/google/products/task_post", {
    method: "POST",
    headers,
    body: JSON.stringify([{
      location_name: "United States",
      language_name: "English",
      keyword: `used refurbished renewed pre-owned ${query}`,
      depth: 40,
      priority: 2,
      sort_by: "price_low_to_high",
    }]),
  });
  const posted = await postResponse.json().catch(() => ({}));
  const task = Array.isArray(posted.tasks) ? posted.tasks[0] : null;
  if (!postResponse.ok || posted.status_code !== 20000 || !task?.id || task.status_code >= 40000) {
    throw new Error(`DataForSEO task submission failed (${postResponse.status || posted.status_code || "unknown"})`);
  }

  // Merchant API tasks are asynchronous (priority 2 is typically under
  // one minute). Poll briefly so fast tasks can join this response; if the
  // task is still processing, return eBay results without blocking the gift flow.
  let completedTask: any = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 900));
    const resultResponse = await fetch(
      `https://api.dataforseo.com/v3/merchant/google/products/task_get/advanced/${encodeURIComponent(task.id)}`,
      { headers: { Authorization: authorization } },
    );
    const resultPayload = await resultResponse.json().catch(() => ({}));
    if (!resultResponse.ok || resultPayload.status_code !== 20000) {
      if (attempt === 5) throw new Error("DataForSEO results request failed");
      continue;
    }
    completedTask = Array.isArray(resultPayload.tasks) ? resultPayload.tasks[0] : null;
    if (completedTask?.status_code === 20000) break;
    if (completedTask?.status_code >= 40000) throw new Error("DataForSEO task failed");
    completedTask = null;
  }
  if (!completedTask) throw new Error("DataForSEO task is still processing");
  const result = Array.isArray(completedTask.result) ? completedTask.result[0] : null;
  const rows = Array.isArray(result?.items) ? result.items : [];
  return rows.filter((item: any) => item.type === "google_shopping_serp")
    .map((item: any, index: number) => {
      const title = String(item.title || "Shopping listing");
      const description = String(item.description || "");
      const tags = Array.isArray(item.tags) ? item.tags.join(" ") : "";
      const conditionText = `${title} ${description} ${tags}`;
      const usedMatch = conditionText.match(/used|pre[- ]?owned|refurbished|renewed|open[- ]?box|reconditioned/i);
      const price = Number(item.price);
      const delivery = Number(item.delivery_info?.delivery_price?.current);
      return {
        id: `dataforseo:${String(item.product_id || item.data_docid || index)}`,
        title,
        imageUrl: Array.isArray(item.product_images) ? item.product_images[0] || null : null,
        price: Number.isFinite(price) ? price : null,
        currency: item.currency || "USD",
        shipping: Number.isFinite(delivery) ? delivery : null,
        total: Number.isFinite(price) && Number.isFinite(delivery) ? Math.round((price + delivery) * 100) / 100 : null,
        condition: usedMatch?.[0] || "Used condition not confirmed",
        seller: item.seller || item.domain || null,
        sellerFeedback: null,
        url: item.url || item.shopping_url || result.check_url || null,
        source: "Google Shopping",
      };
    })
    .filter((item: any) => item.url && item.price !== null && /used|pre[- ]?owned|refurbished|renewed|open[- ]?box|reconditioned/i.test(item.condition));
}

async function handleEbaySearch(req: any, res: any) {
  const rawQuery = req.query?.q;
  const query = typeof rawQuery === "string" ? rawQuery.trim().slice(0, 100) : "";
  if (query.length < 2) {
    res.status(400).json({ error: "Enter at least two characters to search." });
    return;
  }

  // This endpoint is intentionally public: anonymous Gift AI visitors can
  // use it. Provider failures are isolated so one unavailable source does
  // not suppress listings returned by another source.
  const providers = await Promise.allSettled([
    searchEbayUsed(query),
    searchDataForSeoUsed(query),
  ]);
  const items = providers.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  const providerStatus = {
    ebay: providers[0].status === "fulfilled" ? "ok" : "unavailable",
    dataForSeo: providers[1].status === "fulfilled" ? "ok" : "unavailable",
  };
  if (providers.some((result) => result.status === "rejected")) {
    console.warn("Second-hand search provider status:", providerStatus);
  }
  items.sort((left: any, right: any) => (left.total ?? left.price) - (right.total ?? right.price));
  res.setHeader("Cache-Control", items.length ? "public, s-maxage=180, stale-while-revalidate=600" : "no-store");
  if (!items.length) {
    res.status(503).json({
      error: "No second-hand search providers are currently returning results.",
      reason: "provider_unavailable",
      providerStatus,
      items: [],
    });
    return;
  }
  res.status(200).json({ query, mode: "used", providerStatus, items });
}

const GROQ_DEFAULT_MODEL = "openai/gpt-oss-120b";
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
// This branch is intentionally open to guests (Gift AI has no sign-in
// wall), so it's the one place anyone on the internet can make the server
// spend GROQ_API_KEY. Everything the client controls is clamped to what
// src/lib/ai/* actually sends (largest is maxTokens 900) so it can't be
// used as a general-purpose, any-model, any-size LLM proxy.
const GROQ_ALLOWED_MODELS = new Set([GROQ_DEFAULT_MODEL]);
const GROQ_MAX_TOKENS = 1200;
const GROQ_MAX_MESSAGES = 24;
const GROQ_MAX_CONTENT_CHARS = 40_000;

// POST ?action=etsy_sync = admin-only: pulls a fresh batch of real Etsy
// listings into the `products` table (see server/api-lib/etsy.mjs for the
// category/keyword mapping and row shape). Branched onto this existing
// endpoint for the same Hobby-plan 12-function-cap reason called out on
// the Groq branch below -- admin-triggered, not a cron, so it doesn't need
// one of the 2 cron slots either.
async function handleEtsySync(req: any, res: any) {
  try {
    const admin = await getUserFromRequest(req);
    if (!admin) {
      res.status(401).json({ error: "Not signed in." });
      return;
    }
    const adminRows = await restFetch(`profiles?id=eq.${admin.id}&select=role`);
    if (adminRows?.[0]?.role !== "admin") {
      res.status(403).json({ error: "Admin access required." });
      return;
    }

    const { synced, errors } = await syncEtsyProducts();
    res.status(200).json({ synced, errors });
  } catch (error: any) {
    console.error("Etsy sync failed:", error?.message);
    res.status(502).json({ error: error?.message || "Etsy sync failed." });
  }
}

// GET ?action=credits = this user's current balance + free-tier remaining.
// POST ?action=credits_spend = the single gate every metered feature
// (Your Gift AI, Secret Santa matching, AutoGift) calls through before it
// runs the actual action -- see credit-system-proposal.md. Branched onto
// this existing endpoint for the same Hobby-plan 12-function-cap reason
// as etsy_sync and the Groq branch below.
async function handleCreditStatus(req: any, res: any) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "Not signed in." });
      return;
    }
    const status = await getCreditStatus(user.id);
    res.status(200).json(status);
  } catch (error: any) {
    console.error("Credit status failed:", error?.message);
    res.status(500).json({ error: "Couldn't load credit balance." });
  }
}

async function handleCreditSpend(req: any, res: any) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "Not signed in." });
      return;
    }
    const { amount, reason, referenceId } = req.body ?? {};
    const VALID_REASONS = new Set(["autogift_purchase", "gift_ai_chat", "secret_santa_match"]);
    if (!VALID_REASONS.has(reason) || typeof amount !== "number" || amount <= 0) {
      res.status(400).json({ error: "Invalid spend request." });
      return;
    }
    const result = await spendCredits(user.id, amount, reason, typeof referenceId === "string" ? referenceId : null);
    if (!result?.ok) {
      res.status(402).json(result ?? { error: "insufficient_credits" });
      return;
    }
    res.status(200).json(result);
  } catch (error: any) {
    console.error("Credit spend failed:", error?.message);
    res.status(500).json({ error: "Couldn't process that -- try again." });
  }
}

// POST ?action=credits_checkout {packId} = starts a one-time Stripe
// Checkout for a credit pack and returns its hosted-page URL.
// POST ?action=credits_confirm {sessionId} = called by /account when Stripe
// redirects back; grants the pack's credits once (see
// confirmCreditCheckoutSession for the idempotency story).
async function handleCreditCheckout(req: any, res: any) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "Not signed in." });
      return;
    }
    const { packId } = req.body ?? {};
    if (typeof packId !== "string" || !Object.prototype.hasOwnProperty.call(CREDIT_PACKS, packId)) {
      res.status(400).json({ error: "Unknown credit pack." });
      return;
    }
    const session = await createCreditCheckoutSession(getStripe(), user.id, user.email, packId);
    res.status(200).json({ url: session.url });
  } catch (error: any) {
    console.error("Credit checkout failed:", error?.message);
    res.status(500).json({ error: "Couldn't start checkout -- try again." });
  }
}

async function handleCreditConfirm(req: any, res: any) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "Not signed in." });
      return;
    }
    const { sessionId } = req.body ?? {};
    if (typeof sessionId !== "string" || !sessionId.startsWith("cs_")) {
      res.status(400).json({ error: "Invalid checkout session." });
      return;
    }
    const result = await confirmCreditCheckoutSession(getStripe(), user.id, sessionId, hasGrantedForPaymentIntent, grantCredits);
    res.status(200).json(result);
  } catch (error: any) {
    console.error("Credit confirm failed:", error?.message);
    res.status(500).json({ error: "Couldn't confirm that purchase. If you were charged, refresh this page in a minute." });
  }
}

// Branched onto this existing endpoint rather than living at its own
// api/groq.ts -- this project sits at Vercel's Hobby-plan 12-function cap
// (see the SMS-inbound webhook branched onto api/cron/dispatch-notifications.ts
// for the same reason). No collision risk: every caller of GET /api/metadata
// sends a `url` query param, and the Groq client (src/lib/ai/groq-client.ts)
// always POSTs a JSON body, so splitting on req.method is unambiguous.
async function handleGroqChat(req: any, res: any) {
  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: "GROQ_API_KEY is not configured" });
      return;
    }

    const { messages, temperature = 0.7, maxTokens = 700, model = GROQ_DEFAULT_MODEL } = req.body ?? {};
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > GROQ_MAX_MESSAGES) {
      res.status(400).json({ error: "messages must be a non-empty array" });
      return;
    }
    const validMessages = messages.every((m: any) => m && ["system", "user", "assistant"].includes(m.role) && typeof m.content === "string");
    const totalChars = validMessages ? messages.reduce((sum: number, m: any) => sum + m.content.length, 0) : Infinity;
    if (!validMessages || totalChars > GROQ_MAX_CONTENT_CHARS) {
      res.status(400).json({ error: "Invalid or oversized messages." });
      return;
    }
    if (!GROQ_ALLOWED_MODELS.has(model)) {
      res.status(400).json({ error: "Unsupported model." });
      return;
    }
    const safeMaxTokens = Math.min(Math.max(Number(maxTokens) || 700, 1), GROQ_MAX_TOKENS);
    const safeTemperature = Math.min(Math.max(Number(temperature) || 0, 0), 1.5);

    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: messages.map((m: any) => ({ role: m.role, content: m.content })),
        temperature: safeTemperature,
        max_tokens: safeMaxTokens,
        response_format: { type: "json_object" },
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      res.status(response.status).json({ error: data });
      return;
    }
    res.status(200).json(data);
  } catch (error) {
    console.error("Groq API error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

export default async function handler(req: any, res: any) {
  if (req.method === "POST" && req.query?.action === "etsy_sync") {
    await handleEtsySync(req, res);
    return;
  }

  if (req.method === "POST" && req.query?.action === "credits_spend") {
    await handleCreditSpend(req, res);
    return;
  }

  if (req.method === "POST" && req.query?.action === "credits_checkout") {
    await handleCreditCheckout(req, res);
    return;
  }

  if (req.method === "POST" && req.query?.action === "credits_confirm") {
    await handleCreditConfirm(req, res);
    return;
  }

  if (req.method === "GET" && req.query?.action === "credits") {
    await handleCreditStatus(req, res);
    return;
  }

  // GET ?action=trending = what's popular on Etsy right now for the
  // current season (see fetchEtsyTrending). Public and identical for
  // everyone, so the CDN holds it for 30 minutes and serves a stale copy
  // while it refreshes; the Trending rail falls back to its own picks on
  // any failure here.
  if (req.method === "GET" && req.query?.action === "ebay_search") {
    await handleEbaySearch(req, res);
    return;
  }

  if (req.method === "GET" && req.query?.action === "trending") {
    try {
      const items = await fetchEtsyTrending();
      res.setHeader("Cache-Control", "public, s-maxage=1800, stale-while-revalidate=86400");
      res.status(200).json({ source: "etsy", items });
    } catch (error: any) {
      console.error("Etsy trending failed:", error?.message);
      res.status(502).json({ source: "etsy", items: [], error: "Etsy is unavailable right now." });
    }
    return;
  }

  if (req.method === "POST") {
    await handleGroqChat(req, res);
    return;
  }

  const pageUrl = req.query?.url;
  if (!pageUrl || typeof pageUrl !== "string") {
    res.status(400).json({ error: "url query param is required" });
    return;
  }
  try {
    const meta = await fetchPageMetadata(pageUrl);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.status(200).json({ data: meta });
  } catch {
    res.status(502).json({ data: null });
  }
}
