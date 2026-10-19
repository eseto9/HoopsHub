import "server-only";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import type { User } from "@/lib/schema";

/** Current user, or null. Reads the request, so call it inside a <Suspense> boundary. */
export async function getCurrentUser(): Promise<User | null> {
  const session = await getSession();
  if (!session) return null;
  return { id: session.user.id, email: session.user.email, name: session.user.name };
}

/** Current user, or redirect to sign-in. Use in pages and in every server action. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return user;
}
