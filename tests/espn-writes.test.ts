import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildAddDrop, buildCancel, buildTradeProposal, transactionsUrl } from "@/lib/adapters/espn/writes";

const dir = path.join(__dirname, "..", "fixtures", "espn", "writes");
type Capture = { request: { url: string; body: Record<string, unknown> } };
const load = (name: string) => JSON.parse(readFileSync(path.join(dir, name), "utf8")) as Capture;

const SPAM_LEAGUE = "1732958907";
const MEMBER = "{REDACTED-SWID}";

describe("ESPN write requests match espn.com captures", () => {
  it("all captured writes go to the transactions endpoint", () => {
    for (const f of ["waiver-claim.json", "waiver-cancel.json", "trade-proposal.json", "trade-cancel.json"]) {
      expect(load(f).request.url).toBe(transactionsUrl(2027, SPAM_LEAGUE));
    }
  });

  it("waiver claim with drop", () => {
    const body = buildAddDrop({ type: "WAIVER", teamId: 8, memberId: MEMBER, scoringPeriodId: 1, addPlayerId: 3064290, dropPlayerId: 4397140 });
    expect(body).toEqual(load("waiver-claim.json").request.body);
  });

  it("waiver claim cancel", () => {
    const body = buildCancel({
      type: "WAIVER",
      teamId: 8,
      memberId: MEMBER,
      scoringPeriodId: 1,
      relatedTransactionId: "97f07662-fa0f-40b0-b13f-a66b84cbf77d",
    });
    expect(body).toEqual(load("waiver-cancel.json").request.body);
  });

  it("trade proposal", () => {
    const body = buildTradeProposal({
      teamId: 8,
      memberId: MEMBER,
      scoringPeriodId: 1,
      otherTeamId: 1,
      receivePlayerIds: [4397014],
      sendPlayerIds: [5175643],
      expirationDate: "2026-10-21T14:09:03.447Z",
    });
    expect(body).toEqual(load("trade-proposal.json").request.body);
  });

  it("trade cancel", () => {
    const body = buildCancel({
      type: "TRADE_PROPOSAL",
      teamId: 8,
      memberId: MEMBER,
      scoringPeriodId: 1,
      relatedTransactionId: "2dd52ece-6a58-46e6-89bc-cd4505693629",
    });
    expect(body).toEqual(load("trade-cancel.json").request.body);
  });

  it("instant pickup differs from a claim only by type", () => {
    const claim = buildAddDrop({ type: "WAIVER", teamId: 8, memberId: MEMBER, scoringPeriodId: 1, addPlayerId: 1, dropPlayerId: 2 });
    const pickup = buildAddDrop({ type: "FREEAGENT", teamId: 8, memberId: MEMBER, scoringPeriodId: 1, addPlayerId: 1, dropPlayerId: 2 });
    expect({ ...pickup, type: "WAIVER" }).toEqual(claim);
  });
});
