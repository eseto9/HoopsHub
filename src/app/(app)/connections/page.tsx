import type { Metadata } from "next";
import { Suspense } from "react";
import { removeConnectionAction, removePublicLeagueAction } from "@/app/actions/espn";
import { EspnConnectForm } from "@/components/espn-connect-form";
import { EspnPublicForm } from "@/components/espn-public-form";
import { Globe } from "@/components/icons";
import { Group, IconTile, Row } from "@/components/list";
import { PlatformIcon } from "@/components/platform-badge";
import { SignOutRow } from "@/components/sign-out-button";
import { listConnections, listLeaguePreferences } from "@/lib/services/connections";
import { getCurrentUser, requireUser } from "@/lib/session";

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

export default function ConnectionsPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <h1 className="large-title px-1">Connections</h1>

      <Suspense fallback={<div className="list-group h-[92px] animate-pulse" />}>
        <Profile />
      </Suspense>

      <Suspense fallback={<div className="list-group h-[120px] animate-pulse" />}>
        <Espn />
      </Suspense>

      <Group header="Coming soon" footer="Yahoo uses Sign in with Yahoo. Sleeper only needs your username.">
        <Row icon={<PlatformIcon platform="yahoo" />} title="Yahoo" value={<span className="text-[15px]">Soon</span>} />
        <Row icon={<PlatformIcon platform="sleeper" />} title="Sleeper" value={<span className="text-[15px]">Soon</span>} />
      </Group>

      <div className="list-group">
        <SignOutRow />
      </div>
    </div>
  );
}
