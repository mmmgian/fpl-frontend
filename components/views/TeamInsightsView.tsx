import type { ReactNode } from "react";
import { Badge, BarChart, Card, CaptainBadge, ChartKey, LineChart } from "@/components/ui";
import { CHIP_LABEL, compactNumber, formatMoney, formatNumber, formatRank, oneDecimal, outlookVerdict } from "@/lib/domain";
import type { SeasonCharts, SeasonForm } from "@/lib/domain";
import type { GameweekInsights, SeasonInsights, SquadInsights } from "@/lib/services/models";
import styles from "./insights.module.css";

const pts = (n: number) => `${n} ${Math.abs(n) === 1 ? "pt" : "pts"}`;

function Fact({ children }: { children: ReactNode }) {
  return <p className={styles.fact}>{children}</p>;
}

/** Facts about this gameweek. Cards appear only when there is something true to say. */
export function MatchdayInsights({ data, gameweek }: { data: GameweekInsights; gameweek: string }) {
  const { captain, bench, chip, autoSubs, rotation, remaining, defcon, flags } = data;

  return (
    <section aria-labelledby="matchday-heading" className="stack">
      <h2 id="matchday-heading" className={styles.sectionTitle}>
        {gameweek} insights
      </h2>
      <div className={styles.grid}>
        {captain ? (
          <Card title="Captaincy" headingLevel={3}>
            <p className={styles.big}>
              {captain.captain.name} <CaptainBadge multiplier={captain.captain.multiplier} />
              <span className={styles.bigNote}>
                {pts(captain.captain.points)} ({captain.captain.base} × {captain.captain.multiplier})
              </span>
            </p>
            {captain.state === "waiting" ? (
              <Fact>Your skipper hasn&apos;t kicked a ball yet. Fingers crossed.</Fact>
            ) : captain.state === "unused" ? (
              <Fact>Your captain sat this one out, so there&apos;s no armband verdict.</Fact>
            ) : captain.regret === 0 ? (
              <Fact>Spot on: the best armband in your XI{captain.provisional ? " so far" : ""}.</Fact>
            ) : (
              <Fact>
                {captain.best.name} {captain.provisional ? "has scored" : "scored"} {captain.best.base}. Hand them the armband and you&apos;d have banked{" "}
                <strong>{pts(captain.regret ?? 0)}</strong> more{captain.provisional ? " so far" : ""}.
              </Fact>
            )}
            {captain.vice ? (
              <Fact>
                Vice-captain: {captain.vice.name}
                {captain.vice.base == null ? "" : `, ${pts(captain.vice.base)}`}
              </Fact>
            ) : null}
          </Card>
        ) : null}

        {chip ? (
          <Card title={CHIP_LABEL[chip.chip] ?? chip.chip} headingLevel={3}>
            <p className={styles.big}>
              +{chip.points}
              <span className={styles.bigNote}>{Math.abs(chip.points) === 1 ? "point" : "points"} from the chip</span>
            </p>
            <Fact>
              {chip.chip === "bboost"
                ? "Bench Boost is on, so your bench's points count too."
                : "Triple Captain: your skipper counts three times instead of twice, one extra copy of their points."}
            </Fact>
          </Card>
        ) : null}

        {bench ? (
          <Card title="Bench" headingLevel={3}>
            <p className={styles.big}>
              {pts(bench.points)}
              <span className={styles.bigNote}>{bench.counted ? "counted (Bench Boost)" : "left on the bench"}</span>
            </p>
            <Fact>{bench.players.map((p) => `${p.name} ${p.points}`).join(" · ")}</Fact>
            {!bench.counted && bench.points >= 10 ? <Fact>That&apos;s a lot of points to leave on the pine.</Fact> : null}
            {!bench.counted && bench.points === 0 ? <Fact>Nothing wasted. The bench did exactly what it&apos;s paid for.</Fact> : null}
          </Card>
        ) : null}

        {remaining ? (
          <Card title="Matchday" headingLevel={3}>
            <p className={styles.big}>
              {remaining.count}
              <span className={styles.bigNote}>still to play</span>
            </p>
            <Fact>
              {remaining.count === 0
                ? `Every one of your ${remaining.played} counting players has taken the field.`
                : `${remaining.played} of ${remaining.played + remaining.count} have played. Allowing for the armband, that's ${remaining.effective} ${remaining.effective === 1 ? "player's" : "players'"} worth of points still on the way.`}
            </Fact>
          </Card>
        ) : null}

        {autoSubs.length ? (
          <Card title="Auto-subs" headingLevel={3}>
            <ul className={styles.list}>
              {autoSubs.map((s) => (
                <li key={`${s.in.name}-${s.out.name}`}>
                  <strong>{s.in.name}</strong> on for {s.out.name} <span className={styles.muted}>({s.in.points} v {s.out.points})</span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {defcon.length ? (
          <Card title="Defensive contributions" headingLevel={3}>
            <Fact>Who&apos;s closest to the +2 DefCon bonus? A player earns it in a match with 10 defensive contributions as a defender, or 12 as a midfielder or forward.</Fact>
            <ul className={styles.bars}>
              {defcon.slice(0, 5).map((d) => (
                <li key={d.name}>
                  <span className={styles.barLabel}>
                    <span>{d.name}</span>
                    <span className={d.reached ? styles.reached : styles.muted}>
                      {d.matches > 1 ? `${d.value} in ${d.matches} matches` : `${d.value}/${d.threshold}`}
                      {d.reached ? " · +2 pts" : ""}
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
          <Card title="Unused subs" headingLevel={3}>
            <Fact>Fit, but their club&apos;s match is over and they never got on:</Fact>
            <ul className={styles.list}>
              {rotation.map((r) => (
                <li key={r.name}>
                  <strong>{r.name}</strong> <span className={styles.muted}>({r.club})</span> {r.wasStarter ? <Badge tone="warning">Starter</Badge> : <Badge>Bench</Badge>}
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {flags.length ? (
          <Card title="Injury report" headingLevel={3}>
            <ul className={styles.list}>
              {flags.map((f) => (
                <li key={f.name}>
                  <strong>{f.name}</strong> <span className={styles.muted}>({f.club})</span>{" "}
                  <Badge tone={f.label === "Doubtful" ? "warning" : "live"}>
                    {f.label}
                    {f.chance != null ? ` ${f.chance}%` : ""}
                  </Badge>
                  {f.news ? <span className={styles.news}>{f.news}</span> : null}
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>
    </section>
  );
}

const gwLabel = (n: number, gw: number) => (n <= 8 ? `GW${gw}` : String(gw));

/** Points each week next to the average manager's, with every number on the bars. */
function PointsChart({ charts }: { charts: SeasonCharts }) {
  const n = charts.points.length;
  const hasAverage = charts.points.some((p) => p.average !== null);
  return (
    <BarChart
      bars={charts.points.map((p) => ({ label: gwLabel(n, p.gw), value: p.points, marker: p.average }))}
      label={`Points each gameweek before hits, next to the average manager's score: ${charts.points.map((p) => `GW${p.gw} ${p.points}${p.average !== null ? ` against ${p.average}` : ""}`).join(", ")}`}
      legend={
        hasAverage ? (
          <>
            <ChartKey kind="up">Above the average</ChartKey>
            <ChartKey kind="down">Below it</ChartKey>
            <ChartKey kind="marker">Average manager</ChartKey>
          </>
        ) : undefined
      }
    />
  );
}

function FormCard({ form, charts }: { form: SeasonForm; charts: SeasonCharts | null }) {
  const hits = charts?.points.filter((p) => p.hit > 0) ?? [];
  return (
    <Card title="Form" headingLevel={3} className={styles.wide}>
      {charts ? <PointsChart charts={charts} /> : null}
      {charts?.beatAverage ? (
        <Fact>
          Scored more than the average manager in <strong>{charts.beatAverage.weeks}</strong> of {charts.beatAverage.of} {charts.beatAverage.of === 1 ? "week" : "weeks"}, before hits.
          {hits.length ? ` Hits not shown: ${hits.map((h) => `GW${h.gw} cost ${h.hit}`).join(", ")}.` : ""}
        </Fact>
      ) : null}
      <Fact>
        Averaging <strong>{oneDecimal(form.average)}</strong> a week through GW{form.gameweeks[form.gameweeks.length - 1].gw}. High point: GW{form.best.gw} with {form.best.net}. Low point: GW{form.worst.gw} with {form.worst.net}.
      </Fact>
      {form.firstRank != null && form.latestRank != null && !(charts && charts.ranks.length >= 2) ? (   // the Overall rank card says this when it can
        <Fact>
          Overall rank {formatRank(form.firstRank)} → <strong>{formatRank(form.latestRank)}</strong>
          {form.bestRank ? ` (best: ${formatRank(form.bestRank.rank)} after GW${form.bestRank.gw})` : ""}.
        </Fact>
      ) : null}
    </Card>
  );
}

/** Where the season has taken this team: rank, bench, value and transfers, each as a chart with its numbers. */
function RankCard({ charts }: { charts: SeasonCharts }) {
  const { ranks } = charts;
  if (ranks.length < 2) return null;
  const best = ranks.reduce((b, r) => (r.rank < b.rank ? r : b));
  const first = ranks[0];
  const last = ranks[ranks.length - 1];
  return (
    <Card title="Overall rank" headingLevel={3} className={styles.wide}>
      <LineChart
        points={ranks.map((r) => ({ label: gwLabel(ranks.length, r.gw), value: r.rank }))}
        format={compactNumber}
        invert
        log
        minSpan={0.5}
        label={`Overall rank after each gameweek, higher on the chart is better: ${ranks.map((r) => `GW${r.gw} ${formatRank(r.rank)}`).join(", ")}`}
        legend={<span>Higher is better. Spaced by order of magnitude, so a jump from millions to thousands stays readable; small moves stay small.</span>}
      />
      <Fact>
        {formatRank(first.rank)} after GW{first.gw} → <strong>{formatRank(last.rank)}</strong> after GW{last.gw}
        {best.gw !== last.gw ? `. Best so far: ${formatRank(best.rank)} after GW${best.gw}` : ", the best so far"}.
      </Fact>
    </Card>
  );
}

function BenchCard({ charts }: { charts: SeasonCharts }) {
  const total = charts.bench.reduce((s, b) => s + b.points, 0);
  if (total === 0) return null;
  const worst = charts.bench.reduce((w, b) => (b.points > w.points ? b : w));
  return (
    <Card title="Bench" headingLevel={3}>
      <p className={styles.big}>
        {total}
        <span className={styles.bigNote}>points left on the bench</span>
      </p>
      <BarChart
        bars={charts.bench.map((b) => ({ label: gwLabel(charts.bench.length, b.gw), value: b.points }))}
        label={`Points left on the bench each gameweek: ${charts.bench.map((b) => `GW${b.gw} ${b.points}`).join(", ")}`}
        height={80}
      />
      <Fact>Most wasted in GW{worst.gw}: {pts(worst.points)}.</Fact>
      {charts.benchBoostWeeks.length ? (
        <Fact>
          Not counted: {charts.benchBoostWeeks.map((w) => `GW${w}`).join(", ")} (Bench Boost, when the bench&apos;s points count).
        </Fact>
      ) : null}
    </Card>
  );
}

function TransfersChart({ charts }: { charts: SeasonCharts }) {
  const made = charts.transfers.reduce((s, t) => s + t.made, 0);
  if (made === 0) return null;
  return (
    <BarChart
      bars={charts.transfers.map((t) => ({ label: gwLabel(charts.transfers.length, t.gw), value: t.made }))}
      label={`Transfers made each gameweek: ${charts.transfers.map((t) => `GW${t.gw} ${t.made}${t.hit ? ` (cost ${t.hit})` : ""}`).join(", ")}`}
      height={70}
    />
  );
}

/** The manager's season, and how the current squad looks ahead. */
export function SeasonInsightsView({ season, squad, nextGw }: { season: SeasonInsights | null; squad: SquadInsights; nextGw: number }) {
  const { ownership, outlook } = squad;
  if (!season && !ownership && !outlook) return null;

  return (
    <section aria-labelledby="season-heading" className="stack">
      <h2 id="season-heading" className={styles.sectionTitle}>
        Season
      </h2>
      <div className={styles.grid}>
        {season ? (
          <>
            {season.form ? <FormCard form={season.form} charts={season.charts} /> : null}
            {season.charts ? <RankCard charts={season.charts} /> : null}

            {nextGw <= season.seasonEnd ? (
              <Card title="Transfers" headingLevel={3}>
                <p className={styles.big}>
                  {season.freeTransfers.available}
                  <span className={styles.bigNote}>
                    free {season.freeTransfers.available === 1 ? "transfer" : "transfers"} for GW{nextGw}
                  </span>
                </p>
                <Fact>
                  Worked out from your transfer history (up to {season.freeTransfers.max} can be banked), so FPL&apos;s own count has the final word.
                  {season.form
                    ? ` ${season.form.transfers} made this season${season.form.hitPoints ? `, and the hits cost you ${pts(season.form.hitPoints)}` : ", and not a single hit taken"}.`
                    : ""}
                </Fact>
                {season.charts ? <TransfersChart charts={season.charts} /> : null}
                {!season.freeTransfers.verified ? (
                  <Fact>
                    <Badge tone="warning">Unverified</Badge> Your hits don&apos;t match this count, so FPL may have granted extra transfers.
                  </Fact>
                ) : null}
              </Card>
            ) : null}

            {season.charts ? <BenchCard charts={season.charts} /> : null}

            {season.chips.length ? (
              <Card title="Chips" headingLevel={3}>
                <ul className={styles.chips}>
                  {[...new Set(season.chips.map((c) => c.name))].map((name) => {
                    const slots = season.chips.filter((c) => c.name === name);
                    return (
                      <li key={name}>
                        <span className={styles.chipName}>{slots[0].label}</span>
                        <span className={styles.slots}>
                          {slots.map((s) => (
                            <Badge key={s.start} tone={s.state === "used" ? "neutral" : s.state === "available" ? "positive" : "neutral"} title={`GW${s.start}–${s.stop}`}>
                              {s.state === "used" ? `Used GW${s.usedIn}` : s.state === "available" ? `Available to GW${s.stop}` : s.state === "upcoming" ? `Opens GW${s.start}` : "Expired"}
                            </Badge>
                          ))}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            ) : null}

            <Card title="Experience" headingLevel={3}>
              <p className={styles.big}>
                {season.tenure.seasons === 0 ? "First season" : `${season.tenure.seasons} ${season.tenure.seasons === 1 ? "season" : "seasons"} before this`}
              </p>
              {season.tenure.firstSeason ? <Fact>Here since {season.tenure.firstSeason}.</Fact> : null}
              {season.tenure.best ? (
                <Fact>
                  Best finish: <strong>{formatRank(season.tenure.best.rank)}</strong> in {season.tenure.best.season} ({formatNumber(season.tenure.best.points)} pts).
                </Fact>
              ) : null}
            </Card>

            {season.form ? (
              <Card title="Squad value" headingLevel={3}>
                <p className={styles.big}>{formatMoney(season.form.value.now)}</p>
                <Fact>
                  {season.form.value.now === season.form.value.start
                    ? "Exactly where it started."
                    : `${season.form.value.now > season.form.value.start ? "Up" : "Down"} ${formatMoney(Math.abs(season.form.value.now - season.form.value.start))} since day one.`}{" "}
                  That&apos;s the squad and the bank together.
                </Fact>
                {season.charts && season.charts.values.length > 1 ? (
                  <LineChart
                    points={season.charts.values.map((v) => ({ label: gwLabel(season.charts!.values.length, v.gw), value: v.value }))}
                    format={formatMoney}
                    label={`Team value after each gameweek: ${season.charts.values.map((v) => `GW${v.gw} ${formatMoney(v.value)}`).join(", ")}`}
                    height={80}
                    minSpan={20}
                  />
                ) : null}
              </Card>
            ) : null}
          </>
        ) : null}

        {ownership ? (
          <Card title="Template check" headingLevel={3}>
            <p className={styles.big}>
              {oneDecimal(ownership.average)}%<span className={styles.bigNote}>average ownership in your XI</span>
            </p>
            {ownership.differentials.length ? (
              <Fact>
                Your differentials, the starters owned by under 10%: {ownership.differentials.map((d) => `${d.name} (${d.ownership}%)`).join(", ")}.
              </Fact>
            ) : (
              <Fact>Not one starter is owned by fewer than 10% of managers.</Fact>
            )}
          </Card>
        ) : null}

        {outlook ? (
          <Card title="Fixtures ahead" headingLevel={3}>
            <p className={styles.big}>
              {outlookVerdict(outlook.average)}
              <span className={styles.bigNote}>
                GW{outlook.fromGw}–{outlook.toGw}, difficulty {oneDecimal(outlook.average)}
              </span>
            </p>
            <Fact>
              Softest run: {outlook.easiest.club} ({oneDecimal(outlook.easiest.average)}). Toughest test: {outlook.hardest.club} ({oneDecimal(outlook.hardest.average)}).
            </Fact>
          </Card>
        ) : null}
      </div>
    </section>
  );
}
