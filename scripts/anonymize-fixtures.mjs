/**
 * Replace league members' real names in fixtures/espn with placeholders.
 *
 *   node scripts/anonymize-fixtures.mjs
 *
 * Each member (keyed by SWID) gets a stable "Manager N" label shared across
 * all leagues, so cross-league tests still line up. Team names are kept.
 * The app never reads fixtures; live data from ESPN still shows real names.
 * Safe to run repeatedly.
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.join(process.cwd(), "fixtures", "espn");
if (!existsSync(ROOT)) process.exit(0);

function jsonFiles(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? jsonFiles(p) : p.endsWith(".json") ? [p] : [];
  });
}

const files = jsonFiles(ROOT);
const docs = new Map(files.map((f) => [f, JSON.parse(readFileSync(f, "utf8"))]));

// Stable numbering: sort every member id seen across all fixtures.
const ids = new Set();
for (const doc of docs.values()) for (const m of doc.members ?? []) if (m?.id) ids.add(String(m.id).toUpperCase());
const label = new Map([...ids].sort().map((id, i) => [id, i + 1]));

let changed = 0;
for (const [file, doc] of docs) {
  if (!Array.isArray(doc.members)) continue;
  for (const m of doc.members) {
    const n = label.get(String(m.id).toUpperCase());
    m.displayName = `Manager ${n}`;
    m.firstName = "Manager";
    m.lastName = String(n);
  }
  writeFileSync(file, JSON.stringify(doc, null, 2));
  changed++;
}
console.log(`Anonymized ${ids.size} members across ${changed} file(s).`);

// League messages: type 166 sets a team's name to its owner's name, and
// ESPN's default team names start with the owner's first name
// ("Brandon's Best Team").
const DEFAULT_NAME = /^[A-Z][a-z]+'s (\S+ )*Team$/;
let messages = 0;
for (const [file, doc] of docs) {
  if (!Array.isArray(doc.topics)) continue;
  for (const t of doc.topics)
    for (const m of t.messages ?? []) {
      if (m.messageTypeId === 166 && typeof m.to === "string" && !m.to.startsWith("Team ")) {
        m.to = `Team ${m.targetId ?? "?"}`;
        messages++;
      }
      for (const k of ["from", "to"])
        if (typeof m[k] === "string" && DEFAULT_NAME.test(m[k])) {
          m[k] = `Team ${m.targetId ?? "?"} (default name)`;
          messages++;
        }
    }
  writeFileSync(file, JSON.stringify(doc, null, 2));
}
console.log(`Anonymized ${messages} owner-name message(s).`);
