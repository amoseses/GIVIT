import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";
import { useLocation, Link } from "wouter";
import { User, Trash2, Camera, ArrowRight, Check, Plus, X } from "lucide-react";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/layout/page-shell";
import { useAuth } from "@/lib/auth/use-auth";
import { getUserOrders, getUserAutoGiftOrders, getUserAddresses, getUserPaymentMethods, getWishlist, updateProfile, saveUserAddress, saveUserPaymentMethod, deleteUserAddress, deleteUserPaymentMethod } from "@/lib/supabase/db";
import { NotificationSettingsCard } from "@/components/personalization/notification-settings";
import { getStripePromise, hasStripePublishableKey } from "@/lib/stripe/client";
import { createClient } from "@/lib/supabase/client";
import { normalizePhoneE164 } from "@/lib/utils";
import { addressValidationError } from "@/lib/validation/autogift";
import { uploadFileToS3 } from "@/lib/upload";
import { getCohort } from "@/lib/data/gifting-cohorts";
import { GiftingQuizModal, COHORT_ICONS } from "@/components/personalization/gifting-quiz-modal";
import { AccountLayout, type AccountNavItem, type AccountQuickLink } from "@/components/account/account-layout";
import { AccountSection, Field, eyebrowClass, focusRingClass, iconButtonClass, inputClass, primaryButtonClass, quietActionClass, secondaryButtonClass, textLinkClass } from "@/components/account/account-ui";
import { CREDIT_PACKS, CREDITS_CHANGED_EVENT, confirmCreditPurchase, getCreditStatus, startCreditCheckout, startMembershipCheckout, syncMembership, isActiveMember, MEMBERSHIP_TIERS, MEMBERSHIP_ENABLED, MEMBERSHIP_PERKS, MEMBERSHIP_PRICE_LABEL, type CreditPackId, type CreditStatus } from "@/lib/credits/credits";

