"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { markFresh } from "@/lib/cache";
import { PlatformError } from "@/lib/errors";
import { connectPlatform } from "@/lib/services/connections";
import { requireUser } from "@/lib/session";

export type SleeperFormState = { error?: string } | undefined;

/** Sleeper needs only a username: its league data is public. */
export async function connectSleeperAction(_prev: SleeperFormState, formData: FormData): Promise<SleeperFormState> {
  const user = await requireUser();
  const username = String(formData.get("username") ?? "").trim().slice(0, 40);
  try {
    await connectPlatform(user.id, "sleeper", { username });
  } catch (err) {
    return { error: err instanceof PlatformError ? err.message : "Couldn't reach Sleeper. Try again in a minute." };
  }
  await markFresh();
  revalidatePath("/dashboard");
  revalidatePath("/connections");
  redirect("/dashboard");
}
