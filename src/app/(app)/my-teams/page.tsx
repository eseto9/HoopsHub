import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AutoRefresh } from "@/components/auto-refresh";
import { MyTeamsView } from "@/components/my-teams-view";
import { getMyTeams } from "@/lib/services/leagues";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "My Teams" };

async function Teams() {
  const user = await requireUser();
  const { sections, problems } = await getMyTeams(user.id);
  if (sections.length === 0) {
    return (
      <div className="flex flex-col items-center px-6 py-16 text-center">
        <p className="text-[22px] font-bold">No Teams Yet</p>
        <p className="mt-2 max-w-xs text-[15px] text-muted">
          {problems.length ? problems[0].message : "Connect a league and pick your team to see all your players here."}
        </p>
        <Link href="/connections" className="btn btn-primary mt-6">
          Connect a League
        </Link>
      </div>
    );
  }
  return (
    <>
      <MyTeamsView sections={sections} />
      {sections.some((s) => s.matchup?.status === "live") && <AutoRefresh seconds={60} />}
    </>
  );
}

export default function MyTeamsPage() {
  return (
    <div className="flex flex-col gap-6">
      <header className="px-1">
        <h1 className="large-title">My Teams</h1>
        <p className="mt-1 text-[15px] text-muted">Every player you roster, across all your leagues.</p>
      </header>
      <Suspense fallback={<div className="list-group h-96 animate-pulse" />}>
        <Teams />
      </Suspense>
    </div>
  );
}
