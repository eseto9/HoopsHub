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

// ---------------------------------------------------------------------------
// Sleeper: replace managers' usernames, display names, team names and avatars.
// Ids stay, so rosters, matchups and draft picks still line up.
// ---------------------------------------------------------------------------
const SLEEPER = path.join(process.cwd(), "fixtures", "sleeper");
if (existsSync(SLEEPER)) {
  const sleeperFiles = jsonFiles(SLEEPER).filter((f) => !f.endsWith(".full.json"));
  const sdocs = new Map(sleeperFiles.map((f) => [f, JSON.parse(readFileSync(f, "utf8"))]));
  const userIds = new Set();
  for (const [file, doc] of sdocs) {
    if (file.endsWith("users.json") && Array.isArray(doc)) doc.forEach((u) => u?.user_id && userIds.add(String(u.user_id)));
    if (file.endsWith(`${path.sep}user.json`) && doc?.user_id) userIds.add(String(doc.user_id));
  }
  const n = new Map([...userIds].sort().map((id, i) => [id, i + 1]));
  const scrubUser = (u) => {
    const i = n.get(String(u.user_id));
    if (!i) return;
    u.display_name = `Manager ${i}`;
    if ("username" in u) u.username = `manager${i}`;
    u.avatar = null;
    if (u.metadata) {
      if (u.metadata.team_name) u.metadata.team_name = `Team ${i}`;
      delete u.metadata.avatar;
    }
  };
  let touched = 0;
  for (const [file, doc] of sdocs) {
    let changed = false;
    if (Array.isArray(doc) && doc.some((x) => x && typeof x === "object" && "user_id" in x && "display_name" in x)) {
      doc.forEach(scrubUser);
      changed = true;
    } else if (doc && typeof doc === "object" && "user_id" in doc && "display_name" in doc) {
      scrubUser(doc);
      changed = true;
    }
    // League objects carry the chat's last author.
    for (const l of Array.isArray(doc) ? doc : [doc]) {
      if (l && typeof l === "object" && "last_author_display_name" in l) {
        l.last_author_display_name = null;
        l.last_author_avatar = null;
        l.last_message_text_map = null;
        changed = true;
      }
    }
    if (changed) {
      writeFileSync(file, JSON.stringify(doc, null, 2));
      touched++;
    }
  }
  console.log(`Anonymized ${n.size} Sleeper managers across ${touched} file(s).`);
}
