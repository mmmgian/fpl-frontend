import Link from "next/link";
import { Badge, ButtonLink, Button, Card, CaptainBadge, Crest, DataTable, DeadlineTimer, FdrChip, gameweekName, getFormat, getT, isTrip, type Column } from "@/components/ui";
import { entrySlugs, LAB_TRIALS, fdrBand, minus, pickVariant, type CaptainCandidate, type DefconBanker, type PlayerLine, type PriceRow, type PriceStatus, type RotationPair, type SuspensionRow, type UpsidePick } from "@/lib/domain";
import type { PositionId } from "@/lib/domain/types";
import type { ToolsModel } from "@/lib/services/models";
import sheet from "./sheet.module.css";
import styles from "./tools.module.css";

type Tools = Extract<ToolsModel, { kind: "ok" }>;

/**
 * Each card draws its wording from a few variants with the model's salt (new every day and whenever the gameweek moves
 * on), each with its own slot so neighbouring cards don't move in step. Only the words change; every figure is a fact.
 */
const SLOT = { brief: 1, average: 2, bought: 3, sold: 4, prices: 5, xi: 7, eo: 8, teams: 9, upside: 10, tip: 11, captain: 12, rotation: 13, penalties: 14, suspensions: 15, defcon: 16, none: 17 } as const;
const say = <T,>(items: readonly T[], variety: number, slot: number): T => pickVariant(items, variety, slot);

const shirt = (clubCode: number | null) => (clubCode ? `https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_${clubCode}-66.png` : null);

const TONE: Record<PriceStatus, "positive" | "accent" | "neutral" | "warning" | "live"> = {
  rose: "positive", likelyRise: "positive", closeRise: "accent", steady: "neutral", closeFall: "warning", likelyFall: "live", fell: "live",
};

/** A link back to this page with some of the query changed, so a tab keeps the other tools' filters. */
function href(model: Tools, over: Record<string, string | null>, hash: string): string {
  const f = model.prices.filter;
  const q = new URLSearchParams();
  const set = (k: string, v: string | null | undefined) => v && q.set(k, v);
  set("q", f.q);
  set("pos", f.position ? String(f.position) : null);
  set("team", f.team ? String(f.team) : null);
  set("moving", f.movingOnly ? "1" : null);
  set("eo", model.eo?.tier);
  set("by", model.eo?.by === "captain" ? "captain" : null);
  for (const [k, v] of Object.entries(over)) {
    if (v === null) q.delete(k);
    else q.set(k, v);
  }
  const s = q.toString();
  return `/tools${s ? `?${s}` : ""}#${hash}`;
}

