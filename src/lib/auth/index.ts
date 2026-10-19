import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { headers } from "next/headers";
import { getDb, schema } from "@/lib/db/client";

let _auth: ReturnType<typeof createAuth> | undefined;

function createAuth() {
  return betterAuth({
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL,
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    emailAndPassword: { enabled: true, minPasswordLength: 8 },
    plugins: [nextCookies()],
  });
}

export function getAuth() {
  return (_auth ??= createAuth());
}

/** Current session in a Server Component / Route Handler, or null. */
export async function getSession() {
  return getAuth().api.getSession({ headers: await headers() });
}
