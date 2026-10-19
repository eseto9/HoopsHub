import Link from "next/link";

/** iOS segmented control built from links (keeps state in the URL). */
export function Segmented({ items, active }: { items: { key: string; label: string; href: string }[]; active: string }) {
  return (
    <nav className="flex overflow-x-auto rounded-[10px] bg-fill p-0.5 [scrollbar-width:none]">
      {items.map((it) => (
        <Link
          key={it.key}
          href={it.href}
          scroll={false}
          aria-current={it.key === active ? "page" : undefined}
          className={`min-w-fit flex-1 rounded-[8px] px-3 py-1.5 text-center text-[13px] font-medium whitespace-nowrap transition-colors ${
            it.key === active ? "bg-surface text-text shadow-[0_1px_3px_rgba(0,0,0,0.12)]" : "text-text/80"
          }`}
        >
          {it.label}
        </Link>
      ))}
    </nav>
  );
}
