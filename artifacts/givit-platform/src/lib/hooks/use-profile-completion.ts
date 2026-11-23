import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/lib/auth/use-auth";
import { RECIPIENTS_CHANGED_EVENT, getGiftRecipients } from "@/lib/supabase/db";

export type CompletionStep = {
  key: "name" | "phone" | "photo" | "person" | "quiz";
  label: string;
  done: boolean;
  /** Where the step is completed. Absent for the quiz, which opens a modal. */
  href?: string;
  /** Short button copy shown while the step is still open. */
  cta: string;
};

// The one definition of "how complete is this profile", shared by the
// header avatar ring + dropdown and the dashboard card. They used to each
// compute it separately -- the header only re-checked on a profile change,
// so adding someone on /people left the ring stale until something else
// happened to refresh the profile.
//
// Every step reflects something real on the account (no filler steps), and
// nothing is reported until the recipient count has actually loaded, so a
// returning user never sees a wrong, lower number flash before the right
// one arrives.
export function useProfileCompletion() {
  const { user, profile } = useAuth();
  const [recipientCount, setRecipientCount] = useState<number | null>(null);

  useEffect(() => {
    if (!user?.id) {
      setRecipientCount(null);
      return;
    }
    let cancelled = false;
    const load = () => {
      getGiftRecipients(user.id)
        .then((rows) => { if (!cancelled) setRecipientCount(rows.length); })
        // A failed fetch keeps whatever we last knew rather than claiming
        // "zero people" and marking the step undone.
        .catch(() => {});
    };
    load();
    window.addEventListener(RECIPIENTS_CHANGED_EVENT, load);
    window.addEventListener("focus", load);
    return () => {
      cancelled = true;
      window.removeEventListener(RECIPIENTS_CHANGED_EVENT, load);
      window.removeEventListener("focus", load);
    };
  }, [user?.id]);

  return useMemo(() => {
    // Straight to the account page's edit form, not just the page: the
    // fields these three steps ask for live behind "Edit profile".
    const steps: CompletionStep[] = [
      { key: "name", label: "Add your name", done: Boolean(profile?.full_name?.trim()), href: "/account?edit=1", cta: "Add" },
      { key: "phone", label: "Add a phone number", done: Boolean(profile?.phone?.trim()), href: "/account?edit=1", cta: "Add" },
      { key: "photo", label: "Add a profile photo", done: Boolean(profile?.avatar_url), href: "/account?edit=1", cta: "Add" },
      { key: "person", label: "Add your first person", done: (recipientCount ?? 0) > 0, href: "/people", cta: "Add" },
      { key: "quiz", label: "Take the gifting personality quiz", done: Boolean(profile?.gifting_cohort), cta: "Start" },
    ];
    const doneCount = steps.filter((s) => s.done).length;
    return {
      steps,
      doneCount,
      total: steps.length,
      percent: Math.round((doneCount / steps.length) * 100),
      next: steps.find((s) => !s.done) ?? null,
      complete: doneCount === steps.length,
      cohortId: (profile?.gifting_cohort as string | null | undefined) ?? null,
      // Only trustworthy once both the profile and the recipient count are in.
      loaded: Boolean(user && profile && recipientCount !== null),
    };
  }, [user, profile, recipientCount]);
}
