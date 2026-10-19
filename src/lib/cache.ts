/**
 * Short-TTL cache for platform responses.
 *
 * In-memory per server instance. On Netlify each function instance has its
 * own memory, so this mainly dedupes bursts of requests. If cross-instance
 * caching becomes necessary we can swap the store for Postgres or Netlify Blobs
 * behind the same interface.
 */
interface Entry {
  value: unknown;
  expiresAt: number;
}

const MAX_ENTRIES = 500;
const store = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

export async function cached<T>(key: string, ttlSeconds: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expiresAt > now) return hit.value as T;

  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;

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

  inflight.set(key, promise);
  return promise;
}

export function invalidate(prefix: string): void {
  for (const key of store.keys()) if (key.startsWith(prefix)) store.delete(key);
}
