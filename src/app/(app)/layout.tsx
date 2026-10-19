import { Suspense } from "react";
import { Logo } from "@/components/logo";
import { TabBar, TopNav } from "@/components/nav-links";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 hidden border-b-[0.5px] border-separator bg-[var(--bar)] backdrop-blur-xl backdrop-saturate-150 sm:block">
        <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between px-5 py-3 lg:px-8">
          <Logo href="/dashboard" />
          {/* Nav reads the URL to highlight the active tab; dynamic routes need a boundary. */}
          <Suspense fallback={<TopNav active={null} />}>
            <TopNav />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 pt-6 pb-28 sm:px-6 sm:pt-10 sm:pb-16 lg:px-8">{children}</main>
      <Suspense fallback={<TabBar active={null} />}>
        <TabBar />
      </Suspense>
    </div>
  );
}
