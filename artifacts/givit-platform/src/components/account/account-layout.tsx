import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode, type RefObject } from "react";
import { Link } from "wouter";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { eyebrowClass, focusRingClass } from "@/components/account/account-ui";

export type AccountNavItem = { id: string; label: string };
export type AccountQuickLink = { href: string; label: string };

// The site header is sticky and its height shifts with breakpoints (and
// with the seasonal trim), so the pinned tab row and the sticky sidebar
// read the real height instead of guessing a pixel value.
function useSiteHeaderHeight() {
  const [height, setHeight] = useState(100);
  useEffect(() => {
    const el = document.querySelector<HTMLElement>("header.sticky") ?? document.querySelector<HTMLElement>("header");
    if (!el) return;
    const update = () => setHeight(Math.round(el.getBoundingClientRect().height));
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return height;
}

// Scroll-spy: a section is "current" while it crosses a band just under
// the sticky chrome. The first such section in page order wins. A sentinel
// after the last section covers the end of the page, where a short final
// section can never climb high enough to reach that band.
function useSectionSpy(ids: string[], topOffset: number, endRef: RefObject<HTMLElement | null>) {
  const [activeId, setActiveId] = useState(ids[0] ?? "");
  const visibleRef = useRef<Set<string>>(new Set());
  const atEndRef = useRef(false);
  const lockUntilRef = useRef(0);
  const pickRef = useRef<() => void>(() => {});
  const key = ids.join("|");

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const order = key.split("|").filter(Boolean);
    const visible = visibleRef.current;
    visible.clear();
    atEndRef.current = false;

    const pick = () => {
      if (Date.now() < lockUntilRef.current) return;
      const next = atEndRef.current ? order[order.length - 1] : order.find((id) => visible.has(id));
      if (next) setActiveId(next);
    };
    pickRef.current = pick;

    const sectionObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        pick();
      },
      { rootMargin: `-${topOffset}px 0px -45% 0px`, threshold: 0 },
    );
    for (const id of order) {
      const el = document.getElementById(id);
      if (el) sectionObserver.observe(el);
    }

    const endObserver = new IntersectionObserver((entries) => {
      atEndRef.current = entries.some((entry) => entry.isIntersecting);
      pick();
    });
    if (endRef.current) endObserver.observe(endRef.current);

    return () => {
      sectionObserver.disconnect();
      endObserver.disconnect();
    };
  }, [key, topOffset, endRef]);

  const goTo = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    // Hold the highlight on the clicked item while the smooth scroll passes
    // over the sections in between, then let the observers take over again.
    lockUntilRef.current = Date.now() + 900;
    setActiveId(id);
    el.focus({ preventScroll: true });
    el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    window.setTimeout(() => pickRef.current(), 950);
  }, []);

  return { activeId, goTo };
}

type LayoutProps = {
  sections: AccountNavItem[];
  links: AccountQuickLink[];
  header: ReactNode;
  children: ReactNode;
};

export function AccountLayout({ sections, links, header, children }: LayoutProps) {
  const headerHeight = useSiteHeaderHeight();
  const endRef = useRef<HTMLDivElement>(null);
  const tabRowRef = useRef<HTMLDivElement>(null);
  const { activeId, goTo } = useSectionSpy(sections.map((s) => s.id), headerHeight + 64, endRef);

  // Keep the current tab in view inside the mobile row. Scrolls the row
  // itself (not scrollIntoView) so it never interrupts the page's own
  // smooth scroll.
  useEffect(() => {
    const row = tabRowRef.current;
    if (!row || row.clientWidth === 0) return;
    const tab = row.querySelector<HTMLElement>(`[data-section="${activeId}"]`);
    if (!tab) return;
    const left = tab.offsetLeft - (row.clientWidth - tab.offsetWidth) / 2;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    row.scrollTo({ left: Math.max(0, left), behavior: reduceMotion ? "auto" : "smooth" });
  }, [activeId]);

  // In-page anchors, but without writing the hash: the account page
  // re-scrolls to #credits / #membership whenever its data refreshes, so a
  // hash left behind by this nav would yank the page back later.
  const onNavClick = (id: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    goTo(id);
  };

  return (
    <>
      {header}

      <nav
        aria-label="Account sections"
        style={{ top: headerHeight }}
        className="sticky z-30 -mx-[clamp(1rem,3vw,1.5rem)] border-b border-border/40 bg-givit-page/95 backdrop-blur lg:hidden"
      >
        <div ref={tabRowRef} className="scrollbar-none relative flex gap-6 overflow-x-auto px-[clamp(1rem,3vw,1.5rem)]">
          {sections.map((section) => {
            const active = section.id === activeId;
            return (
              <a
                key={section.id}
                href={`#${section.id}`}
                data-section={section.id}
                aria-current={active ? "true" : undefined}
                onClick={onNavClick(section.id)}
                className={cn(
                  "shrink-0 whitespace-nowrap border-b-2 py-3 text-sm transition-colors",
                  focusRingClass,
                  "focus-visible:-outline-offset-2",
                  active
                    ? "border-givit-ember font-medium text-givit-ink"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {section.label}
              </a>
            );
          })}
        </div>
      </nav>

      <div className="lg:grid lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-16">
        <aside className="hidden lg:block">
          <div
            style={{ top: headerHeight + 16, maxHeight: `calc(100vh - ${headerHeight + 16}px)` }}
            className="scrollbar-none sticky -mx-1 overflow-y-auto px-1 pb-8 pt-12"
          >
            <nav aria-label="Account sections">
              <p className={eyebrowClass}>Settings</p>
              <ul className="mt-4 border-l border-border/40">
                {sections.map((section) => {
                  const active = section.id === activeId;
                  return (
                    <li key={section.id}>
                      <a
                        href={`#${section.id}`}
                        aria-current={active ? "true" : undefined}
                        onClick={onNavClick(section.id)}
                        className={cn(
                          "-ml-px block border-l py-1.5 pl-4 text-sm transition-colors",
                          focusRingClass,
                          active
                            ? "border-givit-ember font-medium text-givit-ink"
                            : "border-transparent text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {section.label}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </nav>

            <nav aria-label="Go to" className="mt-10">
              <p className={eyebrowClass}>Go to</p>
              <ul className="mt-4 space-y-0.5">
                {links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className={cn(
                        "group flex items-center justify-between gap-3 rounded-sm py-1.5 text-sm text-muted-foreground transition-colors hover:text-givit-ink",
                        focusRingClass,
                      )}
                    >
                      <span className="whitespace-nowrap">{link.label}</span>
                      <ArrowUpRight className="h-3.5 w-3.5 shrink-0 opacity-40 transition group-hover:text-givit-ember group-hover:opacity-100" />
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </aside>

        <div className="min-w-0">
          {children}
          <div ref={endRef} aria-hidden="true" className="h-px" />
        </div>
      </div>

      <nav aria-label="Go to" className="border-t border-border/40 pb-4 pt-10 lg:hidden">
        <p className={eyebrowClass}>Go to</p>
        <ul className="mt-3 grid grid-cols-2 gap-x-8 sm:grid-cols-3">
          {links.map((link) => (
            <li key={link.href} className="border-b border-border/40">
              <Link
                href={link.href}
                className={cn(
                  "group flex items-center justify-between gap-3 rounded-sm py-3.5 text-sm font-medium text-givit-ink transition-colors hover:text-givit-ember",
                  focusRingClass,
                )}
              >
                <span className="whitespace-nowrap">{link.label}</span>
                <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-givit-ember" />
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
