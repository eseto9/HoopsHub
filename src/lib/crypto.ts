import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM encryption for platform tokens/cookies at rest.
 * Format: "v1.<iv b64url>.<tag b64url>.<ciphertext b64url>"
 *
 * ENCRYPTION_KEY must be 32 random bytes, base64-encoded:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 */
const VERSION = "v1";

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error("ENCRYPTION_KEY is not set");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("ENCRYPTION_KEY must decode to 32 bytes");
  return key;
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decrypt(payload: string): string {
  const [version, iv, tag, ciphertext] = payload.split(".");
  if (version !== VERSION || !iv || !tag || !ciphertext) throw new Error("Unrecognized ciphertext format");
  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}

export function encryptJson(value: Record<string, string>): string {
  return encrypt(JSON.stringify(value));
}

export function decryptJson(payload: string): Record<string, string> {
  return JSON.parse(decrypt(payload)) as Record<string, string>;
}
