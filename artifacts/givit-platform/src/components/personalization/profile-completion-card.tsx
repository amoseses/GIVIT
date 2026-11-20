import { useState } from "react";
import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/lib/auth/use-auth";
import { useRecipients } from "@/lib/hooks/use-recipients";
import { updateProfile } from "@/lib/supabase/db";
import { GiftingQuizModal } from "@/components/personalization/gifting-quiz-modal";

const DISMISS_KEY = "givit-profile-completion-dismissed";

type Step = { label: string; done: boolean; href?: string; action?: () => void };

// Every step here reflects something real on the profile/account -- no
// fabricated "5 more steps!" filler. Dismissible once completion stops
// mattering to that person, same one-shot localStorage pattern as the
// other post-onboarding nudges (LoginPrompt, WelcomeTour).
//
// Deliberately not a card with a progress bar and a grid of checkboxes:
// that is the stock "onboarding widget". This is one line between two
// hairlines -- five ticks for where you are, the single next thing to
// do, and the full list only if you ask for it.
export function ProfileCompletionCard() {
  const { user, profile, refresh } = useAuth();
  const { recipients } = useRecipients(user);
  const [showQuiz, setShowQuiz] = useState(false);
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try { return window.localStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; }
  });

  if (!user || dismissed) return null;

  const steps: Step[] = [
    { label: "Add your name", done: Boolean(profile?.full_name?.trim()), href: "/account" },
    { label: "Add a phone number", done: Boolean(profile?.phone?.trim()), href: "/account" },
    { label: "Add a profile photo", done: Boolean(profile?.avatar_url), href: "/account" },
    { label: "Add your first person", done: recipients.length > 0, href: "/people" },
    { label: "Take the gifting personality quiz", done: Boolean(profile?.gifting_cohort), action: () => setShowQuiz(true) },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done);

  if (!next) return null;

  async function saveCohort(cohortId: string) {
    if (!user) return;
    await updateProfile(user.id, { gifting_cohort: cohortId });
    refresh();
    setShowQuiz(false);
  }

  function dismiss() {
    try { window.localStorage.setItem(DISMISS_KEY, "1"); } catch { /* storage unavailable */ }
    setDismissed(true);
  }

  const stepClass = "inline-flex items-center gap-1.5 font-semibold text-foreground transition-colors hover:text-givit-ember";
  const renderStep = (step: Step, withArrow: boolean) => {
    const body = <>{step.label}{withArrow && <ArrowRight className="h-3.5 w-3.5" />}</>;
    return step.action
      ? <button type="button" onClick={step.action} className={stepClass}>{body}</button>
      : <Link href={step.href!} className={stepClass}>{body}</Link>;
  };

  return (
    <>
      <div className="border-y border-border/50 py-3.5">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <div className="flex items-center gap-2.5" aria-label={`Profile ${doneCount} of ${steps.length} complete`}>
            <span className="flex gap-1" aria-hidden="true">
              {steps.map((step) => (
                <span key={step.label} className={`h-3 w-[3px] rounded-full ${step.done ? "bg-givit-ember" : "bg-border"}`} />
              ))}
            </span>
            <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Profile {doneCount}/{steps.length}
            </span>
          </div>
          <p className="flex items-center gap-2">
            <span className="text-muted-foreground">Next</span>
            {renderStep(next, true)}
          </p>
          <div className="ml-auto flex items-center gap-4 text-xs text-muted-foreground">
            <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="hover:text-foreground">
              {open ? "Hide steps" : "All steps"}
            </button>
            <button type="button" onClick={dismiss} className="hover:text-foreground">Dismiss</button>
          </div>
        </div>
        {open && (
          <ol className="mt-3 grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
            {steps.map((step, i) => (
              <li key={step.label} className="flex items-baseline gap-2.5">
                <span className={`font-mono text-[10px] font-bold tabular-nums ${step.done ? "text-givit-ember" : "text-muted-foreground/60"}`}>{String(i + 1).padStart(2, "0")}</span>
                {step.done ? <span className="text-muted-foreground line-through decoration-border">{step.label}</span> : renderStep(step, false)}
              </li>
            ))}
          </ol>
        )}
      </div>
      {showQuiz && <GiftingQuizModal onClose={() => setShowQuiz(false)} onComplete={saveCohort} />}
    </>
  );
}
