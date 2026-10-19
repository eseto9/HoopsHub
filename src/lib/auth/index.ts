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
    // Local dev also runs over https (npm run dev:https) for Yahoo sign-in, which requires https redirects.
    trustedOrigins: process.env.NODE_ENV === "development" ? ["http://localhost:3000", "https://localhost:3000"] : [],
    emailAndPassword: { enabled: true, minPasswordLength: 8 },
    plugins: [nextCookies()],
  });
}

export function getAuth() {
  return (_auth ??= createAuth());
}

/** Current session in a Server Component / Route Handler, or null. */
export async function getSession() {
  // Read the request first: during prerendering this suspends before anything
  // touches the database, so builds don't need DATABASE_URL.
  const requestHeaders = await headers();
  return getAuth().api.getSession({ headers: requestHeaders });
}
