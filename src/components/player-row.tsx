import type { InjuryStatus, Player, StatLine } from "@/lib/schema";
import { Row } from "./list";

const fmt1 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const pct = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1, minimumFractionDigits: 1, style: "percent" });

const INJURY: Record<InjuryStatus, { label: string; cls: string }> = {
  OUT: { label: "OUT", cls: "bg-danger text-white" },
  IR: { label: "IR", cls: "bg-danger text-white" },
  SUSP: { label: "SUSP", cls: "bg-danger text-white" },
  DTD: { label: "DTD", cls: "bg-warning text-white" },
  GTD: { label: "GTD", cls: "bg-warning text-white" },
  QUES: { label: "Q", cls: "bg-warning text-white" },
  OTHER: { label: "INJ", cls: "bg-gray text-white" },
};

/** Best available stat line: this season, else last season, else projection. */
export function bestLine(p: Player): StatLine | undefined {
  return p.stats?.current ?? p.stats?.previous ?? p.stats?.projected;
}

export function statSummary(line: StatLine | undefined): string | null {
  if (!line) return null;
  const g = line.perGame;
  const parts = [
    g.pts !== undefined && `${fmt1.format(g.pts)} PTS`,
    g.reb !== undefined && `${fmt1.format(g.reb)} REB`,
    g.ast !== undefined && `${fmt1.format(g.ast)} AST`,
    g.fg_pct !== undefined && `${pct.format(g.fg_pct)} FG`,
  ].filter(Boolean);
  return `${parts.join(" · ")} · ${line.label}`;
}

function SlotTile({ slot }: { slot: string }) {
  const tone = slot === "IR" ? "bg-danger-soft text-danger" : slot === "BN" ? "bg-fill text-muted" : "bg-accent-soft text-accent";
  return (
    <span className={`flex h-[30px] w-[38px] shrink-0 items-center justify-center rounded-[7px] text-[11px] font-bold ${tone}`}>
      {slot}
    </span>
  );
}

export function PlayerRow({
  player,
  slot,
  showFantasyPoints,
  href,
  action,
  dimmed,
}: {
  player: Player | null;
  slot?: string;
  showFantasyPoints: boolean;
  href?: string;
  /** Trailing control, e.g. a Move button. */
  action?: React.ReactNode;
  dimmed?: boolean;
}) {
  if (!player) {
    return (
      <Row
        className={dimmed ? "opacity-40" : ""}
        icon={slot ? <SlotTile slot={slot} /> : undefined}
        title={<span className="text-faint">Empty</span>}
        value={action}
      />
    );
  }
  const line = bestLine(player);
  const inj = player.injuryStatus ? INJURY[player.injuryStatus] : null;
  return (
    <Row
      href={href}
      className={dimmed ? "opacity-40" : ""}
      icon={slot ? <SlotTile slot={slot} /> : undefined}
      title={
        <span className="flex items-center gap-1.5">
          <span className="truncate">{player.name}</span>
          {inj && <span className={`shrink-0 rounded px-1 text-[10px] leading-4 font-bold ${inj.cls}`}>{inj.label}</span>}
        </span>
      }
      subtitle={
        <>
          <span className="block truncate">
            {player.nbaTeam ?? "FA"} · {player.positions.join(", ")}
          </span>
          {line && <span className="block truncate text-[13px] text-faint">{statSummary(line)}</span>}
        </>
      }
      value={
        (showFantasyPoints && line?.fantasyPointsPerGame !== undefined) || action ? (
          <>
            {showFantasyPoints && line?.fantasyPointsPerGame !== undefined && (
              <span className="flex flex-col items-end leading-tight">
                <span className="text-[17px] font-semibold text-text tabular-nums">{fmt1.format(line.fantasyPointsPerGame)}</span>
                <span className="text-[11px]">FP/G</span>
              </span>
            )}
            {action}
          </>
        ) : undefined
      }
    />
  );
}
