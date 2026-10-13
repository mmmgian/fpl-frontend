import type { ReactNode } from "react";
import { Button, ButtonLink, CaptainBadge, Crest, DataTable, getT, type Column } from "@/components/ui";
import type { Rivals, RivalSide, UniquePlayer } from "@/lib/domain/leagueTools";
import tools from "../tools.module.css";
import styles from "./leagueTools.module.css";
import { ChipBadge, LEAGUE_SLOT, Missing, say } from "./shared";

function Players({ players, empty }: { players: (UniquePlayer | (UniquePlayer & { note?: string }))[]; empty: string }) {
  const bench = getT().tools.leagueTools.bench;
  if (players.length === 0) return <p className={styles.muted}>{empty}</p>;
  return (
    <ul className={styles.stack}>
      {players.map((p) => (
        <li key={p.id}>
          <Crest code={p.clubCode} name={p.club} size={20} />
          <span className={tools.playerName}>{p.name}</span>
          <span className={tools.playerMeta}>{p.club}</span>
          {p.captain ? <CaptainBadge /> : null}
          {p.starter ? null : <span className={styles.bench}>({bench})</span>}
        </li>
      ))}
    </ul>
  );
}

/**
 * Two league teams side by side, picked with `?vs=A,B` (a plain form, no scripts needed): the players both own, the
 * ones only each has, captains and the chips each can still play.
 */
export function RivalCompare({ rivals, variety, keep }: { rivals: Rivals; variety: number; keep: Record<string, string> }) {
  const t = getT();
  const r = t.tools.leagueTools.rivals;
  const lt = t.tools.leagueTools;
  const [first, second] = rivals.selected ?? [rivals.options[0].entry, rivals.options[1].entry];
  const clear = new URLSearchParams(keep).toString();
  const cmp = rivals.compare;

  const rowsFor = (c: NonNullable<Rivals["compare"]>): { key: string; label: string; a: ReactNode; b: ReactNode }[] => {
    const chips = (s: RivalSide) =>
      s.chipsOpen === null ? <Missing label={lt.chips.unknown} />
      : s.chipsOpen.length === 0 ? <span className={styles.muted}>{r.noChip}</span>
      : (
        <span className={styles.chipList}>
          {s.chipsOpen.map((k) => (
            <ChipBadge key={k} name={k} tone="positive" />
          ))}
        </span>
      );
    return [
      { key: "captain", label: r.captain, a: c.a.captain ?? r.nobody, b: c.b.captain ?? r.nobody },
      { key: "active", label: r.activeChip, a: c.a.activeChip ? <ChipBadge name={c.a.activeChip} /> : r.noChip, b: c.b.activeChip ? <ChipBadge name={c.b.activeChip} /> : r.noChip },
      { key: "chips", label: r.chipsOpen, a: chips(c.a), b: chips(c.b) },
    ];
  };
  const columns: Column<{ key: string; label: string; a: ReactNode; b: ReactNode }>[] = cmp
    ? [
        { key: "label", header: <span className="sr-only">{r.title}</span>, rowHeader: true, cell: (x) => x.label },
        { key: "a", header: cmp.a.manager.teamName, cell: (x) => x.a },
        { key: "b", header: cmp.b.manager.teamName, cell: (x) => x.b },
      ]
    : [];

  return (
    <>
      <form method="get" action="/tools#head-to-head" className={tools.filters}>
        {Object.entries(keep).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <label className={tools.field}>
          {r.first}
          <select className={tools.input} name="vs" defaultValue={String(first)}>
            {rivals.options.map((o) => (
              <option key={o.entry} value={o.entry}>
                {o.teamName}
              </option>
            ))}
          </select>
        </label>
        <label className={tools.field}>
          {r.second}
          <select className={tools.input} name="vs" defaultValue={String(second)}>
            {rivals.options.map((o) => (
              <option key={o.entry} value={o.entry}>
                {o.teamName}
              </option>
            ))}
          </select>
        </label>
        <span className={tools.actions}>
          <Button type="submit" size="sm" variant="solid">
            {r.compare}
          </Button>
          {rivals.selected || rivals.invalid ? (
            <ButtonLink size="sm" href={`/tools${clear ? `?${clear}` : ""}#head-to-head`}>
              {r.clear}
            </ButtonLink>
          ) : null}
        </span>
      </form>
      {rivals.invalid ? (
        <p className={styles.warn} role="status">
          {r.invalid}
        </p>
      ) : null}
      {cmp ? (
        <>
          <p className={tools.note}>{say(r.note, variety, LEAGUE_SLOT.rivals)(cmp.a.manager.teamName, cmp.b.manager.teamName, cmp.shared.length, cmp.a.only.length, cmp.b.only.length)}</p>
          <DataTable caption={r.title} hideCaption dense columns={columns} rows={rowsFor(cmp)} rowKey={(x) => x.key} />
          <div className={styles.versus}>
            <section aria-label={r.only(cmp.a.manager.teamName)}>
              <h3>{r.only(cmp.a.manager.teamName)}</h3>
              <Players players={cmp.a.only} empty={r.nobody} />
            </section>
            <section aria-label={r.shared}>
              <h3>{r.shared}</h3>
              <Players players={cmp.shared.map((p) => ({ ...p, starter: p.aStarts || p.bStarts, captain: false }))} empty={r.nobody} />
            </section>
            <section aria-label={r.only(cmp.b.manager.teamName)}>
              <h3>{r.only(cmp.b.manager.teamName)}</h3>
              <Players players={cmp.b.only} empty={r.nobody} />
            </section>
          </div>
        </>
      ) : rivals.invalid ? null : (
        <p className={tools.note}>{r.prompt}</p>
      )}
    </>
  );
}
