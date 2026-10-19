# Hoops Hub

A fantasy basketball dashboard that brings your ESPN, Yahoo and Sleeper leagues into one place: rosters, matchups, standings and free agents across every league.

**Status:** ESPN works: private leagues via pasted cookies, public leagues by ID, league pages with player stats, and lineup editing (Move → Here → confirm, sent to ESPN). Add/drop and trades are next, then Yahoo and Sleeper.

## Stack

Next.js 16 (App Router, Cache Components) · TypeScript · Tailwind v4 · Postgres on Neon · Drizzle ORM · Better Auth · Vitest. Deploys to Netlify.

## Setup

1. Install dependencies (Node 24+):

   ```bash
   npm install
   ```

2. Create a free Postgres database at [neon.tech](https://neon.tech) and copy its **pooled** connection string.

3. Copy `.env.example` to `.env.local` and fill it in:

   | Variable | What it is |
   | --- | --- |
   | `DATABASE_URL` | Neon pooled connection string |
   | `BETTER_AUTH_SECRET` | Random secret for sessions |
   | `BETTER_AUTH_URL` | App URL, e.g. `http://localhost:3000` |
   | `ENCRYPTION_KEY` | 32 random bytes, base64. Encrypts stored platform credentials |
   | `ESPN_S2`, `ESPN_SWID` | Optional, only for `npm run fetch:espn` during development |

   Generate secrets with:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```

4. Create the database tables:

   ```bash
   npm run db:migrate
   ```

5. Start the app at http://localhost:3000:

   ```bash
   npm run dev
   ```

## Connecting ESPN

ESPN has no official API, so Hoops Hub uses ESPN's own fantasy endpoints.

- **Public leagues:** Connections → *Add a Public League* → paste the league ID (the number after `leagueId=` in the league URL) and pick your team.
- **Private leagues:** Connections → *Connect Your ESPN Account*. On a computer, sign in to espn.com, open DevTools → Application → Cookies → `https://www.espn.com`, and copy the `espn_s2` and `SWID` values into the form. They're encrypted at rest (AES-256-GCM) and only sent to ESPN. When they expire, the app asks you to reconnect.

## Scripts

| Command | Does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm test` | Unit tests (normalizers run against real fixtures) |
| `npm run typecheck` | TypeScript |
| `npm run db:generate` / `db:migrate` | Drizzle migrations |
| `npm run fetch:espn -- <leagueId>` | Capture real ESPN responses into `fixtures/espn` |
| `npm run fixtures:anonymize` | Replace leaguemates' names in fixtures before committing |

## Architecture

Each platform implements one adapter interface (`src/lib/adapters/types.ts`) that normalizes raw responses into a unified schema (`src/lib/schema`). The UI only ever reads the unified types. Platform responses are cached briefly and rate-limited per platform.

```
src/lib/adapters/<platform>/   raw types, normalizers, client, adapter
src/lib/services/              connections + cross-league dashboard
src/app/                       pages, server actions
fixtures/                      real (anonymized) API responses for tests
```
