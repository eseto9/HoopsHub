/**
 * Short-TTL cache for platform responses.
 *
 * In-memory per server instance. On Netlify each function instance has its
 * own memory, so a write handled by one instance can't clear another
 * instance's copy. To keep a user from seeing stale data right after their
 * own change, server actions set a short-lived "fresh" cookie (markFresh) and
 * every read during that window skips the cache.
 */
interface Entry {
  value: unknown;
  expiresAt: number;
}

const MAX_ENTRIES = 500;
const store = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

export const FRESH_COOKIE = "hh_fresh";
const FRESH_SECONDS = 90;

/** True when the current request belongs to a user who just made a change. */
async function wantsFresh(): Promise<boolean> {
  try {
    const { cookies } = await import("next/headers");
    return (await cookies()).has(FRESH_COOKIE);
  } catch {
    return false; // outside a request (scripts, tests)
  }
}

/** Call from a server action after a successful write. */
export async function markFresh(): Promise<void> {
  const { cookies } = await import("next/headers");
  (await cookies()).set(FRESH_COOKIE, "1", { maxAge: FRESH_SECONDS, httpOnly: true, sameSite: "lax", path: "/" });
}

export async function cached<T>(key: string, ttlSeconds: number, load: () => Promise<T>): Promise<T> {
  const fresh = await wantsFresh();
  if (!fresh) {
    const hit = store.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.value as T;
    const pending = inflight.get(key);
    if (pending) return pending as Promise<T>;
  }

  const promise = load()
    .then((value) => {
      if (store.size >= MAX_ENTRIES) {
        const oldest = store.keys().next().value;
        if (oldest !== undefined) store.delete(oldest);
      }
      store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
      return value;
    })
    .finally(() => inflight.delete(key));

  if (!fresh) inflight.set(key, promise);
  return promise;
}

export function invalidate(prefix: string): void {
  for (const key of store.keys()) if (key.startsWith(prefix)) store.delete(key);
}
