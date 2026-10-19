"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PlatformError } from "@/lib/errors";
import { addPublicLeague, connectPlatform, deleteConnection, removePublicLeague } from "@/lib/services/connections";
import { lookupPublicLeague } from "@/lib/services/leagues";
import { requireUser } from "@/lib/session";

export type FormState = { error?: string } | undefined;

export type LookupState =
  | { error?: string; league?: { externalId: string; name: string; size: number }; teams?: { externalId: string; name: string; ownerName: string }[] }
  | undefined;

/** Private leagues: validate pasted espn_s2 / SWID and store them encrypted. */
export async function connectEspnAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const espn_s2 = String(formData.get("espn_s2") ?? "");
  const swid = String(formData.get("swid") ?? "");
  try {
    await connectPlatform(user.id, "espn", { espn_s2, swid });
  } catch (err) {
    if (err instanceof PlatformError) {
      return {
        error:
          err.status === 401 || err.status === 403
            ? "ESPN didn't accept those cookies. Make sure you're signed in on espn.com and copy both values again."
            : err.message,
      };
    }
    return { error: "Couldn't reach ESPN. Try again in a minute." };
  }
  revalidatePath("/dashboard");
  redirect("/dashboard");
}

/** Public leagues, step 1: look the league up so the user can pick their team. */
export async function lookupEspnLeagueAction(_prev: LookupState, formData: FormData): Promise<LookupState> {
  await requireUser();
  const raw = String(formData.get("leagueId") ?? "").trim();
  const leagueId = raw.match(/leagueId=(\d+)/)?.[1] ?? raw;
  if (!/^\d{1,12}$/.test(leagueId)) return { error: "Enter the number from your league's URL, after leagueId=." };
  try {
    const { league, teams } = await lookupPublicLeague("espn", leagueId);
    return {
      league: { externalId: league.externalId, name: league.name, size: league.size },
      teams: teams.map((t) => ({ externalId: t.externalId, name: t.name, ownerName: t.ownerName })),
    };
  } catch (err) {
    if (err instanceof PlatformError && (err.status === 401 || err.status === 403)) {
      return { error: "That league is private. Use “Connect your ESPN account” above instead." };
    }
    if (err instanceof PlatformError && err.status === 404) return { error: "No ESPN basketball league with that ID this season." };
    return { error: "Couldn't reach ESPN. Try again in a minute." };
  }
}

/** Public leagues, step 2: save the league with the user's picked team. */
export async function addEspnLeagueAction(formData: FormData) {
  const user = await requireUser();
  const leagueId = String(formData.get("leagueId") ?? "");
  const teamId = String(formData.get("teamId") ?? "");
  if (!/^\d+$/.test(leagueId) || !/^\d+$/.test(teamId)) return;
  await addPublicLeague(user.id, "espn", leagueId, teamId);
  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function removeConnectionAction(formData: FormData) {
  const user = await requireUser();
  await deleteConnection(user.id, String(formData.get("connectionId") ?? ""));
  revalidatePath("/connections");
  revalidatePath("/dashboard");
}

export async function removePublicLeagueAction(formData: FormData) {
  const user = await requireUser();
  await removePublicLeague(user.id, "espn", String(formData.get("leagueId") ?? ""));
  revalidatePath("/connections");
  revalidatePath("/dashboard");
}