async function authedFetch(path: string, init?: RequestInit) {
  const { data } = await createClient().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not signed in.");
  return fetch(path, {
    ...init,
    headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
}

type ConfirmedPaymentMethod = { id: string; brand: string; last4: string };
type PaymentFormHandle = { submit: () => Promise<{ ok: true; method: ConfirmedPaymentMethod } | { ok: false; error: string }> };

// Same pattern as the AutoGift onboarding wizard's PaymentElementForm: card
// fields never touch GIVIT's own state or servers, Stripe's PaymentElement
// runs inside Stripe's own iframe, and confirmSetup() only ever hands this
// component back an opaque payment_method ID.
type PaymentElementFormProps = { onReady?: () => void; onLoadError?: (message: string) => void };
const PaymentElementForm = forwardRef<PaymentFormHandle, PaymentElementFormProps>(function PaymentElementForm({ onReady, onLoadError }, ref) {
  const stripe = useStripe();
  const elements = useElements();

  useImperativeHandle(ref, () => ({
    async submit() {
      if (!stripe || !elements) return { ok: false, error: "Payment form is still loading." };
      const { error: submitError } = await elements.submit();
      if (submitError) return { ok: false, error: submitError.message || "Enter valid card details." };
      const { error, setupIntent } = await stripe.confirmSetup({ elements, redirect: "if_required" });
      if (error) return { ok: false, error: error.message || "Card couldn't be saved." };
      const paymentMethodId = typeof setupIntent?.payment_method === "string" ? setupIntent.payment_method : setupIntent?.payment_method?.id;
      if (!paymentMethodId) return { ok: false, error: "Card couldn't be saved." };
      try {
        const res = await authedFetch(`/api/stripe/setup-intent?paymentMethodId=${encodeURIComponent(paymentMethodId)}`, { method: "GET" });
        const data = await res.json();
        if (!res.ok) return { ok: false, error: data.error || "Card was saved, but details couldn't be confirmed." };
        return { ok: true, method: { id: paymentMethodId, brand: data.brand, last4: data.last4 } };
      } catch (err: any) {
        return { ok: false, error: err.message || "Card was saved, but details couldn't be confirmed." };
      }
    },
  }));

  return (
    <PaymentElement
      options={{ layout: "tabs" }}
      onReady={onReady}
      onLoadError={(event) =>
        onLoadError?.(event.error.message || "The payment form couldn't load. Check your connection or disable ad blockers, then try again.")
      }
    />
  );
});

// Section ids double as scroll targets. "credits" and "membership" are
// linked from other pages (/account#credits, /account#membership) and from
// the Stripe return handling below, so those two must not be renamed.
const ACCOUNT_SECTIONS: AccountNavItem[] = [
  { id: "profile", label: "Profile" },
  { id: "credits", label: "Credits" },
  ...(MEMBERSHIP_ENABLED ? [{ id: "membership", label: "Membership" }] : []),
  { id: "orders", label: "Orders" },
  { id: "wishlist", label: "Wishlist" },
  { id: "addresses", label: "Addresses" },
  { id: "payment", label: "Payment" },
  { id: "notifications", label: "Notifications" },
  { id: "security", label: "Security" },
];

const QUICK_LINKS: AccountQuickLink[] = [
  { href: "/people", label: "People" },
  { href: "/concierge", label: "AutoGift" },
  { href: "/gift", label: "Your Gift AI" },
  { href: "/submit-product", label: "Submit a product" },
  { href: "/wishlist", label: "Wishlist" },
  { href: "/secret-santa", label: "Secret Santa" },
];

export default function AccountPage() {
  const { user, profile, loading, refresh } = useAuth();
  const [, navigate] = useLocation();
  const [orders, setOrders] = useState<any[]>([]);
  const [addresses, setAddresses] = useState<any[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [wishlist, setWishlist] = useState<any[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  
  // Profile editing state
  const [editingProfile, setEditingProfile] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [addressForm, setAddressForm] = useState({ label: "Home", line1: "", city: "", state: "", zip: "", country: "US" });
  const [addingAddress, setAddingAddress] = useState(false);
  const [accountNotice, setAccountNotice] = useState("");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [showQuiz, setShowQuiz] = useState(false);
  const [creditStatus, setCreditStatus] = useState<CreditStatus | null>(null);
  const [buyingPack, setBuyingPack] = useState<CreditPackId | null>(null);
  const [startingMembership, setStartingMembership] = useState(false);
  const membershipSyncedRef = useRef(false);
  const cohort = getCohort(profile?.gifting_cohort);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  async function saveCohort(cohortId: string) {
    if (!user) return;
    await updateProfile(user.id, { gifting_cohort: cohortId });
    refresh();
    setShowQuiz(false);
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess(false);
    if (newPassword.length < 8) { setPasswordError("New password must be at least 8 characters."); return; }
    if (newPassword !== confirmPassword) { setPasswordError("New passwords don't match."); return; }
    if (!profile?.email) { setPasswordError("Couldn't verify your account email. Try refreshing the page."); return; }

    setChangingPassword(true);
    try {
      const supabase = createClient();
      // Supabase's client has no "verify current password" call on its own --
      // re-authenticating with it first is what actually confirms the user
      // knows the current password before updateUser() is allowed to change
      // it, rather than letting anyone with an open session swap it blind.
      const { error: reauthError } = await supabase.auth.signInWithPassword({ email: profile.email, password: currentPassword });
      if (reauthError) { setPasswordError("Current password is incorrect."); return; }

      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) { setPasswordError(updateError.message); return; }

      setPasswordSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } finally {
      setChangingPassword(false);
    }
  }

  async function handleAvatarSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file || !user) return;
    if (!file.type.startsWith("image/")) { setAccountNotice("Please choose an image file."); return; }
    if (file.size > 5 * 1024 * 1024) { setAccountNotice("Image is too large. Please choose one under 5MB."); return; }
    setUploadingAvatar(true);
    setAccountNotice("");
    try {
      const { url } = await uploadFileToS3(file, "avatars");
      const { error } = await updateProfile(user.id, { avatar_url: url });
      if (error) { setAccountNotice(error.message); return; }
      refresh();
    } catch (err: any) {
      // The upload now proxies through our own server (see upload.ts), so
      // there's no cross-origin request left for a browser-level "Failed
      // to fetch" to come from -- any failure here is a real error the
      // server already turned into a readable message.
      setAccountNotice(err.message || "Couldn't upload that photo. Please try again.");
    } finally {
      setUploadingAvatar(false);
    }
  }

  // Payment via real Stripe Elements -- clientSecret is fetched fresh each
  // time "Add a card" is opened rather than kept around, same reasoning as
  // the AutoGift onboarding wizard.
  const [addingPayment, setAddingPayment] = useState(false);
  const [paymentClientSecret, setPaymentClientSecret] = useState<string | null>(null);
  const [paymentFetching, setPaymentFetching] = useState(false);
  const [paymentReady, setPaymentReady] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);
  const paymentFormRef = useRef<PaymentFormHandle>(null);
  const paymentReadyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate("/login?next=/account");
  }, [loading, user, navigate]);

  // Same reasoning as the AutoGift onboarding wizard: a clientSecret alone
  // doesn't guarantee Stripe Elements will ever finish loading its iframe --
  // without this, a blocked script or revoked key left the card fields
  // (and the "Loading payment form…" text right above them) stuck forever.
  useEffect(() => {
    if (!paymentClientSecret) return;
    setPaymentReady(false);
    paymentReadyTimeoutRef.current = setTimeout(() => {
      setAccountNotice("The payment form is taking too long to load. Check your connection or disable ad blockers, then try again.");
    }, 12000);
    return () => {
      if (paymentReadyTimeoutRef.current) clearTimeout(paymentReadyTimeoutRef.current);
    };
  }, [paymentClientSecret]);

  function handlePaymentReady() {
    if (paymentReadyTimeoutRef.current) clearTimeout(paymentReadyTimeoutRef.current);
    setPaymentReady(true);
  }

  function handlePaymentLoadError(message: string) {
    if (paymentReadyTimeoutRef.current) clearTimeout(paymentReadyTimeoutRef.current);
    setAccountNotice(message);
  }

  useEffect(() => {
    if (!user) return;
    const userId = user.id;
    async function load() {
      setDataLoading(true);
      try {
        const [ordersData, autoGiftOrdersData, addressesData, paymentData, wishlistData] = await Promise.all([
          getUserOrders(userId),
          getUserAutoGiftOrders(userId),
          getUserAddresses(userId),
          getUserPaymentMethods(userId),
          getWishlist(userId),
        ]);
        // Orders panel here is a summary -- the full breakdown (marketplace
        // vs AutoGift, items, card message) lives on /orders. Normalizing
        // both sources to the same shape lets this panel show "N orders"
        // and a recent-3 preview without caring which table each came from.
        const normalized = [
          ...ordersData.map((o: any) => ({ id: o.id, total_cents: o.total_cents, status: o.status, created_at: o.created_at })),
          ...autoGiftOrdersData.map((o: any) => ({ id: o.id, total_cents: o.total_cents, status: o.status, created_at: o.created_at })),
        ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setOrders(normalized);
        setAddresses(addressesData);
        setPaymentMethods(paymentData);
        setWishlist(wishlistData);
      } catch (err) {
        console.error("Failed to load account data:", err);
      } finally {
        setDataLoading(false);
      }
    }
    load();
  }, [user]);

  // Credits: load the balance, keep it fresh after spends/purchases, and
  // finish a pack purchase when Stripe Checkout redirects back here with
  // ?credits_purchase=success&session_id=... (see credits_confirm in
  // api/metadata.ts). The query params are stripped right away so a
  // refresh doesn't re-show the notice -- re-confirming would be harmless
  // anyway, since the grant is idempotent per payment intent.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = () => getCreditStatus().then((s) => { if (!cancelled) setCreditStatus(s); });
    load();
    window.addEventListener(CREDITS_CHANGED_EVENT, load);
    // Back from Stripe restores this page from bfcache with the pack
    // button still stuck on "Opening checkout...".
    const onPageShow = (e: PageTransitionEvent) => { if (e.persisted) { setBuyingPack(null); setStartingMembership(false); } };
    window.addEventListener("pageshow", onPageShow);

    const params = new URLSearchParams(window.location.search);
    const purchase = params.get("credits_purchase");
    const sessionId = params.get("session_id");
    if (purchase) {
      window.history.replaceState(null, "", `${window.location.pathname}#credits`);
      if (purchase === "cancelled") {
        setAccountNotice("Checkout cancelled. You weren't charged.");
      } else if (purchase === "success" && sessionId) {
        setAccountNotice("Confirming your purchase...");
        confirmCreditPurchase(sessionId).then((result) => {
          if (cancelled) return;
          if (result.ok) {
            setAccountNotice(result.alreadyGranted ? "Those credits are already in your balance." : `Thanks! ${result.creditsGranted} credits added to your balance.`);
          } else if ("status" in result && result.status) {
            setAccountNotice("Your payment is still processing. Refresh this page in a minute to see your credits.");
          } else {
            setAccountNotice(result.error || "Couldn't confirm that purchase. If you were charged, refresh this page in a minute.");
          }
        });
      }
    }

    // Membership: Stripe Checkout redirects back with ?membership=success.
    // syncMembership() makes the server re-read the subscription from
    // Stripe and apply it (status + this month's credits), so activation
    // doesn't wait on -- or depend on -- the webhook. The subscription can
    // lag the redirect by a moment, hence the retries. Outside of a
    // redirect, one quiet sync per visit keeps a cancelled or lapsed
    // membership from still showing as active here. Neither path checks
    // `cancelled`: refresh() gives `user` a new identity, which re-runs
    // this effect, and that must not abandon an activation in flight --
    // the ref is what keeps the quiet sync to once per visit instead.
    const membership = MEMBERSHIP_ENABLED ? params.get("membership") : null;
    if (membership) {
      membershipSyncedRef.current = true;
      window.history.replaceState(null, "", `${window.location.pathname}#membership`);
      if (membership === "cancelled") {
        setAccountNotice("Membership checkout cancelled. You weren't charged.");
      } else if (membership === "success") {
        setAccountNotice("Activating your membership...");
        void (async () => {
          let result = await syncMembership();
          for (let attempt = 0; attempt < 3 && !isActiveMember(result?.status); attempt++) {
            await new Promise((resolve) => setTimeout(resolve, 2500));
            result = await syncMembership();
          }
          if (isActiveMember(result?.status)) {
            setAccountNotice(`Welcome, GIVIT Member! Your ${MEMBERSHIP_TIERS[0].monthlyCredits} credits for this month are in your balance.`);
            refresh();
          } else {
            setAccountNotice("Your payment went through, but the membership isn't showing as active yet. Refresh this page in a minute. If it still isn't active, contact us and we'll sort it out.");
          }
        })();
      }
    } else if (MEMBERSHIP_ENABLED && !membershipSyncedRef.current) {
      membershipSyncedRef.current = true;
      void syncMembership().then((result) => { if (result) refresh(); });
    }
    if (window.location.hash === "#credits" || window.location.hash === "#membership") {
      const targetId = window.location.hash.slice(1);
      // The membership card only exists once this page has rendered past
      // its loading state, so look it up a beat later rather than now.
      window.setTimeout(() => document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" }), 400);
    }
    return () => {
      cancelled = true;
      window.removeEventListener(CREDITS_CHANGED_EVENT, load);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [user]);

  async function handleBuyPack(packId: CreditPackId) {
    setBuyingPack(packId);
    const error = await startCreditCheckout(packId);
    // On success the page is already navigating to Stripe; only an error
    // returns here.
    if (error) {
      setAccountNotice(error);
      setBuyingPack(null);
    }
  }

  async function handleStartMembership() {
    setStartingMembership(true);
    const error = await startMembershipCheckout(MEMBERSHIP_TIERS[0].id);
    if (error) {
      setAccountNotice(error);
      setStartingMembership(false);
    }
  }

  // Sync profile fields when loaded
  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || "");
      setPhone((profile as any).phone || "");
    }
  }, [profile]);

  async function handleProfileSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    // Stored unnormalized, a phone number silently breaks both outbound SMS
    // (SNS requires E.164) and inbound STOP/START replies (matched back to
    // a profile by exact E.164 string) -- rejecting an unrecognizable
    // number here beats saving something that fails silently later.
    // Required (not just validated) so every account has one on file --
    // otherwise text reminders/test SMS have nothing to send to.
    const trimmedPhone = phone.trim();
    if (!trimmedPhone) {
      setProfileError("Phone number is required.");
      return;
    }
    const normalizedPhone = normalizePhoneE164(trimmedPhone);
    if (!normalizedPhone) {
      setProfileError("Enter a valid US phone number, e.g. (555) 123-4567.");
      return;
    }
    setSavingProfile(true);
    setProfileError("");
    try {
      const { data, error } = await updateProfile(user.id, {
        full_name: fullName.trim() || null,
        phone: normalizedPhone,
      });
      if (error) throw new Error(error.message || "Failed to update profile");
      setEditingProfile(false);
    } catch (err: any) {
      setProfileError(err.message);
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleAddressSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const addressError = addressValidationError(addressForm);
    if (addressError) { setAccountNotice(addressError); return; }
    const { error } = await saveUserAddress({ user_id: user.id, ...addressForm, is_default: addresses.length === 0 });
    if (error) { setAccountNotice(error.message); return; }
    setAddresses(await getUserAddresses(user.id));
    setAddressForm({ label: "Home", line1: "", city: "", state: "", zip: "", country: "US" });
    setAddingAddress(false);
    setAccountNotice("Address saved.");
  }


  async function handleAddressDelete(addressId: string) {
    if (!user) return;
    const { error } = await deleteUserAddress(user.id, addressId);
    if (error) { setAccountNotice(error.message); return; }
    setAddresses(addresses.filter((addr) => addr.id !== addressId));
    setAccountNotice("Address deleted.");
  }

  async function handlePaymentDelete(paymentMethodId: string) {
    if (!user) return;
    const { error } = await deleteUserPaymentMethod(user.id, paymentMethodId);
    if (error) { setAccountNotice(error.message); return; }
    setPaymentMethods(paymentMethods.filter((pm) => pm.id !== paymentMethodId));
    setAccountNotice("Payment method deleted.");
  }

  async function startAddingPayment() {
    setAddingPayment(true);
    setAccountNotice("");
    if (paymentClientSecret || paymentFetching) return;
    if (!hasStripePublishableKey()) {
      setAccountNotice("Payments aren't configured for this environment yet. Please try again later or contact support.");
      return;
    }
    setPaymentFetching(true);
    try {
      const res = await authedFetch("/api/stripe/setup-intent", { method: "POST" });
      const data = await res.json();
      if (data.clientSecret) setPaymentClientSecret(data.clientSecret);
      else setAccountNotice(data.error || "Couldn't load the payment form.");
    } catch (err: any) {
      setAccountNotice(err.message || "Couldn't load the payment form.");
    } finally {
      setPaymentFetching(false);
    }
  }

  async function handlePaymentSave() {
    if (!user || !paymentFormRef.current) return;
    setSavingPayment(true);
    const result = await paymentFormRef.current.submit();
    if (!result.ok) {
      setSavingPayment(false);
      setAccountNotice(result.error);
      return;
    }
    const { error } = await saveUserPaymentMethod({
      user_id: user.id,
      stripe_payment_method_id: result.method.id,
      card_brand: result.method.brand,
      card_last4: result.method.last4,
      is_default: paymentMethods.length === 0,
    });
    setSavingPayment(false);
    if (error) { setAccountNotice(error.message); return; }
    setPaymentMethods(await getUserPaymentMethods(user.id));
    setAddingPayment(false);
    setPaymentClientSecret(null);
    setAccountNotice("Payment method saved for Stripe checkout / AutoGift approvals.");
  }

  if (loading || dataLoading) return <PageShell><div className="flex min-h-[400px] items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-givit-ember border-t-transparent" /></div></PageShell>;
  if (!user) return null;

  // "Best value" = whichever pack is actually cheapest per credit, computed
  // from real prices rather than hardcoded. Same packs and same Stripe
  // checkout either way; this only decides which row gets the tag.
  const packRates = CREDIT_PACKS.map((p) => p.priceCents / p.credits);
  const bestPackRate = Math.min(...packRates);
  const worstPackRate = Math.max(...packRates);
  const CohortIcon = cohort ? COHORT_ICONS[cohort.icon] : null;
  const isMember = isActiveMember(profile?.membership_status);

  const profileHeader = (
    <header
      id="profile"
      tabIndex={-1}
      aria-label="Profile"
      className="scroll-mt-40 pb-8 outline-none lg:scroll-mt-28 lg:border-b lg:border-border/40 lg:pb-12"
    >
      <p className={eyebrowClass}>Account</p>
      <div className="mt-5 flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-8">
        <div className="group/avatar relative h-24 w-24 shrink-0">
          <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl bg-muted">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <User className="h-9 w-9 text-muted-foreground" strokeWidth={1.5} />
            )}
          </div>
          <button
            type="button"
            onClick={() => avatarInputRef.current?.click()}
            disabled={uploadingAvatar}
            aria-label="Change profile photo"
            className={`absolute inset-0 flex items-center justify-center rounded-2xl transition group-hover/avatar:bg-black/45 group-hover/avatar:text-white focus-visible:bg-black/45 focus-visible:text-white disabled:cursor-wait ${focusRingClass} ${uploadingAvatar ? "bg-black/45 text-white" : "bg-black/0 text-transparent"}`}
          >
            {uploadingAvatar ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <Camera className="h-5 w-5" />
            )}
          </button>
          <input ref={avatarInputRef} type="file" accept="image/*" onChange={handleAvatarSelected} className="hidden" />
        </div>
        <div className="min-w-0 flex-1">
          {editingProfile ? (
            <form onSubmit={handleProfileSave} className="max-w-sm space-y-4">
              <Field label="Full name" htmlFor="account-full-name">
                <input
                  id="account-full-name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your name"
                  autoComplete="name"
                  className={inputClass}
                />
              </Field>
              <Field label="Phone (required)" htmlFor="account-phone" hint="Needed for text reminders and order updates.">
                <input
                  id="account-phone"
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(555) 123-4567"
                  autoComplete="tel"
                  className={inputClass}
                />
              </Field>
              {profileError && <p role="alert" className="text-sm text-destructive">{profileError}</p>}
              <div className="flex gap-2 pt-1">
                <Button type="submit" disabled={savingProfile} className={primaryButtonClass}>
                  {savingProfile ? "Saving..." : "Save"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setEditingProfile(false)} className={secondaryButtonClass}>Cancel</Button>
              </div>
            </form>
          ) : (
            <>
              <h1 className="break-words text-3xl font-light tracking-tight text-givit-ink md:text-4xl">{profile?.full_name || "Your account"}</h1>
              {/* Phone stays visible here, not only inside Edit profile: a
                  saved number otherwise looked "missing" even when it was
                  right there in the DB. */}
              <p className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-muted-foreground">
                <span className="min-w-0 break-all">{profile?.email}</span>
                <span aria-hidden="true">·</span>
                {profile?.phone ? (
                  <span className="whitespace-nowrap">{profile.phone}</span>
                ) : (
                  <button type="button" onClick={() => setEditingProfile(true)} className={textLinkClass}>
                    Add a phone number
                  </button>
                )}
                {profile?.role === "admin" && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono text-xs font-bold uppercase tracking-widest text-givit-ember">Admin</span>
                  </>
                )}
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2.5">
                {cohort && CohortIcon ? (
                  <>
                    <span className="inline-flex min-w-0 items-center gap-2 text-sm font-medium text-givit-ink" title={cohort.tagline}>
                      <CohortIcon className="h-4 w-4 shrink-0 text-givit-ember" strokeWidth={1.75} />
                      {cohort.name}
                    </span>
                    <button type="button" onClick={() => setShowQuiz(true)} className={quietActionClass}>Retake quiz</button>
                  </>
                ) : (
                  <button type="button" onClick={() => setShowQuiz(true)} className={textLinkClass}>
                    Find your gifting personality <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                )}
                <button type="button" onClick={() => setEditingProfile(true)} className={quietActionClass}>Edit profile</button>
                <button type="button" onClick={() => avatarInputRef.current?.click()} disabled={uploadingAvatar} className={quietActionClass}>
                  {uploadingAvatar ? "Uploading photo..." : "Change photo"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );

  return (
    <PageShell className="max-w-6xl">
      <AccountLayout sections={ACCOUNT_SECTIONS} links={QUICK_LINKS} header={profileHeader}>
        {/* Credits: one of the two real surfaces on this page. */}
        <AccountSection id="credits" title="Credits" description="Credits cover AutoGifts once your free ones for the year are used.">
          {!creditStatus ? (
            <p className="text-sm text-muted-foreground">Couldn't load your credit balance right now.</p>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
              <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-end sm:justify-between sm:p-8">
                <div>
                  <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Balance</p>
                  <p className="mt-2 flex items-baseline gap-2.5">
                    <span className="text-5xl font-light tracking-tight tabular-nums text-givit-ink md:text-6xl">{creditStatus.balance}</span>
                    <span className="text-sm text-muted-foreground">credits</span>
                  </p>
                </div>
                {/* "X of Y" alone read as ambiguous (used vs. remaining), so
                    the label spells out "left" explicitly. */}
                <dl className="grid gap-2 text-sm sm:text-right">
                  <div className="flex items-baseline justify-between gap-6 sm:justify-end">
                    <dt className="text-muted-foreground">Free AutoGifts left</dt>
                    <dd className="tabular-nums text-givit-ink">{creditStatus.freeAutogiftRemaining} of {creditStatus.freeAutogiftLimit}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-6 sm:justify-end">
                    <dt className="text-muted-foreground">Gift AI</dt>
                    <dd className="text-success">Always free</dd>
                  </div>
                </dl>
              </div>
              <ul className="divide-y divide-border/40 border-t border-border/40">
                {CREDIT_PACKS.map((pack) => {
                  const perCreditCents = pack.priceCents / pack.credits;
                  const isBestValue = CREDIT_PACKS.length > 1 && perCreditCents === bestPackRate && perCreditCents < worstPackRate;
                  const savingsPct = isBestValue ? Math.round((1 - perCreditCents / worstPackRate) * 100) : 0;
                  return (
                    <li key={pack.id} className="flex flex-wrap items-center gap-x-6 gap-y-3 px-6 py-5 sm:px-8">
                      <div className="min-w-0 flex-1 basis-40">
                        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 font-medium text-givit-ink">
                          {pack.label}
                          {isBestValue && (
                            <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-givit-ember">Best value, save {savingsPct}%</span>
                          )}
                        </p>
                        <p className="mt-0.5 text-sm text-muted-foreground">{pack.credits} credits, ${(perCreditCents / 100).toFixed(2)} each</p>
                      </div>
                      <span className="text-lg font-light tabular-nums text-givit-ink">${(pack.priceCents / 100).toFixed(2)}</span>
                      <Button
                        type="button"
                        variant={isBestValue ? "default" : "outline"}
                        disabled={buyingPack !== null}
                        onClick={() => void handleBuyPack(pack.id)}
                        className={isBestValue ? primaryButtonClass : secondaryButtonClass}
                      >
                        {buyingPack === pack.id ? "Opening checkout..." : `Buy ${pack.credits} credits`}
                      </Button>
                    </li>
                  );
                })}
              </ul>
              <p className="border-t border-border/40 px-6 py-4 text-xs leading-relaxed text-muted-foreground sm:px-8">
                Free AutoGifts are used first and reset every January. After that, credits cover each AutoGift.
              </p>
            </div>
          )}
        </AccountSection>

        {/* Membership -- behind VITE_ENABLE_MEMBERSHIP until the founders
            land on real pricing (see MEMBERSHIP_TIERS in credits.ts and
            credits.mjs). The backend (subscription checkout, webhook sync,
            monthly credit grant) is already live either way; this flag
            only controls whether anyone can SEE the button to buy one. */}
        {MEMBERSHIP_ENABLED && (
          <AccountSection id="membership" title="Membership" description="A monthly plan that keeps your credit balance topped up.">
            {isMember ? (
              <div>
                <p className="flex items-center gap-2.5 font-medium text-givit-ink">
                  <span aria-hidden="true" className="h-2 w-2 rounded-full bg-success" />
                  You're a GIVIT Member
                </p>
                <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
                  {MEMBERSHIP_TIERS[0].monthlyCredits} credits land in your balance every month, automatically. To cancel or change your card, contact us and we'll take care of it.
                </p>
              </div>
            ) : (
              // The one gradient on this page.
              <div className="rounded-2xl border border-givit-ember/30 bg-gradient-to-br from-givit-ember/10 via-card to-card p-6 sm:p-8">
                <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                  <p className="text-2xl font-light tracking-tight text-givit-ink">{MEMBERSHIP_TIERS[0].label}</p>
                  <p className="text-sm text-muted-foreground">
                    <span className="text-2xl font-light tabular-nums text-givit-ink">{MEMBERSHIP_PRICE_LABEL}</span> / month
                  </p>
                </div>
                <ul className="mt-6 space-y-2.5">
                  {MEMBERSHIP_PERKS.map((perk) => (
                    <li key={perk} className="flex items-start gap-3 text-sm text-foreground">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-givit-ember" /> {perk}
                    </li>
                  ))}
                </ul>
                <Button
                  type="button"
                  disabled={startingMembership}
                  onClick={() => void handleStartMembership()}
                  className={`mt-7 ${primaryButtonClass}`}
                >
                  {startingMembership ? "Opening checkout..." : "Become a Member"}
                </Button>
              </div>
            )}
          </AccountSection>
        )}

        <AccountSection id="orders" title="Orders" description="Your most recent purchases and AutoGifts.">
          {orders.length === 0 ? (
            <p className="text-sm text-muted-foreground">No orders yet.</p>
          ) : (
            <>
              <ul className="divide-y divide-border/40">
                {orders.slice(0, 3).map((order: any) => (
                  <li key={order.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 py-3.5 text-sm first:pt-0 sm:grid-cols-[minmax(0,1fr)_9rem_5rem]">
                    <span className="text-foreground">{new Date(order.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>
                    <span className="order-3 col-span-2 flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-muted-foreground sm:order-none sm:col-span-1">
                      <span
                        aria-hidden="true"
                        className={`h-1.5 w-1.5 rounded-full ${order.status === "delivered" ? "bg-success" : order.status === "shipped" ? "bg-givit-teal" : "bg-givit-ember"}`}
                      />
                      {order.status}
                    </span>
                    <span className="text-right font-medium tabular-nums text-givit-ink">${(order.total_cents / 100).toFixed(2)}</span>
                  </li>
                ))}
              </ul>
              <Link href="/orders" className={`mt-4 ${textLinkClass}`}>
                View all {orders.length} order{orders.length !== 1 ? "s" : ""} <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </>
          )}
        </AccountSection>

        <AccountSection id="wishlist" title="Wishlist" description="Gifts you've saved for later.">
          {wishlist.length === 0 ? (
            <p className="text-sm text-muted-foreground">Your wishlist is empty.</p>
          ) : (
            <>
              <ul className="divide-y divide-border/40">
                {wishlist.slice(0, 3).map((item: any) => (
                  <li key={item.id} className="flex items-center gap-4 py-3.5 first:pt-0">
                    {item.product_image && (
                      <img src={item.product_image} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                    )}
                    <p className="min-w-0 flex-1 truncate text-sm text-foreground">{item.product_name}</p>
                    {item.product_price_cents && (
                      <p className="shrink-0 text-sm font-medium tabular-nums text-givit-ink">${(item.product_price_cents / 100).toFixed(2)}</p>
                    )}
                  </li>
                ))}
              </ul>
              {wishlist.length > 3 && (
                <Link href="/wishlist" className={`mt-4 ${textLinkClass}`}>
                  View all {wishlist.length} items <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </>
          )}
        </AccountSection>

        <AccountSection id="addresses" title="Addresses" description="Where your gifts and orders can ship.">
          {addresses.length === 0 ? (
            <p className="text-sm text-muted-foreground">No saved addresses.</p>
          ) : (
            <ul className="divide-y divide-border/40">
              {addresses.map((addr: any) => (
                <li key={addr.id} className="flex items-center gap-4 py-3.5 first:pt-0">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-baseline gap-x-3 text-sm font-medium text-givit-ink">
                      {addr.label}
                      {addr.is_default && <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-givit-ember">Default</span>}
                    </p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{addr.line1}, {addr.city}, {addr.state} {addr.zip}</p>
                  </div>
                  <button type="button" onClick={() => void handleAddressDelete(addr.id)} className={iconButtonClass} aria-label={`Delete address ${addr.label}`}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!addingAddress ? (
            <Button type="button" variant="outline" className={`mt-5 ${secondaryButtonClass}`} onClick={() => { setAddingAddress(true); setAccountNotice(""); }}>
              <Plus className="h-4 w-4" /> Add address
            </Button>
          ) : (
            <form onSubmit={handleAddressSave} className="mt-5 grid gap-4 rounded-xl border border-border/60 p-5">
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                <Field label="Label" htmlFor="address-label">
                  <input id="address-label" value={addressForm.label} onChange={(e) => setAddressForm({ ...addressForm, label: e.target.value })} placeholder="Home" className={inputClass} />
                </Field>
                <Field label="Street address" htmlFor="address-line1">
                  <input id="address-line1" value={addressForm.line1} onChange={(e) => setAddressForm({ ...addressForm, line1: e.target.value })} required autoComplete="address-line1" className={inputClass} />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
                <Field label="City" htmlFor="address-city">
                  <input id="address-city" value={addressForm.city} onChange={(e) => setAddressForm({ ...addressForm, city: e.target.value })} required autoComplete="address-level2" className={inputClass} />
                </Field>
                <Field label="State" htmlFor="address-state">
                  <input id="address-state" value={addressForm.state} onChange={(e) => setAddressForm({ ...addressForm, state: e.target.value })} required autoComplete="address-level1" className={inputClass} />
                </Field>
                <Field label="ZIP" htmlFor="address-zip">
                  <input id="address-zip" value={addressForm.zip} onChange={(e) => setAddressForm({ ...addressForm, zip: e.target.value })} required autoComplete="postal-code" inputMode="numeric" className={inputClass} />
                </Field>
              </div>
              <div className="flex gap-2">
                <Button type="submit" className={primaryButtonClass}>Save address</Button>
                <Button type="button" variant="outline" className={secondaryButtonClass} onClick={() => setAddingAddress(false)}>Cancel</Button>
              </div>
            </form>
          )}
        </AccountSection>

        <AccountSection id="payment" title="Payment" description="Cards used for checkout and AutoGift approvals.">
          {paymentMethods.length === 0 ? (
            <p className="text-sm text-muted-foreground">No saved payment methods.</p>
          ) : (
            <ul className="divide-y divide-border/40">
              {paymentMethods.map((pm: any) => (
                <li key={pm.id} className="flex items-center gap-4 py-3.5 first:pt-0">
                  <p className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 text-sm">
                    <span className="font-medium capitalize text-givit-ink">{pm.card_brand}</span>
                    <span className="tabular-nums text-muted-foreground">•••• {pm.card_last4}</span>
                    {pm.is_default && <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-givit-ember">Default</span>}
                  </p>
                  <button type="button" onClick={() => void handlePaymentDelete(pm.id)} className={iconButtonClass} aria-label={`Delete payment method ending in ${pm.card_last4}`}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!addingPayment ? (
            <Button type="button" variant="outline" className={`mt-5 ${secondaryButtonClass}`} onClick={startAddingPayment}>
              <Plus className="h-4 w-4" /> Add a card
            </Button>
          ) : (
            <div className="mt-5 space-y-4 rounded-xl border border-border/60 p-5">
              <p className="text-xs leading-relaxed text-muted-foreground">Card details are handled directly by Stripe. They never touch GIVIT's own servers.</p>
              {paymentFetching ? (
                <p className="text-sm text-muted-foreground">Loading payment form…</p>
              ) : paymentClientSecret ? (
                <div className="relative">
                  {/* opacity, not `hidden`/display:none -- Stripe's PaymentElement
                      renders in an iframe that needs real layout dimensions to
                      initialize. Hide it under `display:none` and it never gets
                      a size to measure, so it never fires onReady -- which was
                      the actual "form doesn't load" bug: it was waiting to be
                      un-hidden by a ready event it could never reach while hidden. */}
                  {!paymentReady && (
                    <p className="absolute inset-0 flex items-center text-sm text-muted-foreground">Loading payment form…</p>
                  )}
                  <div className={paymentReady ? "" : "opacity-0"}>
                    <Elements stripe={getStripePromise()} options={{ clientSecret: paymentClientSecret }}>
                      <PaymentElementForm ref={paymentFormRef} onReady={handlePaymentReady} onLoadError={handlePaymentLoadError} />
                    </Elements>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-destructive">Couldn't load the payment form. Please try again.</p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button type="button" disabled={!paymentReady || savingPayment} onClick={handlePaymentSave} className={primaryButtonClass}>
                  {savingPayment ? "Saving…" : "Save payment method"}
                </Button>
                <Button type="button" variant="outline" className={secondaryButtonClass} onClick={() => { setAddingPayment(false); setPaymentClientSecret(null); }}>Cancel</Button>
              </div>
            </div>
          )}
        </AccountSection>

        {/* NotificationSettingsCard brings its own surface and heading, so
            this row has no title column of its own to repeat it. */}
        <section id="notifications" tabIndex={-1} aria-label="Notifications" className="scroll-mt-40 border-t border-border/40 py-10 outline-none lg:scroll-mt-28 lg:py-12">
          <NotificationSettingsCard
            userId={user.id}
            defaultLeadDays={profile?.default_reminder_lead_days ?? 35}
            phone={profile?.phone}
            smsOptIn={profile?.sms_opt_in}
            onSmsOptInChange={refresh}
            digestOptIn={profile?.email_digest_opt_in}
            onDigestOptInChange={refresh}
          />
        </section>

        <AccountSection id="security" title="Security" description="Change the password you sign in with.">
          <form onSubmit={handleChangePassword} className="max-w-sm space-y-4">
            <Field label="Current password" htmlFor="account-current-password">
              <input
                id="account-current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                autoComplete="current-password"
                className={inputClass}
              />
            </Field>
            {/* Changing it here needs the current password; this is the way
                out for someone who no longer knows it. */}
            <p className="-mt-2 text-xs text-muted-foreground">
              Don't remember it?{" "}
              <Link href="/forgot-password" className="givit-link font-semibold">Reset it by email</Link>
            </p>
            <Field label="New password" htmlFor="account-new-password" hint="At least 8 characters.">
              <input
                id="account-new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                className={inputClass}
              />
            </Field>
            <Field label="Confirm new password" htmlFor="account-confirm-password">
              <input
                id="account-confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                className={inputClass}
              />
            </Field>
            {passwordError && <p role="alert" className="text-sm text-destructive">{passwordError}</p>}
            {passwordSuccess && <p role="status" className="text-sm text-success">Password updated.</p>}
            <Button type="submit" disabled={changingPassword} className={primaryButtonClass}>
              {changingPassword ? "Updating…" : "Update password"}
            </Button>
          </form>
        </AccountSection>
      </AccountLayout>

      {/* Pinned to the viewport rather than sitting at the top of the page:
          most of the actions that set a notice (deleting a card, saving an
          address) happen far below the fold on this layout. Leaves room on
          the right for the feedback button on small screens. */}
      {accountNotice && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 left-4 right-20 z-40 flex items-start gap-3 rounded-xl bg-foreground px-4 py-3 text-sm text-background shadow-lg sm:right-auto sm:max-w-sm"
        >
          <p className="min-w-0 flex-1 leading-relaxed">{accountNotice}</p>
          <button
            type="button"
            onClick={() => setAccountNotice("")}
            aria-label="Dismiss"
            className="-mr-1 shrink-0 rounded-md p-1 opacity-70 outline-none transition hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-current"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {showQuiz && <GiftingQuizModal onClose={() => setShowQuiz(false)} onComplete={saveCohort} />}
    </PageShell>
  );
}
