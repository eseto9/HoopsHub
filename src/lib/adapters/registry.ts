import "server-only";
import type { Platform } from "@/lib/schema";
import { espnAdapter } from "./espn/adapter";
import { yahooAdapter } from "./yahoo/adapter";
import type { PlatformAdapter } from "./types";

const adapters: Partial<Record<Platform, PlatformAdapter>> = {
  espn: espnAdapter,
  yahoo: yahooAdapter,
};

export function getAdapter(platform: Platform): PlatformAdapter {
  const adapter = adapters[platform];
  if (!adapter) throw new Error(`${platform} is not supported yet`);
  return adapter;
}
