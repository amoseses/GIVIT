import { useState, useRef } from "react";
import { useLocation, Link } from "wouter";
import { useTheme } from "next-themes";
import { CircleUser, Check, Circle } from "lucide-react";
import { generatedProfilePhotoUrl } from "@/lib/avatar";
import { useAuth } from "@/lib/auth/use-auth";
import { createClient } from "@/lib/supabase/client";
import { updateProfile } from "@/lib/supabase/db";
import { getCohort } from "@/lib/data/gifting-cohorts";
import { useProfileCompletion, type CompletionStep } from "@/lib/hooks/use-profile-completion";
import { GiftingQuizModal } from "@/components/personalization/gifting-quiz-modal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { UserRole } from "@/types/database";

type Props = {
  loggedIn: boolean;
  email?: string;
  displayName?: string;
  role?: UserRole;
  avatarUrl?: string | null;
};

const RING_RADIUS = 18.5;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export function HeaderProfileButton({ loggedIn, email, displayName, role, avatarUrl: realAvatarUrl }: Props) {
  const [, navigate] = useLocation();
  const { user, refresh } = useAuth();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== "light";
  const iconClass = isDark ? "text-white hover:bg-white/10" : "text-givit-ink hover:bg-black/5";

  const [open, setOpen] = useState(false);
  const [showQuiz, setShowQuiz] = useState(false);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completion = useProfileCompletion();

  const hoveringRef = useRef(false);

  const handleMouseEnter = () => {
    hoveringRef.current = true;
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setOpen(true);
  };

  const handleMouseLeave = () => {
    hoveringRef.current = false;
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => setOpen(false), 150);
  };

  // Hovering opens the menu, so the click that usually follows used to
  // toggle it straight back shut -- the avatar looked broken to anyone who
  // clicked it. While the pointer is over the menu, ignore the close; it
  // closes on mouse-leave, outside click (pointer is elsewhere by then) or
  // when a link is chosen (go() below).
  const handleOpenChange = (next: boolean) => {
    if (!next && hoveringRef.current) return;
    setOpen(next);
  };

  // Close first, then navigate: a link chosen while hovering would
  // otherwise leave the menu hanging open over the next page.
  const go = (path: string) => {
    hoveringRef.current = false;
    setOpen(false);
    navigate(path);
  };

  if (!loggedIn) {
    return (
      <Link
        href="/login"
        aria-label="Sign in"
        className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors ${iconClass}`}
      >
        <CircleUser className="h-6 w-6" />
      </Link>
    );
  }

  const isAdmin = role === "admin";
  const avatarUrl = realAvatarUrl || generatedProfilePhotoUrl(email || displayName);
  const cohort = getCohort(completion.cohortId);
  // The ring only exists while there is something left to do, and only once
  // the real numbers are in -- a complete profile just shows a clean avatar.
  const showRing = completion.loaded && !completion.complete;

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    navigate("/");
    window.location.reload();
  }

  async function handleSaveCohort(cohortId: string) {
    if (!user) return;
    await updateProfile(user.id, { gifting_cohort: cohortId });
    refresh();
    setShowQuiz(false);
  }

  function runStep(step: CompletionStep) {
    if (step.href) {
      go(step.href);
    } else {
      hoveringRef.current = false;
      setOpen(false);
      setShowQuiz(true);
    }
  }

  return (
    <>
      <div
        className="relative flex items-center justify-center"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <DropdownMenu open={open} onOpenChange={handleOpenChange}>
          <DropdownMenuTrigger
            aria-label={showRing ? `Profile menu, ${completion.percent}% complete` : "Profile menu"}
            className={`relative flex h-11 w-11 items-center justify-center rounded-full transition-all outline-none ${iconClass}`}
          >
            <img
              src={avatarUrl}
              alt={displayName || email || "Account"}
              className="h-8 w-8 rounded-full bg-white object-cover"
            />

            {showRing && (
              <svg className="pointer-events-none absolute inset-0 h-11 w-11" viewBox="0 0 44 44" aria-hidden="true">
                <circle
                  cx="22"
                  cy="22"
                  r={RING_RADIUS}
                  fill="none"
                  stroke={isDark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.10)"}
                  strokeWidth="2"
                />
                {/* Starts at 12 o'clock and fills clockwise. */}
                <circle
                  cx="22"
                  cy="22"
                  r={RING_RADIUS}
                  fill="none"
                  stroke="var(--givit-ember)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeDasharray={RING_CIRCUMFERENCE}
                  strokeDashoffset={RING_CIRCUMFERENCE * (1 - completion.percent / 100)}
                  transform="rotate(-90 22 22)"
                  className="transition-all duration-500 ease-out"
                />
              </svg>
            )}
          </DropdownMenuTrigger>

          <DropdownMenuContent
            align="end"
            className="w-72 rounded-2xl p-3 shadow-xl backdrop-blur-md"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <DropdownMenuLabel className="flex items-center justify-between px-2 py-1 font-normal">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-givit-ink">{displayName || "Account"}</p>
                {email ? <p className="truncate text-xs text-muted-foreground">{email}</p> : null}
              </div>
              {cohort && (
                <span className="ml-2 text-lg" title={cohort.name}>
                  {cohort.emoji}
                </span>
              )}
            </DropdownMenuLabel>

            {completion.loaded && (
              <>
                <DropdownMenuSeparator className="my-2" />
                {completion.complete ? (
                  <div className="flex items-center justify-between rounded-xl bg-muted/50 px-3 py-2.5 text-xs">
                    <span className="flex items-center gap-2 font-medium text-foreground">
                      <Check className="h-3.5 w-3.5 text-givit-ember" /> Your profile is complete
                    </span>
                    <button
                      type="button"
                      onClick={() => { hoveringRef.current = false; setOpen(false); setShowQuiz(true); }}
                      className="font-semibold text-givit-ember hover:underline"
                    >
                      Retake quiz
                    </button>
                  </div>
                ) : (
                  <div className="rounded-xl bg-muted/50 p-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-foreground">Finish your profile</span>
                      <span className="tabular-nums text-muted-foreground">{completion.doneCount} of {completion.total}</span>
                    </div>
                    <div
                      className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-border"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={completion.percent}
                    >
                      <div className="h-full rounded-full bg-givit-ember transition-all duration-500" style={{ width: `${completion.percent}%` }} />
                    </div>
                    <ul className="mt-2 space-y-0.5">
                      {completion.steps.map((step) => (
                        <li key={step.key}>
                          <button
                            type="button"
                            onClick={() => runStep(step)}
                            className="flex w-full items-center justify-between gap-2 rounded-lg px-1.5 py-1.5 text-left text-xs transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              {step.done ? (
                                <Check className="h-3.5 w-3.5 shrink-0 text-givit-ember" />
                              ) : (
                                <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                              )}
                              <span className={step.done ? "truncate text-foreground" : "truncate text-muted-foreground"}>
                                {step.key === "quiz" && cohort ? cohort.name : step.label}
                              </span>
                            </span>
                            {step.done ? (
                              step.key === "quiz" ? <span className="shrink-0 text-[11px] text-muted-foreground">Retake</span> : null
                            ) : (
                              <span className="shrink-0 text-[11px] font-semibold text-givit-ember">{step.cta}</span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}

            <DropdownMenuSeparator className="my-2" />

            <DropdownMenuItem onClick={() => go("/account")}>Account</DropdownMenuItem>
            <DropdownMenuItem onClick={() => go("/orders")}>Orders</DropdownMenuItem>
            <DropdownMenuItem onClick={() => go("/wishlist")}>Wishlist</DropdownMenuItem>
            {isAdmin ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => go("/manager")}>Manager console</DropdownMenuItem>
                <DropdownMenuItem onClick={() => go("/admin")}>Admin products</DropdownMenuItem>
              </>
            ) : (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => go("/secret-santa")}>Secret Santa</DropdownMenuItem>
                <DropdownMenuItem onClick={() => go("/people")}>People</DropdownMenuItem>
                <DropdownMenuItem onClick={() => go("/concierge")}>AutoGift</DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => { hoveringRef.current = false; setOpen(false); void signOut(); }}>Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {showQuiz && (
        <GiftingQuizModal
          onClose={() => setShowQuiz(false)}
          onComplete={handleSaveCohort}
        />
      )}
    </>
  );
}
