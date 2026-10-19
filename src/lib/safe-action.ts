/**
 * Calls a server action from the client without crashing the page if the
 * request itself fails, e.g. a deploy landed mid-session and the server no
 * longer recognizes this page's action ("version skew"), or the network dropped.
 * Errors from the platform are already returned as { ok: false } by the actions.
 */
export async function safeAction<T>(call: () => Promise<T>): Promise<T | { ok: false; error: string; reconnect?: boolean }> {
  try {
    return await call();
  } catch (err) {
    const text = err instanceof Error ? `${err.name} ${err.message}` : String(err);
    const updated = /server action|unrecognizedaction|failed-to-find/i.test(text);
    return {
      ok: false,
      error: updated
        ? "Hoops Hub was just updated. Reload the page and try again. Nothing was sent."
        : "Couldn't reach Hoops Hub. Check your connection and try again.",
    };
  }
}
