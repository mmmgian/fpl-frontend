import type { ReactNode } from "react";
import { Badge, BarChart, Card, CaptainBadge, ChartKey, English, LineChart, getFormat, getLocale, getT } from "@/components/ui";
import { compactNumber, dash, outlookVerdict } from "@/lib/domain";
import type { SeasonCharts, SeasonForm } from "@/lib/domain";
import type { GameweekInsights, SeasonInsights, SquadInsights } from "@/lib/services/models";
import styles from "./insights.module.css";

function Fact({ children }: { children: ReactNode }) {
  return <p className={styles.fact}>{children}</p>;
}

/** Facts about this gameweek. Cards appear only when there is something true to say. */
export function MatchdayInsights({ data, gameweek }: { data: GameweekInsights; gameweek: string }) {
  const t = getT();
  const m = t.matchday;
  const c = t.common;
  const { captain, bench, chip, autoSubs, rotation, remaining, defcon, flags } = data;

  return (
    <section aria-labelledby="matchday-heading" className="stack">
      <h2 id="matchday-heading" className={styles.sectionTitle}>
        {m.heading(gameweek)}
      </h2>
      <div className={styles.grid}>
        {captain ? (
          <Card title={m.captaincy} headingLevel={3}>
            <p className={styles.big}>
              {captain.captain.name} <CaptainBadge multiplier={captain.captain.multiplier} />
              <span className={styles.bigNote}>
                {c.pts(captain.captain.points)} ({captain.captain.base} × {captain.captain.multiplier})
              </span>
            </p>
            {captain.state === "waiting" ? (
              <Fact>{m.waiting}</Fact>
            ) : captain.state === "unused" ? (
              <Fact>{m.unused}</Fact>
            ) : captain.regret === 0 ? (
              <Fact>{m.spotOn(captain.provisional)}</Fact>
            ) : (
              <Fact>
                {m.regretBefore(captain.best.name, captain.best.base, captain.provisional)}
                <strong>{c.pts(captain.regret ?? 0)}</strong>
                {m.regretAfter(captain.provisional)}
              </Fact>
            )}
            {captain.vice ? <Fact>{m.vice(captain.vice.name, captain.vice.base == null ? undefined : c.pts(captain.vice.base))}</Fact> : null}
          </Card>
        ) : null}

        {chip ? (
          <Card title={(t.chips as Record<string, string>)[chip.chip] ?? chip.chip} headingLevel={3}>
            <p className={styles.big}>
              +{chip.points}
              <span className={styles.bigNote}>{m.chipFrom(chip.points)}</span>
            </p>
            <Fact>{chip.chip === "bboost" ? m.chipBboost : m.chipTc}</Fact>
          </Card>
        ) : null}

        {bench ? (
          <Card title={m.benchTitle} headingLevel={3}>
            <p className={styles.big}>
              {c.pts(bench.points)}
              <span className={styles.bigNote}>{bench.counted ? m.benchCounted : m.benchLeft}</span>
            </p>
            <Fact>{bench.players.map((p) => `${p.name} ${p.points}`).join(" · ")}</Fact>
            {!bench.counted && bench.points >= 10 ? <Fact>{m.benchPine}</Fact> : null}
            {!bench.counted && bench.points === 0 ? <Fact>{m.benchNone}</Fact> : null}
          </Card>
        ) : null}

        {remaining ? (
          <Card title={m.matchdayTitle} headingLevel={3}>
            <p className={styles.big}>
              {remaining.count}
              <span className={styles.bigNote}>{m.stillToPlay}</span>
            </p>
            <Fact>{remaining.count === 0 ? m.allPlayed(remaining.played) : m.somePlayed(remaining.played, remaining.played + remaining.count, remaining.effective)}</Fact>
          </Card>
        ) : null}

        {autoSubs.length ? (
          <Card title={m.autoSubs} headingLevel={3}>
            <ul className={styles.list}>
              {autoSubs.map((s) => (
                <li key={`${s.in.name}-${s.out.name}`}>
                  <strong>{s.in.name}</strong>
                  {m.onFor(s.out.name)} <span className={styles.muted}>({s.in.points} {t.common.vs} {s.out.points})</span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {flags.length ? (
          <Card title={m.injuryReport} headingLevel={3}>
            <ul className={styles.list}>
              {flags.map((f) => (
                <li key={f.name}>
                  <strong>{f.name}</strong> <span className={styles.muted}>({f.club})</span>{" "}
                  <Badge tone={f.label === "Doubtful" ? "warning" : "live"}>
                    {t.team.flags[f.label] ?? f.label}
                    {f.chance != null ? ` ${t.common.percent(String(f.chance))}` : ""}
                  </Badge>
                  {f.news ? (
                    <span className={styles.news}>
                      <English>{dash(f.news)}</English>
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {defcon.length ? (
          <Card title={m.defcon} headingLevel={3} className={styles.full}>
            <Fact>{m.defconRule}</Fact>
            <ul className={`${styles.bars} ${styles.barsWide}`}>
              {defcon.slice(0, 5).map((d) => (
                <li key={d.name}>
                  <span className={styles.barLabel}>
                    <span>{d.name}</span>
                    <span className={d.reached ? styles.reached : styles.muted}>
                      {d.matches > 1 ? m.defconMatches(d.value, d.matches) : `${d.value}/${d.threshold}`}
                      {d.reached ? m.defconBonus : ""}
                    </span>
                  </span>
                  <span className={styles.track} aria-hidden="true">
                    <span className={`${styles.fill} ${d.reached ? styles.fillDone : ""}`} style={{ width: `${Math.min(100, Math.round((d.value / (d.threshold * d.matches)) * 100))}%` }} />
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {rotation.length ? (
          <Card title={m.unusedSubs} headingLevel={3}>
            <Fact>{m.unusedIntro}</Fact>
            <ul className={styles.list}>
              {rotation.map((r) => (
                <li key={r.name}>
                  <strong>{r.name}</strong> <span className={styles.muted}>({r.club})</span> {r.wasStarter ? <Badge tone="warning">{m.starter}</Badge> : <Badge>{m.benchBadge}</Badge>}
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

      </div>
    </section>
  );
}

const gwLabel = (n: number, gw: number) => (n <= 8 ? getT().common.gw(gw) : String(gw));

/** Points each week next to the average manager's, with every number on the bars. */
function PointsChart({ charts }: { charts: SeasonCharts }) {
  const t = getT();
  const s = t.season;
  const n = charts.points.length;
  const hasAverage = charts.points.some((p) => p.average !== null);
  return (
    <BarChart
      bars={charts.points.map((p) => ({ label: gwLabel(n, p.gw), value: p.points, marker: p.average }))}
      label={s.pointsChart(charts.points.map((p) => s.pointsChartPart(t.common.gw(p.gw), p.points, p.average)).join(", "))}
      legend={
        hasAverage ? (
          <>
            <ChartKey kind="up">{s.keyAbove}</ChartKey>
            <ChartKey kind="down">{s.keyBelow}</ChartKey>
            <ChartKey kind="marker">{s.keyAverage}</ChartKey>
          </>
        ) : undefined
      }
    />
  );
}

function FormCard({ form, charts }: { form: SeasonForm; charts: SeasonCharts | null }) {
  const t = getT();
  const s = t.season;
  const f = getFormat();
  const gw = t.common.gw;
  const hits = charts?.points.filter((p) => p.hit > 0) ?? [];
  return (
    <Card title={s.form} headingLevel={3} className={styles.wide}>
      {charts ? <PointsChart charts={charts} /> : null}
      {charts?.beatAverage ? (
        <Fact>
          {s.beatAverageBefore}
          <strong>{charts.beatAverage.weeks}</strong>
          {s.beatAverageAfter(charts.beatAverage.weeks, charts.beatAverage.of)}
          {hits.length ? s.hitsNotShown(hits.map((h) => s.hitPart(gw(h.gw), h.hit)).join(", ")) : ""}
        </Fact>
      ) : null}
      <Fact>
        {s.averagingBefore}
        <strong>{f.oneDecimal(form.average)}</strong>
        {s.averagingAfter(gw(form.gameweeks[form.gameweeks.length - 1].gw), gw(form.best.gw), form.best.net, gw(form.worst.gw), form.worst.net)}
      </Fact>
      {form.firstRank != null && form.latestRank != null && !(charts && charts.ranks.length >= 2) ? ( // the Overall rank card says this when it can
        <Fact>
          {s.formRankStart(f.rank(form.firstRank))}
          <strong>{f.rank(form.latestRank)}</strong>
          {s.formRankEnd(form.bestRank ? f.rank(form.bestRank.rank) : null, form.bestRank ? gw(form.bestRank.gw) : "")}
        </Fact>
      ) : null}
    </Card>
  );
}

/** Where the season has taken this team: rank, bench, value and transfers, each as a chart with its numbers. */
function RankCard({ charts }: { charts: SeasonCharts }) {
  const t = getT();
  const s = t.season;
  const f = getFormat();
  const { ranks } = charts;
  if (ranks.length < 2) return null;
  const best = ranks.reduce((b, r) => (r.rank < b.rank ? r : b));
  const first = ranks[0];
  const last = ranks[ranks.length - 1];
  return (
    <Card title={s.overallRank} headingLevel={3} className={styles.wide}>
      <LineChart
        points={ranks.map((r) => ({ label: gwLabel(ranks.length, r.gw), value: r.rank }))}
        format={(n) => compactNumber(n, getLocale())}
        invert
        log
        minSpan={0.5}
        label={s.rankChartLabel(ranks.map((r) => s.rankChartPart(t.common.gw(r.gw), f.rank(r.rank))).join(", "))}
        legend={<span>{s.rankLegend}</span>}
      />
      <Fact>
        {s.rankStart(f.rank(first.rank), t.common.gw(first.gw))}
        <strong>{f.rank(last.rank)}</strong>
        {s.rankEnd(t.common.gw(last.gw), f.rank(best.rank), t.common.gw(best.gw), best.gw === last.gw)}
      </Fact>
    </Card>
  );
}

function BenchCard({ charts }: { charts: SeasonCharts }) {
  const t = getT();
  const s = t.season;
  const total = charts.bench.reduce((sum, b) => sum + b.points, 0);
  if (total === 0) return null;
  const worst = charts.bench.reduce((w, b) => (b.points > w.points ? b : w));
  return (
    <Card title={s.benchTitle} headingLevel={3}>
      <p className={styles.big}>
        {total}
        <span className={styles.bigNote}>{s.benchBigNote}</span>
      </p>
      <BarChart
        bars={charts.bench.map((b) => ({ label: gwLabel(charts.bench.length, b.gw), value: b.points }))}
        label={s.benchChart(charts.bench.map((b) => `${t.common.gw(b.gw)} ${b.points}`).join(", "))}
        height={80}
      />
      <Fact>{s.benchMost(t.common.gw(worst.gw), t.common.pts(worst.points))}</Fact>
      {charts.benchBoostWeeks.length ? <Fact>{s.benchBoostNote(charts.benchBoostWeeks.map((w) => t.common.gw(w)).join(", "))}</Fact> : null}
    </Card>
  );
}

function TransfersChart({ charts }: { charts: SeasonCharts }) {
  const t = getT();
  const s = t.season;
  const made = charts.transfers.reduce((sum, x) => sum + x.made, 0);
  if (made === 0) return null;
  return (
    <BarChart
      bars={charts.transfers.map((x) => ({ label: gwLabel(charts.transfers.length, x.gw), value: x.made }))}
      label={s.transfersChart(charts.transfers.map((x) => s.transferPart(t.common.gw(x.gw), x.made, x.hit)).join(", "))}
      height={70}
    />
  );
}

/** The manager's season, and how the current squad looks ahead. */
export function SeasonInsightsView({ season, squad, nextGw }: { season: SeasonInsights | null; squad: SquadInsights; nextGw: number }) {
  const t = getT();
  const s = t.season;
  const f = getFormat();
  const gw = t.common.gw;
  const { ownership, outlook } = squad;
  if (!season && !ownership && !outlook) return null;
  const chipName = (name: string) => (t.chips as Record<string, string>)[name] ?? name;

  return (
    <section aria-labelledby="season-heading" className="stack">
      <h2 id="season-heading" className={styles.sectionTitle}>
        {s.heading}
      </h2>
      <div className={styles.grid}>
        {season ? (
          <>
            {season.form ? <FormCard form={season.form} charts={season.charts} /> : null}
            {season.charts ? <RankCard charts={season.charts} /> : null}

            {nextGw <= season.seasonEnd ? (
              <Card title={s.transfers} headingLevel={3}>
                <p className={styles.big}>
                  {season.freeTransfers.available}
                  <span className={styles.bigNote}>{s.freeFor(season.freeTransfers.available, gw(nextGw))}</span>
                </p>
                <Fact>
                  {s.freeExplain(season.freeTransfers.max)}
                  {season.form ? s.madeThisSeason(season.form.transfers, season.form.hitPoints, t.common.pts(season.form.hitPoints)) : ""}
                </Fact>
                {season.charts ? <TransfersChart charts={season.charts} /> : null}
                {!season.freeTransfers.verified ? (
                  <Fact>
                    <Badge tone="warning">{s.unverified}</Badge> {s.unverifiedBody}
                  </Fact>
                ) : null}
              </Card>
            ) : null}

            {season.charts ? <BenchCard charts={season.charts} /> : null}

            {season.chips.length ? (
              <Card title={s.chips} headingLevel={3}>
                <ul className={styles.chips}>
                  {[...new Set(season.chips.map((c) => c.name))].map((name) => {
                    const slots = season.chips.filter((c) => c.name === name);
                    return (
                      <li key={name}>
                        <span className={styles.chipName}>{chipName(name)}</span>
                        <span className={styles.slots}>
                          {slots.map((slot) => (
                            <Badge key={slot.start} tone={slot.state === "available" ? "positive" : "neutral"} title={s.chipTitle(slot.start, slot.stop)}>
                              {slot.state === "used" ? s.used(gw(slot.usedIn ?? 0)) : slot.state === "available" ? s.available(gw(slot.stop)) : slot.state === "upcoming" ? s.opens(gw(slot.start)) : s.expired}
                            </Badge>
                          ))}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            ) : null}

            <Card title={s.experience} headingLevel={3}>
              <p className={styles.big}>{season.tenure.seasons === 0 ? s.firstSeason : s.seasonsBefore(season.tenure.seasons)}</p>
              {season.tenure.firstSeason ? <Fact>{s.hereSince(season.tenure.firstSeason)}</Fact> : null}
              {season.tenure.best ? (
                <Fact>
                  {s.bestFinishLabel}
                  <strong>{f.rank(season.tenure.best.rank)}</strong>
                  {s.bestFinish(season.tenure.best.season, f.number(season.tenure.best.points))}
                </Fact>
              ) : null}
            </Card>

            {season.form ? (
              <Card title={s.squadValue} headingLevel={3}>
                <p className={styles.big}>{f.money(season.form.value.now)}</p>
                <Fact>
                  {season.form.value.now === season.form.value.start
                    ? s.valueExact
                    : s.valueUpDown(season.form.value.now > season.form.value.start, f.money(Math.abs(season.form.value.now - season.form.value.start)))}{" "}
                  {s.valueIncludesBank}
                </Fact>
                {season.charts && season.charts.values.length > 1 ? (
                  <LineChart
                    points={season.charts.values.map((v) => ({ label: gwLabel(season.charts!.values.length, v.gw), value: v.value }))}
                    format={f.money}
                    label={s.valueChart(season.charts.values.map((v) => `${gw(v.gw)} ${f.money(v.value)}`).join(", "))}
                    height={80}
                    minSpan={20}
                  />
                ) : null}
              </Card>
            ) : null}
          </>
        ) : null}

        {ownership ? (
          <Card title={s.template} headingLevel={3}>
            <p className={styles.big}>
              {t.common.percent(f.oneDecimal(ownership.average))}<span className={styles.bigNote}>{s.avgOwnership}</span>
            </p>
            {ownership.differentials.length ? (
              <Fact>{s.differentials(ownership.differentials.map((d) => `${d.name} (${t.common.percent(f.decimal(d.ownership))})`).join(", "))}</Fact>
            ) : (
              <Fact>{s.noDifferentials}</Fact>
            )}
          </Card>
        ) : null}

        {outlook ? (
          <Card title={s.fixturesAhead} headingLevel={3}>
            <p className={styles.big}>
              {s.verdict[outlookVerdict(outlook.average)]}
              <span className={styles.bigNote}>{s.outlookNote(outlook.fromGw, outlook.toGw, f.oneDecimal(outlook.average))}</span>
            </p>
            <Fact>{s.outlookRuns(outlook.easiest.club, f.oneDecimal(outlook.easiest.average), outlook.hardest.club, f.oneDecimal(outlook.hardest.average))}</Fact>
          </Card>
        ) : null}
      </div>
    </section>
  );
}
