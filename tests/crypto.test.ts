import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { decryptJson, encryptJson, encrypt, decrypt } from "@/lib/crypto";

beforeAll(() => {
  process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

describe("crypto", () => {
  it("round-trips JSON credentials", () => {
    const creds = { espn_s2: "abc%2Fdef", swid: "{1234-ABCD}" };
    const ct = encryptJson(creds);
    expect(ct).not.toContain("abc");
    expect(decryptJson(ct)).toEqual(creds);
  });

  it("uses a fresh IV each time", () => {
    expect(encrypt("same")).not.toEqual(encrypt("same"));
  });

  it("rejects tampered ciphertext", () => {
    const parts = encrypt("secret").split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decrypt(parts.join("."))).toThrow();
  });
});
