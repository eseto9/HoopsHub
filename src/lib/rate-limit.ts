import type { Platform } from "@/lib/schema";

/**
 * Per-platform token bucket. Callers `await acquire(platform)` before each
 * upstream request; it waits when the bucket is empty instead of failing.
 *
 * Limits are conservative defaults. Sleeper asks clients to stay under
 * 1000 calls/minute; Yahoo and ESPN limits are undocumented.
 */
const LIMITS: Record<Platform, { capacity: number; refillPerSec: number }> = {
  sleeper: { capacity: 20, refillPerSec: 10 },
  yahoo: { capacity: 10, refillPerSec: 2 },
  espn: { capacity: 10, refillPerSec: 2 },
};

const buckets = new Map<Platform, { tokens: number; updatedAt: number }>();

export async function acquire(platform: Platform): Promise<void> {
  const { capacity, refillPerSec } = LIMITS[platform];
  for (;;) {
    const now = Date.now();
    const b = buckets.get(platform) ?? { tokens: capacity, updatedAt: now };
    b.tokens = Math.min(capacity, b.tokens + ((now - b.updatedAt) / 1000) * refillPerSec);
    b.updatedAt = now;
    if (b.tokens >= 1) {
      b.tokens -= 1;
      buckets.set(platform, b);
      return;
    }
    buckets.set(platform, b);
    await new Promise((r) => setTimeout(r, Math.ceil(((1 - b.tokens) / refillPerSec) * 1000)));
  }
}
