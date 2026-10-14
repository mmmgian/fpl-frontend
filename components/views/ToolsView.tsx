import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { DAY_CLOCK } from "@/components/ui/timeFormats";
import {
  Badge,
  ButtonLink,
  Button,
  Card,
  CaptainBadge,
  Crest,
  DataTable,
  DeadlineTimer,
  FdrChip,
  LoadingState,
  Skeleton,
  TableSkeleton,
  gameweekName,
  getFormat,
  getT,
  isTrip,
  type Column,
} from "@/components/ui";
import {
  entrySlugs,
  LAB_TRIALS,
  fdrBand,
  minus,
  pickVariant,
  type CaptainCandidate,
  type DefconBanker,
  type PlayerLine,
  type PriceRow,
  type PriceStatus,
  type RotationPair,
  type SuspensionRow,
  type UpsidePick,
} from "@/lib/domain";
import type { PositionId } from "@/lib/domain/types";
import type { ToolsKept, ToolsModel } from "@/lib/services/models";
import sheet from "./sheet.module.css";
import styles from "./tools.module.css";
import layout from "./tools/layout.module.css";
import { withTime } from "./withTime";
import { CaptainShortlist } from "./tools/CaptainShortlist";
import { FixtureSwings, RotationPairs } from "./tools/FixtureSwings";
import { SetPieces } from "./tools/SetPieces";
import {
  LeagueToolsNav,
  LeagueToolsSections,
  picksNote,
} from "./tools/LeagueTools";

type Tools = Extract<ToolsModel, { kind: "ok" }>;

/**
 * Each card draws its wording from a few variants with the model's salt (new every day and whenever the gameweek moves
 * on), each with its own slot so neighbouring cards don't move in step. Only the words change; every figure is a fact.
 */
const SLOT = {
  brief: 1,
  average: 2,
  bought: 3,
  sold: 4,
  prices: 5,
  xi: 7,
  eo: 8,
  teams: 9,
  upside: 10,
  tip: 11,
  captain: 12,
  rotation: 13,
  penalties: 14,
  suspensions: 15,
  defcon: 16,
  none: 17,
  league: 18,
  injuries: 19,
} as const;
const say = <T,>(items: readonly T[], variety: number, slot: number): T =>
  pickVariant(items, variety, slot);

const shirt = (clubCode: number | null) =>
  clubCode
    ? `https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_${clubCode}-66.png`
    : null;

const TONE: Record<
  PriceStatus,
  "positive" | "accent" | "neutral" | "warning" | "live"
> = {
  rose: "positive",
  likelyRise: "positive",
  closeRise: "accent",
  steady: "neutral",
  closeFall: "warning",
  likelyFall: "live",
  fell: "live",
};

/** The league-dependent choices a full model carries; while those parts stream in, the page passes them in instead. */
function keptOf(model: Tools): ToolsKept {
  return {
    eo: model.eo?.tier ?? null,
    by: model.eo?.by === "captain" ? "captain" : null,
    vs: model.leagueTools?.rivals?.selected?.join(",") ?? null,
  };
}

/** A link back to this page with some of the query changed, so a tab keeps the other tools' filters. */
function href(
  model: Tools,
  kept: ToolsKept,
  over: Record<string, string | null>,
  hash: string,
): string {
  const f = model.prices.filter;
  const q = new URLSearchParams();
  const set = (k: string, v: string | null | undefined) => v && q.set(k, v);
  set("q", f.q);
  set("pos", f.position ? String(f.position) : null);
  set("team", f.team ? String(f.team) : null);
  set("moving", f.movingOnly ? "1" : null);
  set("eo", kept.eo);
  set("by", kept.by);
  set("vs", kept.vs);
  for (const [k, v] of Object.entries(over)) {
    if (v === null) q.delete(k);
    else q.set(k, v);
  }
  const s = q.toString();
  return `/tools${s ? `?${s}` : ""}#${hash}`;
}

/** The other tools' filters as plain fields, for a form that sets its own (the head to head's `vs`). */
function keepFor(model: Tools, kept: ToolsKept): Record<string, string> {
  return Object.fromEntries(
    new URL(href(model, kept, { vs: null }, "x"), "https://x.invalid")
      .searchParams,
  );
}

/**
 * Next gameweek's best legal eleven by FPL's own expected points: a forecast, badged as one. Its captain is simply the
 * top expected scorer, so when the simulation's safest armband (`safest`) is someone else, the card says why.
 */
