import { describe, expect, it } from "vitest";
import { redact } from "../scripts/fetch-espn";

const S2 = "AEB%2Fabc123%3D%3Dxyz";
const SWID = "{1A2B3C4D-AAAA-BBBB-CCCC-1234567890AB}";

describe("fetch-espn redact", () => {
  it("removes espn_s2 in raw and URL-decoded form", () => {
    const out = redact(`a ${S2} b ${decodeURIComponent(S2)} c`, S2, SWID);
    expect(out).not.toContain("abc123");
    expect(out.match(/REDACTED_ESPN_S2/g)).toHaveLength(2);
  });

  it("removes SWID with or without braces, any case", () => {
    const json = JSON.stringify({
      members: [{ id: SWID }, { id: SWID.toLowerCase() }, { owner: SWID.replace(/[{}]/g, "") }],
    });
    const out = redact(json, S2, SWID);
    expect(out.toLowerCase()).not.toContain("1a2b3c4d");
    expect(out.match(/\{REDACTED-SWID\}/g)).toHaveLength(3);
  });

  it("leaves other members untouched", () => {
    const other = "{99999999-0000-0000-0000-000000000000}";
    expect(redact(other, S2, SWID)).toBe(other);
  });
});
