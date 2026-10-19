import type { Metadata } from "next";
import { Suspense } from "react";
import { removeConnectionAction, removePublicLeagueAction } from "@/app/actions/espn";
import { EspnConnectForm } from "@/components/espn-connect-form";
import { EspnPublicForm } from "@/components/espn-public-form";
import { Globe } from "@/components/icons";
import { Group, IconTile, Row } from "@/components/list";
import { PlatformIcon } from "@/components/platform-badge";
import { SignOutRow } from "@/components/sign-out-button";
import { SleeperConnectForm } from "@/components/sleeper-connect-form";
import { listConnections, listLeaguePreferences } from "@/lib/services/connections";
import { getCurrentUser, requireUser } from "@/lib/session";
import { yahooConfigured } from "@/lib/yahoo/oauth";

export const metadata: Metadata = { title: "Connections" };

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "?"
  );
}

async function Profile() {
  const user = await getCurrentUser();
  if (!user) return null;
  return (
    <div className="list-group flex items-center gap-4 px-4 py-4">
      <span className="flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-[#a5a5ab] to-[#86868c] text-[24px] font-medium text-white">
        {initials(user.name || user.email)}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[22px] font-semibold leading-tight">{user.name || "Hoops Hub"}</span>
        <span className="block truncate text-[15px] text-muted">{user.email}</span>
      </span>
    </div>
  );
}

function RemoveButton({ action, name, value }: { action: (fd: FormData) => Promise<void>; name: string; value: string }) {
  return (
    <form action={action}>
      <input type="hidden" name={name} value={value} />
      <button className="text-[15px] text-danger">Remove</button>
    </form>
  );
}

async function Espn() {
  const user = await requireUser();
  const [connections, prefs] = await Promise.all([listConnections(user.id), listLeaguePreferences(user.id)]);
  const espn = connections.filter((c) => c.platform === "espn");
  const publicLeagues = prefs.filter((p) => p.platform === "espn" && !p.connectionId);
  const needsReconnect = espn.some((c) => c.status === "needs_reconnect");

  return (
    <>
      <Group header="ESPN">
        {espn.map((c) => (
          <Row
            key={c.id}
            icon={<PlatformIcon platform="espn" />}
            title={c.displayName}
            subtitle={
              c.status === "active" ? (
                <span className="text-success">Connected</span>
              ) : (
                <span className="text-warning">Expired. Paste new cookies below.</span>
              )
            }
            value={<RemoveButton action={removeConnectionAction} name="connectionId" value={c.id} />}
          />
        ))}
        {publicLeagues.map((p) => (
          <Row
            key={p.id}
            icon={
              <IconTile color="var(--gray)">
                <Globe />
              </IconTile>
            }
            title={`League ${p.externalLeagueId}`}
            subtitle="Public league"
            value={<RemoveButton action={removePublicLeagueAction} name="leagueId" value={p.externalLeagueId} />}
          />
        ))}
        {espn.length === 0 && publicLeagues.length === 0 && (
          <Row icon={<PlatformIcon platform="espn" />} title="Not connected" subtitle="Connect below to see your leagues" />
        )}
      </Group>

      <section id="espn-account" className="scroll-mt-20">
        <h2 className="mb-1 px-1 text-[22px] font-bold">{needsReconnect ? "Reconnect ESPN" : "Connect Your ESPN Account"}</h2>
        <p className="mb-5 px-1 text-[15px] text-muted">
          For private leagues. Copy two cookies from espn.com once, and every ESPN basketball league on your account shows up
          automatically.
        </p>
        <EspnConnectForm reconnect={needsReconnect} />
      </section>

      <section id="espn-public" className="scroll-mt-20">
        <h2 className="mb-1 px-1 text-[22px] font-bold">Add a Public League</h2>
        <p className="mb-5 px-1 text-[15px] text-muted">
          No account needed, for leagues whose manager turned on “Make league viewable to public”.
        </p>
        <EspnPublicForm />
      </section>
    </>
  );
}