function ProjectedXI({
  xi,
  variety,
  safest,
}: {
  xi: NonNullable<Tools["xi"]>;
  variety: number;
  safest: { id: number; name: string } | null;
}) {
  const t = getT();
  const x = t.tools.xi;
  const f = getFormat();
  const captain = xi.best.lines
    .flatMap((l) => l.players)
    .find((p) => p.captain);
  const differs =
    captain && safest && safest.id !== captain.id
      ? x.captainDiffers(captain.name, safest.name)
      : null;
  return (
    <Card
      title={x.title(gameweekName(`Gameweek ${xi.gw}`))}
      headingLevel={2}
      className={styles.full}
      actions={<Badge tone="accent">{x.badge}</Badge>}
    >
      <p className={styles.note}>
        {say(x.note, variety, SLOT.xi)(
          captain?.name ?? "—",
          xi.best.formation,
          x.ep(f.oneDecimal(xi.best.total)),
        )}
      </p>
      {differs ? <p className={layout.aside}>{differs}</p> : null}
      <p className={styles.formation}>
        <span>{x.formation}</span> {xi.best.formation}{" "}
        <span>{x.total}</span> {f.oneDecimal(xi.best.total)}
      </p>
      <div className={styles.lines}>
        {xi.best.lines.map((line) => (
          <div key={line.positionId} className={styles.line}>
            <span className={styles.lineName}>
              {t.team.positions[line.positionId]}
            </span>
            <div className={styles.tiles}>
              {line.players.map((p) => (
                <div key={p.id} className={styles.tile}>
                  <Crest src={shirt(p.clubCode)} name={p.club} size={34} />
                  <span className={styles.tileName}>
                    {p.name}
                    {p.captain ? (
                      <CaptainBadge />
                    ) : p.vice ? (
                      <CaptainBadge vice />
                    ) : null}
                  </span>
                  <span className={styles.tileMeta}>
                    {p.opponents.length ? (
                      p.opponents.map((o, i) => (
                        <FdrChip
                          key={i}
                          band={fdrBand(o.difficulty)}
                          label={t.client.fdr.difficulty(fdrBand(o.difficulty))}
                        >
                          {o.short} (
                          {o.home ? t.fixtures.homeShort : t.fixtures.awayShort}
                          )
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

/**
 * The altered view's heavier tools, from the lab: the captaincy simulation (before the deadline), rotation pairs and the
 * three trackers (transfers). `part` picks which, so each lands in its group.
 */
function LabCards({
  lab,
  variety,
  part,
}: {
  lab: NonNullable<Tools["lab"]>;
  variety: number;
  part: "captain" | "rotation" | "trackers";
}) {
  const t = getT();
  const l = t.tools.lab;
  const f = getFormat();
  const none = say(l.none, variety, SLOT.none);
  const player = (
    r: {
      name: string;
      club: string;
      clubCode: number | null;
      positionId: PositionId;
    },
    phone?: ReactNode,
  ) => (
    <span className={styles.player}>
      <Crest code={r.clubCode} name={r.club} size={22} />
      <span className={styles.playerText}>
        <span className={styles.playerName}>{r.name}</span>
        <span className={styles.playerMeta}>
          {r.club} · {t.tools.positionShort[r.positionId]}
        </span>
        {phone ? <span className={layout.sm}>{phone}</span> : null}
      </span>
    </span>
  );
  const opponents = (r: CaptainCandidate) =>
    r.opponents.map((o, i) => (
      <FdrChip
        key={i}
        band={fdrBand(o.difficulty)}
        label={t.client.fdr.difficulty(fdrBand(o.difficulty))}
      >
        {o.short} ({o.home ? t.fixtures.homeShort : t.fixtures.awayShort})
      </FdrChip>
    ));
  const picks = (r: RotationPair) => (
    <span className={styles.tileMeta}>
      {r.perGw.map((p) =>
        p.blank ? (
          <Badge key={p.gw} tone="warning">
            {t.common.gw(p.gw)} {t.tools.planning.pairs.neither}
          </Badge>
        ) : (
          <FdrChip
            key={p.gw}
            band={fdrBand(p.difficulty)}
            label={t.client.fdr.difficulty(fdrBand(p.difficulty))}
          >
            {t.common.gw(p.gw)} {p.club}
          </FdrChip>
        ),
      )}
    </span>
  );
  const captainCols: Column<CaptainCandidate>[] = [
    // On a phone the fixture column hides, so the opponent moves under the name.
    {
      key: "player",
      header: l.cols.player,
      rowHeader: true,
      cell: (r) => player(r, r.opponents.length ? opponents(r) : null),
    },
    {
      key: "owned",
      header: l.cols.owned,
      align: "end",
      hideBelow: "sm",
      cell: (r) => t.common.percent(f.oneDecimal(r.ownership)),
    },
    {
      key: "sim",
      header: l.cols.sim,
      align: "end",
      cell: (r) => <strong>{f.oneDecimal(r.mean)}</strong>,
    },
    {
      key: "double",
      header: l.cols.double,
      align: "end",
      hideBelow: "sm",
      cell: (r) => f.oneDecimal(r.mean * 2),
    },
    {
      key: "p10",
      header: l.cols.p10,
      align: "end",
      cell: (r) => t.common.percent(String(pct(r.p10))),
    },
    {
      key: "p15",
      header: l.cols.p15,
      align: "end",
      cell: (r) => t.common.percent(String(pct(r.p15))),
    },
    {
      key: "fixture",
      header: l.cols.fixture,
      hideBelow: "sm",
      cell: (r) => <span className={styles.tileMeta}>{opponents(r)}</span>,
    },
  ];
  const lists: [string, CaptainCandidate[]][] = [
    [l.byMean, lab.captain.byMean],
    [l.byHaul, lab.captain.byHaul],
    [l.byCeiling, lab.captain.byCeiling],
  ];
  const pairCols: Column<RotationPair>[] = [
    {
      key: "pair",
      header: l.cols.pair,
      rowHeader: true,
      cell: (r) => (
        <span className={layout.stack}>
          <strong>{r.clubs.join(" + ")}</strong>
          <span className={layout.sm}>{picks(r)}</span>
        </span>
      ),
    },
    {
      key: "avg",
      header: l.cols.average,
      align: "end",
      cell: (r) => f.oneDecimal(r.average),
    },
    { key: "picks", header: l.cols.picks, hideBelow: "sm", cell: picks },
  ];
  const lineCols: Column<PlayerLine>[] = [
    {
      key: "player",
      header: l.cols.player,
      rowHeader: true,
      cell: (r) => player(r),
    },
    {
      key: "owned",
      header: l.cols.owned,
      align: "end",
      cell: (r) => t.common.percent(f.oneDecimal(r.ownership)),
    },
    {
      key: "xp",
      header: l.cols.sim,
      align: "end",
      hideBelow: "sm",
      cell: (r) => f.oneDecimal(r.xp),
    },
    {
      key: "price",
      header: t.tools.upside.cols.price,
      align: "end",
      hideBelow: "sm",
      cell: (r) => f.money(r.price),
    },
  ];
  const banCols: Column<SuspensionRow>[] = [
    {
      key: "player",
      header: l.cols.player,
      rowHeader: true,
      cell: (r) => player(r),
    },
    {
      key: "yellows",
      header: l.cols.yellows,
      align: "end",
      cell: (r) => r.yellows,
    },
    {
      key: "toBan",
      header: l.cols.toBan,
      align: "end",
      cell: (r) => <strong>{r.toBan}</strong>,
    },
    {
      key: "owned",
      header: l.cols.owned,
      align: "end",
      hideBelow: "sm",
      cell: (r) => t.common.percent(f.oneDecimal(r.ownership)),
    },
  ];
  const defconCols: Column<DefconBanker>[] = [
    {
      key: "player",
      header: l.cols.player,
      rowHeader: true,
      cell: (r) => player(r),
    },
    {
      key: "per90",
      header: l.cols.per90,
      align: "end",
      cell: (r) => f.oneDecimal(r.per90),
    },
    {
      key: "share",
      header: l.cols.share,
      align: "end",
      cell: (r) => <strong>{t.common.percent(String(pct(r.share)))}</strong>,
    },
    {
      key: "owned",
      header: l.cols.owned,
      align: "end",
      hideBelow: "sm",
      cell: (r) => t.common.percent(f.oneDecimal(r.ownership)),
    },
  ];
  const gwName = gameweekName(`Gameweek ${lab.gw}`);
  const best = lab.captain.byMean[0];
  const ceiling = lab.captain.byCeiling[0];
  const pair = lab.rotation[0];
  const taker = lab.penalties[0];
  const ban = lab.suspensions[0];
  const wall = lab.defcon[0];
  if (part === "captain") {
    return (
      <section id="captain" className={styles.full}>
        <Card title={l.captainTitle} headingLevel={2} className={styles.full}>
          {best && ceiling ? (
            <p className={styles.note}>
              {say(l.captainNote, variety, SLOT.captain)(
                gwName,
                f.number(LAB_TRIALS),
                best.name,
                f.oneDecimal(best.mean),
                ceiling.name,
                t.common.percent(String(pct(ceiling.p15))),
              )}
            </p>
          ) : null}
          <div className={styles.wideGrid}>
            {lists.map(([title, rows]) => (
              <div key={title}>
                <h3 className={styles.upsideTitle}>{title}</h3>
                <DataTable
                  caption={title}
                  hideCaption
                  dense
                  columns={captainCols}
                  rows={rows}
                  rowKey={(r) => r.id}
                  empty={none}
                />
              </div>
            ))}
          </div>
        </Card>
      </section>
    );
  }
  if (part === "rotation") {
    return (
      <section id="rotation" className={styles.full}>
        <Card title={l.rotationTitle} headingLevel={2} className={styles.full}>
          {pair ? (
            <p className={styles.note}>
              {say(l.rotationNote, variety, SLOT.rotation)(
                pair.perGw.length,
                pair.clubs.join(" + "),
                f.oneDecimal(pair.average),
              )}
            </p>
          ) : null}
          <DataTable
            caption={l.rotationTitle}
            hideCaption
            dense
            columns={pairCols}
            rows={lab.rotation}
            rowKey={(r) => r.clubs.join("-")}
            empty={none}
          />
        </Card>
      </section>
    );
  }
  return (
    <section id="trackers" className={styles.full}>
      <div className={styles.upsideGrid}>
        <div id="penalties">
          <Card title={l.penaltiesTitle} headingLevel={2}>
            {taker ? (
              <p className={styles.note}>
                {say(l.penaltiesNote, variety, SLOT.penalties)(
                  taker.name,
                  taker.club,
                  t.tools.xi.ep(f.oneDecimal(taker.xp)),
                )}
              </p>
            ) : null}
            <DataTable
              caption={l.penaltiesTitle}
              hideCaption
              dense
              columns={lineCols}
              rows={lab.penalties}
              rowKey={(r) => r.id}
              empty={none}
            />
          </Card>
        </div>
        <div id="suspensions">
          <Card title={l.suspensionsTitle} headingLevel={2}>
            {ban ? (
              <p className={styles.note}>
                {say(l.suspensionsNote, variety, SLOT.suspensions)(
                  ban.name,
                  ban.yellows,
                  ban.toBan,
                )}
              </p>
            ) : null}
            <DataTable
              caption={l.suspensionsTitle}
              hideCaption
              dense
              columns={banCols}
              rows={lab.suspensions}
              rowKey={(r) => r.id}
              empty={none}
            />
          </Card>
        </div>
        <div id="defcon">
          <Card title={l.defconTitle} headingLevel={2}>
            {wall ? (
              <p className={styles.note}>
                {say(
                  l.defconNote,
                  variety,
                  SLOT.defcon,
                )(wall.name, t.common.percent(String(pct(wall.share))))}
              </p>
            ) : null}
            <DataTable
              caption={l.defconTitle}
              hideCaption
              dense
              columns={defconCols}
              rows={lab.defcon}
              rowKey={(r) => r.id}
              empty={none}
            />
          </Card>
        </div>
      </div>
    </section>
  );
}

/** The altered view's tool: little-owned players worth chasing, the armband gambles and the players about to rise. */
function UpsideLab({
  upside,
  variety,
}: {
  upside: NonNullable<Tools["upside"]>;
  variety: number;
}) {
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
    {
      key: "owned",
      header: t.cols.owned,
      align: "end",
      cell: (r) => tt.common.percent(f.oneDecimal(r.ownership)),
    },
    {
      key: "xp",
      header: t.cols.xp,
      align: "end",
      cell: (r) => <strong>{f.oneDecimal(r.xp)}</strong>,
    },
    {
      key: "form",
      header: t.cols.form,
      align: "end",
      hideBelow: "sm",
      cell: (r) => f.oneDecimal(r.form),
    },
    {
      key: "price",
      header: t.cols.price,
      align: "end",
      hideBelow: "sm",
      cell: (r) => f.money(r.price),
    },
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
      {lead ? (
        <p className={styles.note}>
          {say(t.note, variety, SLOT.upside)(
            lead.name,
            tt.common.percent(f.oneDecimal(lead.ownership)),
            tt.tools.xi.ep(f.oneDecimal(lead.xp)),
          )}
        </p>
      ) : null}
      <div className={styles.upsideGrid}>
        {lists.map(([title, rows, buying]) => (
          <div key={title}>
            <h3 className={styles.upsideTitle}>{title}</h3>
            <DataTable
              caption={title}
              hideCaption
              dense
              columns={
                buying
                  ? [
                      ...columns.slice(0, 2),
                      {
                        key: "buying",
                        header: t.cols.buying,
                        align: "end",
                        cell: (r: UpsidePick) => f.number(r.transfersIn),
                      },
                      columns[2],
                    ]
                  : columns
              }
              rows={rows}
              rowKey={(r) => r.id}
              empty={none}
            />
          </div>
        ))}
      </div>
      {gamble ? (
        <p className={styles.note}>
          {say(t.tip, variety, SLOT.tip)(gamble.name)}
        </p>
      ) : null}
    </Card>
  );
}

function PriceChanges({ model, kept }: { model: Tools; kept: ToolsKept }) {
  const t = getT();
  const p = t.tools.prices;
  const f = getFormat();
  const { filter, rows, matching, clubs } = model.prices;
  const compactIntl = new Intl.NumberFormat(f.intl, {
    notation: "compact",
    maximumFractionDigits: 1,
    signDisplay: "exceptZero",
  });
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
    {
      key: "status",
      header: p.cols.status,
      cell: (r) => (
        <span className={styles.status}>
          <Badge tone={TONE[r.status]}>{p.statuses[r.status]}</Badge>
        </span>
      ),
    },
    {
      key: "price",
      header: p.cols.price,
      align: "end",
      cell: (r) => <strong>{f.money(r.price)}</strong>,
    },
    {
      key: "net",
      header: p.cols.net,
      align: "end",
      hideBelow: "sm",
      cell: (r) => (
        <span
          className={
            r.net > 0 ? styles.up : r.net < 0 ? styles.down : undefined
          }
        >
          {compact.format(r.net)}
          <span className={styles.small}>
            {p.share(
              t.common.percent(
                `${r.share > 0 ? "+" : ""}${f.oneDecimal(r.share)}`,
              ),
            )}
          </span>
        </span>
      ),
    },
    {
      key: "owned",
      header: p.cols.owned,
      align: "end",
      hideBelow: "sm",
      cell: (r) => t.common.percent(f.oneDecimal(r.owned)),
    },
  ];
  return (
    <Card title={p.title} headingLevel={2} className={styles.full}>
      <p className={styles.note}>
        {say(
          p.note,
          model.phase.variety,
          SLOT.prices,
        )(model.pulse.rising, model.pulse.falling)}
      </p>
      <form method="get" action="/tools#prices" className={styles.filters}>
        {kept.eo ? <input type="hidden" name="eo" value={kept.eo} /> : null}
        {kept.by ? <input type="hidden" name="by" value={kept.by} /> : null}
        {kept.vs ? <input type="hidden" name="vs" value={kept.vs} /> : null}
        <label className={styles.field}>
          {p.search}
          <input
            className={styles.input}
            type="search"
            name="q"
            defaultValue={filter.q}
            placeholder={p.searchPlaceholder}
            maxLength={40}
          />
        </label>
        <label className={styles.field}>
          {p.position}
          <select
            className={styles.input}
            name="pos"
            defaultValue={filter.position ?? ""}
          >
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
          <select
            className={styles.input}
            name="team"
            defaultValue={filter.team ?? ""}
          >
            <option value="">{p.allTeams}</option>
            {clubs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.short}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.check}>
          <input
            type="checkbox"
            name="moving"
            value="1"
            defaultChecked={filter.movingOnly}
          />
          {p.movingOnly}
        </label>
        <span className={styles.actions}>
          <Button type="submit" size="sm" variant="solid">
            {p.apply}
          </Button>
          <ButtonLink
            size="sm"
            href={href(
              model,
              kept,
              { q: null, pos: null, team: null, moving: null },
              "prices",
            )}
          >
            {p.reset}
          </ButtonLink>
        </span>
      </form>
      <DataTable
        caption={p.title}
        hideCaption
        dense
        stickyFirst
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        empty={say(p.none, model.phase.variety, SLOT.none)}
      />
      <p className={styles.count}>{p.showing(rows.length, matching)}</p>
    </Card>
  );
}

function EffectiveOwnership({ model }: { model: Tools }) {
  const t = getT();
  const e = t.tools.eo;
  const f = getFormat();
  const eo = model.eo;
  const kept = keptOf(model);
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
    {
      key: "eo",
      header: e.cols.eo,
      align: "end",
      cell: (r) => <strong>{t.common.percent(f.oneDecimal(r.eo))}</strong>,
    },
    {
      key: "started",
      header: e.cols.started,
      align: "end",
      hideBelow: "sm",
      cell: (r) => t.common.percent(f.oneDecimal(r.started)),
    },
    {
      key: "captained",
      header: e.cols.captained,
      align: "end",
      cell: (r) => t.common.percent(f.oneDecimal(r.captained)),
    },
    {
      key: "owned",
      header: e.cols.owned,
      align: "end",
      hideBelow: "sm",
      cell: (r) => t.common.percent(f.oneDecimal(r.owned)),
    },
  ];
  return (
    <Card title={e.title} headingLevel={2} className={styles.full}>
      {eo ? (
        <>
          {eo.rows[0] ? (
            <p className={styles.note}>
              {say(e.note, model.phase.variety, SLOT.eo)(
                eo.managers,
                gameweekName(`Gameweek ${eo.gw}`),
                eo.rows[0].name,
                t.common.percent(f.oneDecimal(eo.rows[0].eo)),
              )}
            </p>
          ) : null}
          {picksNote(eo.gw, model.phase.next) ? (
            <p className={layout.aside}>{picksNote(eo.gw, model.phase.next)}</p>
          ) : null}
          <div className={styles.tabs}>
            <span
              className={styles.tabGroup}
              role="group"
              aria-label={e.groups}
            >
              <span aria-hidden="true">{e.groups}</span>
              {eo.tiers.map((tier) => (
                <Link
                  key={tier.key}
                  className={styles.tab}
                  href={href(model, kept, { eo: tier.key }, "eo")}
                  aria-current={eo.tier === tier.key ? "true" : undefined}
                  scroll={false}
                >
                  {e.tiers[tier.key]}
                </Link>
              ))}
            </span>
            <span className={styles.tabGroup}>
              {(["eo", "captain"] as const).map((by) => (
                <Link
                  key={by}
                  className={styles.tab}
                  href={href(
                    model,
                    kept,
                    { by: by === "eo" ? null : "captain" },
                    "eo",
                  )}
                  aria-current={eo.by === by ? "true" : undefined}
                  scroll={false}
                >
                  {e.by[by]}
                </Link>
              ))}
            </span>
          </div>
          <DataTable
            caption={e.title}
            hideCaption
            dense
            stickyFirst
            columns={columns}
            rows={eo.rows}
            rowKey={(r) => r.id}
            empty={say(e.none, model.phase.variety, SLOT.none)}
          />
        </>
      ) : (
        <p className={styles.note}>
          {say(e.none, model.phase.variety, SLOT.none)}
        </p>
      )}
    </Card>
  );
}

/** Any team's sheet by ID, then the league's squads when there are some. */
function Teams({ teams, variety }: { teams: Tools["teams"]; variety: number }) {
  const p = getT().tools.prices;
  const t = getT().tools.teams;
  const f = getFormat();
  const slugs = entrySlugs(
    teams.map((x) => ({ id: x.entry, name: x.teamName })),
  );
  const leader = teams.find((x) => x.rank === 1) ?? teams[0];
  return (
    <Card title={t.title} headingLevel={2} className={styles.full}>
      {leader ? (
        <p className={styles.note}>
          {say(t.note, variety, SLOT.teams)(
            teams.length,
            leader.teamName,
            t.points(f.number(leader.total)),
          )}
        </p>
      ) : null}
      <form
        method="get"
        action="/team"
        className={
          leader ? styles.myTeam : `${styles.myTeam} ${styles.myTeamOnly}`
        }
      >
        <label className={styles.field}>
          {p.myTeam}
          <input
            className={styles.input}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            name="id"
            placeholder={p.myTeamPlaceholder}
            maxLength={10}
            required
          />
        </label>
        <Button type="submit" size="sm" variant="solid">
          {p.go}
        </Button>
      </form>
      {teams.length ? (
        <ul className={styles.teams}>
          {teams.map((team) => (
            <li key={team.entry}>
              <Link
                href={`/team/${slugs.get(team.entry) ?? team.entry}`}
                aria-label={t.open(team.teamName)}
              >
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
      ) : null}
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
  // FPL calls a gameweek live from its first kick-off to its sign-off; the match clock says whether a ball is rolling.
  const matches = phase === "live" ? model.matches : null;
  const headline: ReactNode =
    phase === "upcoming" || gw === null
      ? next
        ? say(b.upcoming, v, SLOT.brief)(nextName)
        : null
      : phase === "over"
        ? say(b.over, v, SLOT.brief)(name(gw))
        : matches?.state === "between" && matches.nextKickoff
          ? withTime(
              (when) => say(b.paused, v, SLOT.brief)(name(gw), when, nextName),
              matches.nextKickoff,
              DAY_CLOCK,
            )
          : matches?.state === "over"
            ? say(b.provisional, v, SLOT.brief)(name(gw), nextName)
            : say(b[phase], v, SLOT.brief)(name(gw), nextName);
  const { bought, sold, rising, falling, topRiser, topFaller } = model.pulse;
  const lines = [
    gw !== null && average !== null && phase !== "live"
      ? say(b.average, v, SLOT.average)(name(gw), t.common.points(average))
      : null,
    bought
      ? say(b.bought, v, SLOT.bought)(
          bought.name,
          bought.club,
          f.number(bought.count),
        )
      : null,
    sold
      ? say(b.sold, v, SLOT.sold)(sold.name, sold.club, f.number(sold.count))
      : null,
    rising && topRiser ? say(b.rising, v, SLOT.prices)(rising, topRiser) : null,
    falling && topFaller
      ? say(b.falling, v, SLOT.prices + 1)(falling, topFaller)
      : null,
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

/**
 * The league-dependent parts (effective ownership and the league tools: chips, injuries, template, differentials, head to
 * head), supplied by the page when they stream in after the rest. Each slot goes where the full model would put its part.
 */
export interface ToolsDeferredSlots {
  /** The query's league-dependent choices, for the links and forms painted before those parts arrive. */
  kept: ToolsKept;
  /** Inside the `#eo` section, which is always there so its jump link never dangles. */
  eo: ReactNode;
  /** Where the league tools' sections go. */
  league: ReactNode;
  /** The league tools' jump links (`<li>` items), shown once their sections are there. */
  nav: ReactNode;
  /** The flagged players in the league's squads, first in "Before the deadline". */
  injuries: ReactNode;
  /** Its jump link, once it's there. */
  injuriesNav: ReactNode;
}

const slugsOf = (model: Tools) =>
  entrySlugs(model.teams.map((x) => ({ id: x.entry, name: x.teamName })));

/** The effective ownership card, for a model whose `eo` has arrived (or is known to be missing). */
export function ToolsEoCard({ model }: { model: Tools }) {
  return <EffectiveOwnership model={model} />;
}

/** The league tools' sections, for a model whose `leagueTools` has arrived; nothing when there are none. */
export function ToolsLeagueSections({ model }: { model: Tools }) {
  return (
    <LeagueToolsSections
      only="league"
      league={model.leagueTools}
      variety={model.phase.variety}
      keep={keepFor(model, keptOf(model))}
      slugs={slugsOf(model)}
    />
  );
}

/** The league tools' jump links, as `<li>` items for the page's nav list. */
export function ToolsLeagueNav({ model }: { model: Tools }) {
  return <LeagueToolsNav league={model.leagueTools} only="league" />;
}

/** The injury watch over the league's squads (it comes from the same read as the league tools). */
export function ToolsInjuries({ model }: { model: Tools }) {
  return (
    <LeagueToolsSections
      only="injuries"
      league={model.leagueTools}
      variety={model.phase.variety}
      keep={keepFor(model, keptOf(model))}
      slugs={slugsOf(model)}
    />
  );
}

/** The injury watch's jump link. */
export function ToolsInjuriesNav({ model }: { model: Tools }) {
  return <LeagueToolsNav league={model.leagueTools} only="injuries" />;
}

/** Holds the injury watch's place while the league's squads are read. */
export function ToolsInjuriesPending({ variety }: { variety: number }) {
  const t = getT();
  return (
    <Card
      title={t.tools.leagueTools.injuries.title}
      headingLevel={2}
      className={styles.full}
    >
      <LoadingState label={say(t.loading.injuries, variety, SLOT.injuries)}>
        <Skeleton width="60%" height={14} />
        <TableSkeleton rows={5} columns={4} />
      </LoadingState>
    </Card>
  );
}

/** Holds the effective ownership card's place, under its own heading, while the league's picks are read. */
export function ToolsEoPending({ variety }: { variety: number }) {
  const t = getT();
  return (
    <Card title={t.tools.eo.title} headingLevel={2} className={styles.full}>
      <LoadingState label={say(t.loading.eo, variety, SLOT.eo)}>
        <Skeleton width="70%" height={16} />
        <Skeleton width={220} height={28} radius={8} />
        <TableSkeleton rows={10} columns={5} />
      </LoadingState>
    </Card>
  );
}

/** Holds the league tools' place while every covered manager's squad and chips are read. */
export function ToolsLeaguePending({ variety }: { variety: number }) {
  const t = getT();
  return (
    <div className={styles.full}>
      <LoadingState label={say(t.loading.league, variety, SLOT.league)}>
        {[0, 1].map((i) => (
          <Card key={i} as="div" className={styles.full}>
            <Skeleton width={180} height={22} />
            <Skeleton width="60%" height={14} />
            <TableSkeleton rows={6} columns={4} />
          </Card>
        ))}
      </LoadingState>
    </div>
  );
}

export function ToolsView({
  model,
  deferred,
}: {
  model: Tools;
  deferred?: ToolsDeferredSlots;
}) {
  const t = getT();
  const tt = t.tools;
  const trip = isTrip();
  // While the league-dependent parts stream in, the model has neither, so the page says what the query asked for.
  const kept = deferred?.kept ?? keptOf(model);
  const v = model.phase.variety;
  const link = (id: string, label: string) => (
    <li key={id}>
      <a href={`#${id}`}>{label}</a>
    </li>
  );
  // The armband the simulation trusts most, for the projected XI to compare its own captain with.
  const safest = trip
    ? (model.lab?.captain.byMean[0] ?? null)
    : (model.planning?.captain?.safest[0] ?? null);
  // In the order a manager works: what to do before the deadline, who to buy and sell, then how the league stands.
  // The altered view's lab carries the captain simulation and rotation pairs, so the plain ones are normal-mode only.
  const groups: {
    key: keyof typeof tt.groups;
    nav: ReactNode;
    body: ReactNode;
  }[] = [
    {
      key: "deadline",
      nav: (
        <>
          {deferred ? deferred.injuriesNav : <ToolsInjuriesNav model={model} />}
          {trip && model.lab ? link("captain", tt.lab.captainTitle) : null}
          {!trip && model.planning?.captain
            ? link("shortlist", tt.planning.nav.captain)
            : null}
          {model.xi
            ? link(
                "xi",
                tt.xi
                  .title(gameweekName(`Gameweek ${model.xi.gw}`))
                  .split(" · ")[0],
              )
            : null}
        </>
      ),
      body: (
        <>
          {deferred ? deferred.injuries : <ToolsInjuries model={model} />}
          {trip && model.lab ? (
            <LabCards lab={model.lab} variety={v} part="captain" />
          ) : null}
          {!trip && model.planning?.captain ? (
            <section id="shortlist" className={styles.full}>
              <CaptainShortlist captain={model.planning.captain} variety={v} />
            </section>
          ) : null}
          {model.xi ? (
            <section id="xi" className={styles.full}>
              <ProjectedXI xi={model.xi} variety={v} safest={safest} />
            </section>
          ) : null}
        </>
      ),
    },
    {
      key: "transfers",
      nav: (
        <>
          {trip && model.upside ? link("upside", tt.upside.title) : null}
          {model.planning?.swings
            ? link("swings", tt.planning.nav.swings)
            : null}
          {trip && model.lab ? link("rotation", tt.lab.rotationTitle) : null}
          {!trip && model.planning?.rotation
            ? link("pairs", tt.planning.nav.pairs)
            : null}
          {link("prices", tt.prices.title)}
          {model.planning?.setPieces
            ? link("setpieces", tt.planning.nav.setPieces)
            : null}
          {trip && model.lab ? link("trackers", tt.lab.penaltiesTitle) : null}
        </>
      ),
      body: (
        <>
          {trip && model.upside ? (
            <section id="upside" className={styles.full}>
              <UpsideLab upside={model.upside} variety={v} />
            </section>
          ) : null}
          {model.planning?.swings ? (
            <section id="swings" className={styles.full}>
              <FixtureSwings swings={model.planning.swings} variety={v} />
            </section>
          ) : null}
          {trip && model.lab ? (
            <LabCards lab={model.lab} variety={v} part="rotation" />
          ) : null}
          {!trip && model.planning?.rotation ? (
            <section id="pairs" className={styles.full}>
              <RotationPairs rotation={model.planning.rotation} variety={v} />
            </section>
          ) : null}
          <section id="prices" className={styles.full}>
            <PriceChanges model={model} kept={kept} />
          </section>
          {model.planning?.setPieces ? (
            <section id="setpieces" className={styles.full}>
              <SetPieces rows={model.planning.setPieces} variety={v} />
            </section>
          ) : null}
          {trip && model.lab ? (
            <LabCards lab={model.lab} variety={v} part="trackers" />
          ) : null}
        </>
      ),
    },
    {
      key: "league",
      nav: (
        <>
          {link("eo", tt.eo.title)}
          {deferred ? deferred.nav : <ToolsLeagueNav model={model} />}
          {link("teams", tt.teams.title)}
        </>
      ),
      body: (
        <>
          <section id="eo" className={styles.full}>
            {deferred ? deferred.eo : <EffectiveOwnership model={model} />}
          </section>
          {deferred ? deferred.league : <ToolsLeagueSections model={model} />}
          <section id="teams" className={styles.full}>
            <Teams teams={model.teams} variety={v} />
          </section>
        </>
      ),
    },
  ];
  return (
    <div className={`${sheet.sheet} ${styles.pitch}`}>
      <h1 className={sheet.title}>{tt.heading}</h1>
      {model.deadline ? (
        <DeadlineTimer
          at={model.deadline.at}
          now={model.now}
          gameweek={gameweekName(model.deadline.name)}
        />
      ) : null}
      <nav aria-label={tt.heading} className={layout.jumpNav}>
        <div className={layout.jumpGroups}>
          {groups.map((g) => (
            <div key={g.key} className={layout.jumpGroup}>
              <span className={layout.jumpLabel} id={`jump-${g.key}`}>
                {tt.groups[g.key]}
              </span>
              <ul className={styles.jump} aria-labelledby={`jump-${g.key}`}>
                {g.nav}
              </ul>
            </div>
          ))}
        </div>
      </nav>
      <div className={styles.grid}>
        <WeekBrief model={model} />
        {groups.map((g) => (
          <Fragment key={g.key}>
            <p className={layout.group}>
              <span className={layout.groupTag}>{tt.groups[g.key]}</span>
            </p>
            {g.body}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
