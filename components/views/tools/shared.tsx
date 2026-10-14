import Link from "next/link";
import type { ReactNode } from "react";
import { Badge, ClubLink, Crest, getT } from "@/components/ui";
import { pickVariant } from "@/lib/domain";
import type { LeaguePlayer } from "@/lib/domain/leagueTools";
import tools from "../tools.module.css";
import styles from "./leagueTools.module.css";

/**
 * Wording slots for the league tools. Far from the page's own slots so neighbouring cards never move in step; only the
 * words rotate (with the model's salt), never a figure.
 */
export const LEAGUE_SLOT = { chips: 41, injuries: 42, template: 43, differentials: 44, rivals: 45 } as const;
export const say = <T,>(items: readonly T[], variety: number, slot: number): T => pickVariant(items, variety, slot);

/** A player: club crest, exact FPL name, club and position; `children` go under them (a narrow screen's second line). */
export function PlayerCell({ p, children }: { p: LeaguePlayer; children?: ReactNode }) {
  const t = getT();
  return (
    <span className={tools.player}>
      <ClubLink name={p.club}>
        <Crest code={p.clubCode} name={p.club} size={22} />
      </ClubLink>
      <span className={tools.playerText}>
        <span className={tools.playerName}>{p.name}</span>
        <span className={tools.playerMeta}>
          <ClubLink name={p.club}>{p.club}</ClubLink> · {t.tools.positionShort[p.positionId]}
        </span>
        {children}
      </span>
    </span>
  );
}

/** A team name that opens its team sheet. */
export function TeamName({ entry, name, slugs }: { entry: number; name: string; slugs: Map<number, string> }) {
  return (
    <Link className={styles.teamLink} href={`/team/${slugs.get(entry) ?? entry}`}>
      {name}
    </Link>
  );
}

/** A dash for sighted readers, the reason for screen readers. */
export function Missing({ label }: { label: string }) {
  return (
    <span className={styles.muted}>
      <span aria-hidden="true">—</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** A chip as a short badge (WC, FH ...) with its full name and gameweek for screen readers. */
export function ChipBadge({ name, gw, tone = "neutral" }: { name: string; gw?: number; tone?: "neutral" | "accent" | "positive" }) {
  const t = getT();
  const full = t.chips[name as keyof typeof t.chips] ?? name;
  const short = t.table.chipShort[name] ?? name;
  return gw === undefined ? (
    <Badge tone={tone} srLabel={full}>
      {short}
    </Badge>
  ) : (
    <Badge tone={tone} srLabel={t.table.chipSr(full, gw)}>
      {short} {t.common.gw(gw)}
    </Badge>
  );
}
