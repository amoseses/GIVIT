import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Shared class strings for the account page, so every input, label and
// text action on it has one height, one radius and one focus treatment.
export const eyebrowClass = "font-mono text-xs font-bold uppercase tracking-widest text-givit-ember";

export const focusRingClass =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-givit-ember";

export const inputClass =
  "h-11 w-full rounded-lg border border-border bg-background px-3.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/60 focus-visible:border-givit-ember focus-visible:ring-2 focus-visible:ring-givit-ember/25";

export const primaryButtonClass = "h-10 rounded-lg bg-givit-ember px-4 text-sm text-white hover:bg-givit-ember-hover";

export const secondaryButtonClass = "h-10 rounded-lg px-4 text-sm";

export const textLinkClass = cn(
  "inline-flex items-center gap-1.5 rounded-sm text-sm font-medium text-givit-ember underline-offset-4 hover:underline",
  focusRingClass,
);

export const quietActionClass = cn(
  "rounded-sm text-sm font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-givit-ember hover:underline",
  focusRingClass,
);

export const iconButtonClass = cn(
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive",
  focusRingClass,
);

type SectionProps = {
  id: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
};

// One settings row: title and description on the left, content on the
// right, a hairline above. Deliberately not a card. tabIndex -1 lets the
// section nav move keyboard focus here after it scrolls.
export function AccountSection({ id, title, description, children }: SectionProps) {
  return (
    <section
      id={id}
      tabIndex={-1}
      aria-labelledby={`${id}-heading`}
      className="scroll-mt-40 border-t border-border/40 py-10 outline-none first:border-t-0 md:grid md:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] md:gap-10 lg:scroll-mt-28 lg:py-12"
    >
      <div>
        <h2 id={`${id}-heading`} className="text-xl font-light tracking-tight text-givit-ink">
          {title}
        </h2>
        {description ? <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{description}</p> : null}
      </div>
      <div className="mt-6 min-w-0 md:mt-0">{children}</div>
    </section>
  );
}

type FieldProps = {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
};

export function Field({ label, htmlFor, hint, className, children }: FieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
