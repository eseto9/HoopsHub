"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Basketball, LinkIcon } from "./icons";

const TABS = [
  { href: "/dashboard", label: "Leagues", Icon: Basketball, match: ["/dashboard", "/leagues"] },
  { href: "/connections", label: "Connections", Icon: LinkIcon, match: ["/connections"] },
];

function useActiveHref() {
  const pathname = usePathname();
  return TABS.find((t) => t.match.some((m) => pathname === m || pathname.startsWith(`${m}/`)))?.href ?? null;
}

function TopNavView({ active }: { active: string | null }) {
  return (
    <nav className="hidden gap-6 sm:flex">
      {TABS.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          aria-current={active === href ? "page" : undefined}
          className={`text-[15px] ${active === href ? "font-semibold text-accent" : "text-muted hover:text-text"}`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

function TabBarView({ active }: { active: string | null }) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t-[0.5px] border-separator bg-[var(--bar)] backdrop-blur-xl backdrop-saturate-150 sm:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex max-w-md">
        {TABS.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={active === href ? "page" : undefined}
            className={`flex flex-1 flex-col items-center gap-0.5 pt-2 pb-1.5 text-[10px] font-medium ${
              active === href ? "text-accent" : "text-gray"
            }`}
          >
            <Icon className="h-6 w-6" />
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

function LiveTopNav() {
  return <TopNavView active={useActiveHref()} />;
}
function LiveTabBar() {
  return <TabBarView active={useActiveHref()} />;
}

/** Desktop: text links in the top bar. `active={null}` renders a static fallback. */
export function TopNav({ active }: { active?: string | null }) {
  return active === undefined ? <LiveTopNav /> : <TopNavView active={active} />;
}

/** Phones: iOS-style bottom tab bar. `active={null}` renders a static fallback. */
export function TabBar({ active }: { active?: string | null }) {
  return active === undefined ? <LiveTabBar /> : <TabBarView active={active} />;
}