const YAHOO_STATUS: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: "Yahoo connected." },
  pending_approval: { ok: true, text: "Yahoo connected, but Yahoo hasn't approved Hoops Hub's API access yet. Your leagues show up once it does." },
  declined: { ok: false, text: "Yahoo sign-in was cancelled." },
  invalid: { ok: false, text: "That Yahoo sign-in link expired or didn't match. Try again." },
  failed: { ok: false, text: "Yahoo sign-in didn't go through. Try again in a minute." },
  not_configured: { ok: false, text: "Yahoo isn't set up on this server yet." },
};

async function Yahoo({ searchParams }: { searchParams: Promise<{ yahoo?: string }> }) {
  const [user, sp] = await Promise.all([requireUser(), searchParams]);
  const yahoo = (await listConnections(user.id)).filter((c) => c.platform === "yahoo");
  const status = sp.yahoo ? YAHOO_STATUS[sp.yahoo] : undefined;
  const configured = yahooConfigured();

  return (
    <section id="yahoo-account" className="flex scroll-mt-20 flex-col gap-4">
      {status && (
        <p className={`rounded-[12px] px-4 py-3 text-[15px] ${status.ok ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>{status.text}</p>
      )}
      <Group header="Yahoo" footer="Read-only: Yahoo doesn't let other apps change lineups or make moves, so those stay on Yahoo.">
        {yahoo.map((c) => (
          <Row
            key={c.id}
            icon={<PlatformIcon platform="yahoo" />}
            title={c.displayName}
            subtitle={
              c.status === "active" ? <span className="text-success">Connected</span> : <span className="text-warning">Expired. Sign in again below.</span>
            }
            value={<RemoveButton action={removeConnectionAction} name="connectionId" value={c.id} />}
          />
        ))}
        {yahoo.length === 0 && <Row icon={<PlatformIcon platform="yahoo" />} title="Not connected" subtitle="Sign in with Yahoo to see your leagues" />}
      </Group>
      {configured ? (
        // A plain link: the route redirects to Yahoo, which must not be prefetched.
        <a href="/api/yahoo/connect" className="btn btn-primary self-start">
          {yahoo.length ? "Sign in with Yahoo again" : "Sign in with Yahoo"}
        </a>
      ) : (
        <p className="px-1 text-[15px] text-muted">Yahoo isn&apos;t set up on this server yet.</p>
      )}
    </section>
  );
}

async function Sleeper() {
  const user = await requireUser();
  const sleeper = (await listConnections(user.id)).filter((c) => c.platform === "sleeper");
  return (
    <section id="sleeper-account" className="flex scroll-mt-20 flex-col gap-4">
      <Group header="Sleeper" footer="Read-only: Sleeper doesn't let other apps change lineups or make moves, so those stay in the Sleeper app.">
        {sleeper.map((c) => (
          <Row
            key={c.id}
            icon={<PlatformIcon platform="sleeper" />}
            title={c.displayName}
            subtitle={<span className="text-success">Connected</span>}
            value={<RemoveButton action={removeConnectionAction} name="connectionId" value={c.id} />}
          />
        ))}
        {sleeper.length === 0 && <Row icon={<PlatformIcon platform="sleeper" />} title="Not connected" subtitle="Add your username to see your leagues" />}
      </Group>
      {sleeper.length === 0 && <SleeperConnectForm />}
    </section>
  );
}

export default function ConnectionsPage({ searchParams }: PageProps<"/connections">) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <h1 className="large-title px-1">Connections</h1>

      <Suspense fallback={<div className="list-group h-[92px] animate-pulse" />}>
        <Profile />
      </Suspense>

      <Suspense fallback={<div className="list-group h-[120px] animate-pulse" />}>
        <Espn />
      </Suspense>

      <Suspense fallback={<div className="list-group h-[120px] animate-pulse" />}>
        <Yahoo searchParams={searchParams as Promise<{ yahoo?: string }>} />
      </Suspense>

      <Suspense fallback={<div className="list-group h-[120px] animate-pulse" />}>
        <Sleeper />
      </Suspense>

      <div className="list-group">
        <SignOutRow />
      </div>
    </div>
  );
}