function TeamOfTheWeek({ xi, variety }: { xi: NonNullable<Tools["xi"]>; variety: number }) {
  const t = getT();
  const x = t.tools.xi;
  const f = getFormat();
  const captain = xi.best.lines.flatMap((l) => l.players).find((p) => p.captain);
  return (
    <Card title={x.title(gameweekName(`Gameweek ${xi.gw}`))} headingLevel={2} className={styles.full}>
      <p className={styles.note}>{say(x.note, variety, SLOT.xi)(captain?.name ?? "—", xi.best.formation, x.ep(f.oneDecimal(xi.best.total)))}</p>
      <p className={styles.formation}>
        <span>{x.formation}</span> {xi.best.formation}
        <span>{x.total}</span> {f.oneDecimal(xi.best.total)}
      </p>
      <div className={styles.lines}>
        {xi.best.lines.map((line) => (
          <div key={line.positionId} className={styles.line}>
            <span className={styles.lineName}>{t.team.positions[line.positionId]}</span>
            <div className={styles.tiles}>
              {line.players.map((p) => (
                <div key={p.id} className={styles.tile}>
                  <Crest src={shirt(p.clubCode)} name={p.club} size={34} />
                  <span className={styles.tileName}>
                    {p.name}
                    {p.captain ? <CaptainBadge /> : p.vice ? <CaptainBadge vice /> : null}
                  </span>
                  <span className={styles.tileMeta}>
                    {p.opponents.length ? (
                      p.opponents.map((o, i) => (
                        <FdrChip key={i} band={fdrBand(o.difficulty)} label={t.client.fdr.difficulty(fdrBand(o.difficulty))}>
                          {o.short} ({o.home ? t.fixtures.homeShort : t.fixtures.awayShort})
                        </FdrChip>
                      ))
                    ) : (
                      <span className={styles.xp}>{x.noFixture}</span>
                    )}
                  </span>
                  <span className={styles.xp}>{x.ep(f.oneDecimal(p.ep))}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

const pct = (p: number) => Math.round(p * 100);

/** The altered view's heavier tools, from the lab: the captaincy simulation, rotation pairs and the three trackers. */
function LabCards({ lab, variety }: { lab: NonNullable<Tools["lab"]>; variety: number }) {
  const t = getT();
  const l = t.tools.lab;
  const f = getFormat();
  const none = say(l.none, variety, SLOT.none);
  const player = (r: { name: string; club: string; clubCode: number | null; positionId: PositionId }) => (
    <span className={styles.player}>
      <Crest code={r.clubCode} name={r.club} size={22} />
      <span className={styles.playerText}>
        <span className={styles.playerName}>{r.name}</span>
        <span className={styles.playerMeta}>
          {r.club} · {t.tools.positionShort[r.positionId]}
        </span>
      </span>
    </span>
  );
  const captainCols: Column<CaptainCandidate>[] = [
    { key: "player", header: l.cols.player, rowHeader: true, cell: (r) => player(r) },
    { key: "owned", header: l.cols.owned, align: "end", hideBelow: "sm", cell: (r) => t.common.percent(f.oneDecimal(r.ownership)) },
    { key: "sim", header: l.cols.sim, align: "end", cell: (r) => <strong>{f.oneDecimal(r.mean)}</strong> },
    { key: "double", header: l.cols.double, align: "end", hideBelow: "sm", cell: (r) => f.oneDecimal(r.mean * 2) },
    { key: "p10", header: l.cols.p10, align: "end", cell: (r) => t.common.percent(String(pct(r.p10))) },
    { key: "p15", header: l.cols.p15, align: "end", cell: (r) => t.common.percent(String(pct(r.p15))) },
    {
      key: "fixture",
      header: l.cols.fixture,
      hideBelow: "sm",
      cell: (r) => (
        <span className={styles.tileMeta}>
          {r.opponents.map((o, i) => (
            <FdrChip key={i} band={fdrBand(o.difficulty)} label={t.client.fdr.difficulty(fdrBand(o.difficulty))}>
              {o.short} ({o.home ? t.fixtures.homeShort : t.fixtures.awayShort})
            </FdrChip>
          ))}
        </span>
      ),
    },
  ];
  const lists: [string, CaptainCandidate[]][] = [
    [l.byMean, lab.captain.byMean],
    [l.byHaul, lab.captain.byHaul],
    [l.byCeiling, lab.captain.byCeiling],
  ];
  const pairCols: Column<RotationPair>[] = [
    { key: "pair", header: l.cols.pair, rowHeader: true, cell: (r) => <strong>{r.clubs.join(" + ")}</strong> },
    { key: "avg", header: l.cols.average, align: "end", cell: (r) => f.oneDecimal(r.average) },
    {
      key: "picks",
      header: l.cols.picks,
      hideBelow: "sm",
      cell: (r) => (
        <span className={styles.tileMeta}>
          {r.perGw.map((p) => (
            <FdrChip key={p.gw} band={fdrBand(p.difficulty)} label={t.client.fdr.difficulty(fdrBand(p.difficulty))}>
              {t.common.gw(p.gw)} {p.club}
            </FdrChip>
          ))}
        </span>
      ),
    },
  ];
  const lineCols: Column<PlayerLine>[] = [
    { key: "player", header: l.cols.player, rowHeader: true, cell: (r) => player(r) },
    { key: "owned", header: l.cols.owned, align: "end", cell: (r) => t.common.percent(f.oneDecimal(r.ownership)) },
    { key: "xp", header: l.cols.sim, align: "end", hideBelow: "sm", cell: (r) => f.oneDecimal(r.xp) },
    { key: "price", header: t.tools.upside.cols.price, align: "end", hideBelow: "sm", cell: (r) => f.money(r.price) },
  ];
  const banCols: Column<SuspensionRow>[] = [
    { key: "player", header: l.cols.player, rowHeader: true, cell: (r) => player(r) },
    { key: "yellows", header: l.cols.yellows, align: "end", cell: (r) => r.yellows },
    { key: "toBan", header: l.cols.toBan, align: "end", cell: (r) => <strong>{r.toBan}</strong> },
    { key: "owned", header: l.cols.owned, align: "end", hideBelow: "sm", cell: (r) => t.common.percent(f.oneDecimal(r.ownership)) },
  ];
  const defconCols: Column<DefconBanker>[] = [
    { key: "player", header: l.cols.player, rowHeader: true, cell: (r) => player(r) },
    { key: "per90", header: l.cols.per90, align: "end", cell: (r) => f.oneDecimal(r.per90) },
    { key: "share", header: l.cols.share, align: "end", cell: (r) => <strong>{t.common.percent(String(pct(r.share)))}</strong> },
    { key: "owned", header: l.cols.owned, align: "end", hideBelow: "sm", cell: (r) => t.common.percent(f.oneDecimal(r.ownership)) },
  ];
  const gwName = gameweekName(`Gameweek ${lab.gw}`);
  const best = lab.captain.byMean[0];
  const ceiling = lab.captain.byCeiling[0];
  const pair = lab.rotation[0];
  const taker = lab.penalties[0];
  const ban = lab.suspensions[0];
  const wall = lab.defcon[0];
  return (
    <>
      <section id="captain" className={styles.full}>
        <Card title={l.captainTitle} headingLevel={2} className={styles.full}>
          {best && ceiling ? (
            <p className={styles.note}>
              {say(l.captainNote, variety, SLOT.captain)(gwName, f.number(LAB_TRIALS), best.name, f.oneDecimal(best.mean), ceiling.name, t.common.percent(String(pct(ceiling.p15))))}
            </p>
          ) : null}
          <div className={styles.wideGrid}>
            {lists.map(([title, rows]) => (
              <div key={title}>
                <h3 className={styles.upsideTitle}>{title}</h3>
                <DataTable caption={title} hideCaption dense columns={captainCols} rows={rows} rowKey={(r) => r.id} empty={none} />
              </div>
            ))}
          </div>
        </Card>
      </section>
      <section id="rotation" className={styles.full}>
        <Card title={l.rotationTitle} headingLevel={2} className={styles.full}>
          {pair ? <p className={styles.note}>{say(l.rotationNote, variety, SLOT.rotation)(pair.perGw.length, pair.clubs.join(" + "), f.oneDecimal(pair.average))}</p> : null}
          <DataTable caption={l.rotationTitle} hideCaption dense columns={pairCols} rows={lab.rotation} rowKey={(r) => r.clubs.join("-")} empty={none} />
        </Card>
      </section>
      <section id="trackers" className={styles.full}>
        <div className={styles.upsideGrid}>
          <Card title={l.penaltiesTitle} headingLevel={2}>
            {taker ? <p className={styles.note}>{say(l.penaltiesNote, variety, SLOT.penalties)(taker.name, taker.club, t.tools.xi.ep(f.oneDecimal(taker.xp)))}</p> : null}
            <DataTable caption={l.penaltiesTitle} hideCaption dense columns={lineCols} rows={lab.penalties} rowKey={(r) => r.id} empty={none} />
          </Card>
          <Card title={l.suspensionsTitle} headingLevel={2}>
            {ban ? <p className={styles.note}>{say(l.suspensionsNote, variety, SLOT.suspensions)(ban.name, ban.yellows, ban.toBan)}</p> : null}
            <DataTable caption={l.suspensionsTitle} hideCaption dense columns={banCols} rows={lab.suspensions} rowKey={(r) => r.id} empty={none} />
          </Card>
          <Card title={l.defconTitle} headingLevel={2}>
            {wall ? <p className={styles.note}>{say(l.defconNote, variety, SLOT.defcon)(wall.name, t.common.percent(String(pct(wall.share))))}</p> : null}
            <DataTable caption={l.defconTitle} hideCaption dense columns={defconCols} rows={lab.defcon} rowKey={(r) => r.id} empty={none} />
          </Card>
        </div>
      </section>
    </>
  );
}

/** The altered view's tool: little-owned players worth chasing, the armband gambles and the players about to rise. */
function UpsideLab({ upside, variety }: { upside: NonNullable<Tools["upside"]>; variety: number }) {
  const t = getT().tools.upside;
  const tt = getT();
  const f = getFormat();
  const columns: Column<UpsidePick>[] = [
    {
      key: "player",
      header: t.cols.player,
      rowHeader: true,
      cell: (r) => (
        <span className={styles.player}>
          <Crest code={r.clubCode} name={r.club} size={22} />
          <span className={styles.playerText}>
            <span className={styles.playerName}>{r.name}</span>
            <span className={styles.playerMeta}>
              {r.club} · {tt.tools.positionShort[r.positionId]}
            </span>
          </span>
        </span>
      ),
    },
    { key: "owned", header: t.cols.owned, align: "end", cell: (r) => tt.common.percent(f.oneDecimal(r.ownership)) },
    { key: "xp", header: t.cols.xp, align: "end", cell: (r) => <strong>{f.oneDecimal(r.xp)}</strong> },
    { key: "form", header: t.cols.form, align: "end", hideBelow: "sm", cell: (r) => f.oneDecimal(r.form) },
    { key: "price", header: t.cols.price, align: "end", hideBelow: "sm", cell: (r) => f.money(r.price) },
  ];
  const lists: [string, UpsidePick[], boolean][] = [
    [t.differentials, upside.differentials, false],
    [t.captain, upside.captainGambles, false],
    [t.risers, upside.risers, true],
  ];
  const lead = upside.differentials[0];
  const gamble = upside.captainGambles[0];
  const none = say(t.none, variety, SLOT.none);
  return (
    <Card title={t.title} headingLevel={2} className={styles.full}>
      {lead ? <p className={styles.note}>{say(t.note, variety, SLOT.upside)(lead.name, tt.common.percent(f.oneDecimal(lead.ownership)), tt.tools.xi.ep(f.oneDecimal(lead.xp)))}</p> : null}
      <div className={styles.upsideGrid}>
        {lists.map(([title, rows, buying]) => (
          <div key={title}>
            <h3 className={styles.upsideTitle}>{title}</h3>
            <DataTable
              caption={title}
              hideCaption
              dense
              columns={buying ? [...columns.slice(0, 2), { key: "buying", header: t.cols.buying, align: "end", cell: (r: UpsidePick) => f.number(r.transfersIn) }, columns[2]] : columns}
              rows={rows}
              rowKey={(r) => r.id}
              empty={none}
            />
          </div>
        ))}
      </div>
      {gamble ? <p className={styles.note}>{say(t.tip, variety, SLOT.tip)(gamble.name)}</p> : null}
    </Card>
  );
}

function PriceChanges({ model }: { model: Tools }) {
  const t = getT();
  const p = t.tools.prices;
  const f = getFormat();
  const { filter, rows, matching, clubs } = model.prices;
  const compactIntl = new Intl.NumberFormat(f.intl, { notation: "compact", maximumFractionDigits: 1, signDisplay: "exceptZero" });
  const compact = { format: (n: number) => minus(compactIntl.format(n)) };
  const columns: Column<PriceRow>[] = [
    {
      key: "player",
      header: p.cols.player,
      rowHeader: true,
      cell: (r) => (
        <span className={styles.player}>
          <Crest code={r.clubCode} name={r.club} size={22} />
          <span className={styles.playerText}>
            <span className={styles.playerName}>{r.name}</span>
            <span className={styles.playerMeta}>
              {r.club} · {t.tools.positionShort[r.positionId]}
            </span>
          </span>
        </span>
      ),
    },
    { key: "status", header: p.cols.status, cell: (r) => <span className={styles.status}><Badge tone={TONE[r.status]}>{p.statuses[r.status]}</Badge></span> },
    { key: "price", header: p.cols.price, align: "end", cell: (r) => <strong>{f.money(r.price)}</strong> },
    {
      key: "net",
      header: p.cols.net,
      align: "end",
      hideBelow: "sm",
      cell: (r) => (
        <span className={r.net > 0 ? styles.up : r.net < 0 ? styles.down : undefined}>
          {compact.format(r.net)}
          <span className={styles.small}>{p.share(t.common.percent(`${r.share > 0 ? "+" : ""}${f.oneDecimal(r.share)}`))}</span>
        </span>
      ),
    },
    { key: "owned", header: p.cols.owned, align: "end", hideBelow: "sm", cell: (r) => t.common.percent(f.oneDecimal(r.owned)) },
  ];
  return (
    <Card title={p.title} headingLevel={2} className={styles.full}>
      <p className={styles.note}>{say(p.note, model.phase.variety, SLOT.prices)(model.pulse.rising, model.pulse.falling)}</p>
      <form method="get" action="/tools" className={styles.filters}>
        {model.eo ? <input type="hidden" name="eo" value={model.eo.tier} /> : null}
        {model.eo?.by === "captain" ? <input type="hidden" name="by" value="captain" /> : null}
        <label className={styles.field}>
          {p.search}
          <input className={styles.input} type="search" name="q" defaultValue={filter.q} placeholder={p.searchPlaceholder} maxLength={40} />
        </label>
        <label className={styles.field}>
          {p.position}
          <select className={styles.input} name="pos" defaultValue={filter.position ?? ""}>
            <option value="">{p.allPositions}</option>
            {([1, 2, 3, 4] as const).map((id) => (
              <option key={id} value={id}>
                {t.team.positions[id]}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          {p.team}
          <select className={styles.input} name="team" defaultValue={filter.team ?? ""}>
            <option value="">{p.allTeams}</option>
            {clubs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.short}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.check}>
          <input type="checkbox" name="moving" value="1" defaultChecked={filter.movingOnly} />
          {p.movingOnly}
        </label>
        <span className={styles.actions}>
          <Button type="submit" size="sm" variant="solid">
            {p.apply}
          </Button>
          <ButtonLink size="sm" href="/tools#prices">
            {p.reset}
          </ButtonLink>
        </span>
      </form>
      <form method="get" action="/team" className={styles.myTeam}>
        <label className={styles.field}>
          {p.myTeam}
          <input className={styles.input} type="text" inputMode="numeric" pattern="[0-9]*" name="id" placeholder={p.myTeamPlaceholder} maxLength={10} required />
        </label>
        <Button type="submit" size="sm" variant="solid">
          {p.go}
        </Button>
      </form>
      <DataTable caption={p.title} hideCaption dense columns={columns} rows={rows} rowKey={(r) => r.id} empty={say(p.none, model.phase.variety, SLOT.none)} />
      <p className={styles.count}>{p.showing(rows.length, matching)}</p>
    </Card>
  );
}

function EffectiveOwnership({ model }: { model: Tools }) {
  const t = getT();
  const e = t.tools.eo;
  const f = getFormat();
  const eo = model.eo;
  const columns: Column<NonNullable<Tools["eo"]>["rows"][number]>[] = [
    {
      key: "player",
      header: e.cols.player,
      rowHeader: true,
      cell: (r) => (
        <span className={styles.player}>
          <Crest code={r.clubCode} name={r.club} size={22} />
          <span className={styles.playerText}>
            <span className={styles.playerName}>{r.name}</span>
            <span className={styles.playerMeta}>{r.club}</span>
          </span>
        </span>
      ),
    },
    { key: "eo", header: e.cols.eo, align: "end", cell: (r) => <strong>{t.common.percent(f.oneDecimal(r.eo))}</strong> },
    { key: "started", header: e.cols.started, align: "end", hideBelow: "sm", cell: (r) => t.common.percent(f.oneDecimal(r.started)) },
    { key: "captained", header: e.cols.captained, align: "end", cell: (r) => t.common.percent(f.oneDecimal(r.captained)) },
    { key: "owned", header: e.cols.owned, align: "end", hideBelow: "sm", cell: (r) => t.common.percent(f.oneDecimal(r.owned)) },
  ];
  return (
    <Card title={e.title} headingLevel={2} className={styles.full}>
      {eo ? (
        <>
          {eo.rows[0] ? (
            <p className={styles.note}>{say(e.note, model.phase.variety, SLOT.eo)(eo.managers, gameweekName(`Gameweek ${eo.gw}`), eo.rows[0].name, t.common.percent(f.oneDecimal(eo.rows[0].eo)))}</p>
          ) : null}
          <div className={styles.tabs}>
            <span className={styles.tabGroup} role="group" aria-label={e.groups}>
              <span aria-hidden="true">{e.groups}</span>
              {eo.tiers.map((tier) => (
                <Link key={tier.key} className={styles.tab} href={href(model, { eo: tier.key }, "eo")} aria-current={eo.tier === tier.key ? "true" : undefined} scroll={false}>
                  {e.tiers[tier.key]}
                </Link>
              ))}
            </span>
            <span className={styles.tabGroup}>
              {(["eo", "captain"] as const).map((by) => (
                <Link key={by} className={styles.tab} href={href(model, { by: by === "eo" ? null : "captain" }, "eo")} aria-current={eo.by === by ? "true" : undefined} scroll={false}>
                  {e.by[by]}
                </Link>
              ))}
            </span>
          </div>
          <DataTable caption={e.title} hideCaption dense columns={columns} rows={eo.rows} rowKey={(r) => r.id} empty={say(e.none, model.phase.variety, SLOT.none)} />
        </>
      ) : (
        <p className={styles.note}>{say(e.none, model.phase.variety, SLOT.none)}</p>
      )}
    </Card>
  );
}

function Teams({ teams, variety }: { teams: Tools["teams"]; variety: number }) {
  const t = getT().tools.teams;
  const f = getFormat();
  const slugs = entrySlugs(teams.map((x) => ({ id: x.entry, name: x.teamName })));
  const leader = teams.find((x) => x.rank === 1) ?? teams[0];
  return (
    <Card title={t.title} headingLevel={2} className={styles.full}>
      <p className={styles.note}>{say(t.note, variety, SLOT.teams)(teams.length, leader.teamName, t.points(f.number(leader.total)))}</p>
      <ul className={styles.teams}>
        {teams.map((team) => (
          <li key={team.entry}>
            <Link href={`/team/${slugs.get(team.entry) ?? team.entry}`} aria-label={t.open(team.teamName)}>
              <Crest src={team.avatar} name={team.teamName} size={36} />
              <span>
                <span className={styles.teamName}>{team.teamName}</span>
                <span className={styles.teamSub} style={{ display: "block" }}>
                  {team.manager}
                </span>
              </span>
              <span className={styles.teamRank}>
                #{team.rank}
                <span className={styles.teamSub} style={{ display: "block" }}>
                  {t.points(f.number(team.total))}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/**
 * The week at a glance, phase-aware: before a deadline it frames that deadline; while a gameweek is live or settling it
 * says so; once FPL marks it final it points at the next one. Then the crowd's moves, from all of FPL.
 */
function WeekBrief({ model }: { model: Tools }) {
  const t = getT();
  const b = t.tools.brief;
  const f = getFormat();
  const v = model.phase.variety;
  const { phase, gw, next, average } = model.phase;
  const name = (n: number) => gameweekName(`Gameweek ${n}`);
  const nextName = next ? name(next) : b.seasonEnd;
  const headline =
    phase === "upcoming" || gw === null ? (next ? say(b.upcoming, v, SLOT.brief)(nextName) : null)
    : phase === "over" ? say(b.over, v, SLOT.brief)(name(gw))
    : say(b[phase], v, SLOT.brief)(name(gw), nextName);
  const { bought, sold, rising, falling, topRiser, topFaller } = model.pulse;
  const lines = [
    gw !== null && average !== null && phase !== "live" ? say(b.average, v, SLOT.average)(name(gw), t.common.points(average)) : null,
    bought ? say(b.bought, v, SLOT.bought)(bought.name, bought.club, f.number(bought.count)) : null,
    sold ? say(b.sold, v, SLOT.sold)(sold.name, sold.club, f.number(sold.count)) : null,
    rising && topRiser ? say(b.rising, v, SLOT.prices)(rising, topRiser) : null,
    falling && topFaller ? say(b.falling, v, SLOT.prices + 1)(falling, topFaller) : null,
    !rising && !falling ? say(b.calm, v, SLOT.prices) : null,
  ].filter((x): x is string => x !== null);
  if (!headline && lines.length === 0) return null;
  return (
    <section id="brief" className={styles.full}>
      <Card title={b.title} headingLevel={2} className={styles.full}>
        {headline ? <p className={styles.briefLead}>{headline}</p> : null}
        {lines.length ? (
          <ul className={styles.briefList}>
            {lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : null}
      </Card>
    </section>
  );
}

export function ToolsView({ model }: { model: Tools }) {
  const t = getT();
  const tt = t.tools;
  const trip = isTrip();
  return (
    <div className={`${sheet.sheet} ${styles.pitch}`}>
      <h1 className={sheet.title}>{tt.heading}</h1>
      {model.deadline ? <DeadlineTimer at={model.deadline.at} now={model.now} gameweek={gameweekName(model.deadline.name)} /> : null}
      <nav aria-label={tt.heading}>
        <ul className={styles.jump}>
          {trip && model.upside ? (
            <li>
              <a href="#upside">{tt.upside.title}</a>
            </li>
          ) : null}
          {trip && model.lab ? (
            <li>
              <a href="#captain">{tt.lab.captainTitle}</a>
            </li>
          ) : null}
          {model.xi ? (
            <li>
              <a href="#xi">{tt.xi.title(gameweekName(`Gameweek ${model.xi.gw}`)).split(" · ")[0]}</a>
            </li>
          ) : null}
          <li>
            <a href="#prices">{tt.prices.title}</a>
          </li>
          <li>
            <a href="#eo">{tt.eo.title}</a>
          </li>
          {model.teams.length ? (
            <li>
              <a href="#teams">{tt.teams.title}</a>
            </li>
          ) : null}
        </ul>
      </nav>
      <div className={styles.grid}>
        <WeekBrief model={model} />
        {trip && model.upside ? (
          <section id="upside" className={styles.full}>
            <UpsideLab upside={model.upside} variety={model.phase.variety} />
          </section>
        ) : null}
        {trip && model.lab ? <LabCards lab={model.lab} variety={model.phase.variety} /> : null}
        {model.xi ? (
          <section id="xi" className={styles.full}>
            <TeamOfTheWeek xi={model.xi} variety={model.phase.variety} />
          </section>
        ) : null}
        <section id="prices" className={styles.full}>
          <PriceChanges model={model} />
        </section>
        <section id="eo" className={styles.full}>
          <EffectiveOwnership model={model} />
        </section>
        {model.teams.length ? (
          <section id="teams" className={styles.full}>
            <Teams teams={model.teams} variety={model.phase.variety} />
          </section>
        ) : null}
      </div>
    </div>
  );
}
