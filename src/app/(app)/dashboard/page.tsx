import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Exclamation, Plus } from "@/components/icons";
import { LeagueCard } from "@/components/league-card";
import { Group, IconTile, Row } from "@/components/list";
import { platformLabel } from "@/components/platform-badge";
import { getDashboard } from "@/lib/services/leagues";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Leagues" };

function Skeleton() {
  return (
    <div className="grid gap-8 md:grid-cols-2" aria-label="Loading leagues">
      {[0, 1].map((i) => (
        <div key={i}>
          <div className="mb-2 ml-5 h-3 w-28 rounded bg-surface-2" />
          <div className="list-group h-[212px] animate-pulse" />
        </div>
      ))}
    </div>
  );
}

async function Leagues() {
  const user = await requireUser();
  const { leagues, problems, connections } = await getDashboard(user.id);

  return (
    <div className="flex flex-col gap-8">
      {problems.length > 0 && (
        <Group>
          {problems.map((p, i) => (
            <Row
              key={i}
              icon={
                <IconTile color={p.kind === "reconnect" ? "var(--warning)" : "var(--danger)"}>
                  <Exclamation />
                </IconTile>
              }
              title={p.kind === "reconnect" ? `Reconnect ${platformLabel(p.platform)}` : (p.leagueName ?? platformLabel(p.platform))}
              subtitle={p.message}
              href={p.kind === "reconnect" ? "/connections#espn-account" : undefined}
              value={p.kind === "reconnect" ? <span className="badge">1</span> : undefined}
            />
          ))}
        </Group>
      )}

      {leagues.length > 0 ? (
        <div className="grid gap-8 md:grid-cols-2">
          {leagues.map((l) => (
            <LeagueCard key={l.league.id} data={l} />
          ))}
        </div>
      ) : (
        problems.length === 0 && (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <p className="text-[22px] font-bold">{connections.length ? "No Basketball Leagues" : "No Leagues Yet"}</p>
            <p className="mt-2 max-w-xs text-[15px] text-muted">
              {connections.length
                ? "Your connected account isn't in any fantasy basketball leagues this season."
                : "Connect your ESPN account or add a public league to see it here."}
            </p>
            <Link href="/connections" className="btn btn-primary mt-6">
              Connect a League
            </Link>
          </div>
        )
      )}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-3 px-1">
        <h1 className="large-title">Leagues</h1>
        <Link
          href="/connections"
          aria-label="Add a league"
          className="mb-1.5 flex h-9 w-9 items-center justify-center rounded-full bg-fill text-accent"
        >
          <Plus />
        </Link>
      </div>
      <Suspense fallback={<Skeleton />}>
        <Leagues />
      </Suspense>
    </div>
  );
}
