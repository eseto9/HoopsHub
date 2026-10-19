import type { Platform } from "@/lib/schema";

/** Thrown when stored credentials are expired/invalid. The UI shows a "Reconnect" prompt. */
export class ReconnectRequiredError extends Error {
  constructor(
    public readonly platform: Platform,
    public readonly connectionId: string,
    message = "Connection needs to be re-authorized",
  ) {
    super(message);
    this.name = "ReconnectRequiredError";
  }
}

/** Upstream platform returned an error or unexpected response. Message must not include secrets. */
export class PlatformError extends Error {
  constructor(
    public readonly platform: Platform,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "PlatformError";
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}
