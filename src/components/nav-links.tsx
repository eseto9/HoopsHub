"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Basketball, LinkIcon } from "./icons";

const TABS = [
  { href: "/dashboard", label: "Leagues", Icon: Basketball },
  { href: "/connections", label: "Connections", Icon: LinkIcon },
];

function useActive() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname.startsWith(`${href}/`);
}

/** Desktop: text links in the top bar. */
export function TopNav() {
  const isActive = useActive();
  return (
    <nav className="hidden gap-6 sm:flex">
      {TABS.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          aria-current={isActive(href) ? "page" : undefined}
          className={`text-[15px] ${isActive(href) ? "font-semibold text-accent" : "text-muted hover:text-text"}`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

/** Phones: iOS-style bottom tab bar. */
export function TabBar() {
  const isActive = useActive();
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
            aria-current={isActive(href) ? "page" : undefined}
            className={`flex flex-1 flex-col items-center gap-0.5 pt-2 pb-1.5 text-[10px] font-medium ${
              isActive(href) ? "text-accent" : "text-gray"
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
