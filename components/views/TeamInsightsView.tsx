import type { ReactNode } from "react";
import { Badge, Card, CaptainBadge, Sparkline } from "@/components/ui";
import { CHIP_LABEL, formatMoney, formatNumber, formatRank, oneDecimal, outlookVerdict } from "@/lib/domain";
import type { SeasonForm } from "@/lib/domain";
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
              <Fact>Your captain hasn&apos;t played yet.</Fact>
            ) : captain.state === "unused" ? (
              <Fact>Your captain didn&apos;t play, so the armband isn&apos;t judged here.</Fact>
            ) : captain.regret === 0 ? (
              <Fact>The best armband in your XI{captain.provisional ? " so far" : ""}.</Fact>
            ) : (
              <Fact>
                {captain.best.name} {captain.provisional ? "has scored" : "scored"} {captain.best.base}. Captaining {captain.best.name} would{" "}
                {captain.provisional ? "have added so far" : "have added"} <strong>{pts(captain.regret ?? 0)}</strong>.
              </Fact>
            )}
            {captain.vice ? (
              <Fact>
                Vice-captain: {captain.vice.name}
                {captain.vice.base == null ? "" : ` (${pts(captain.vice.base)})`}
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
                ? "Your bench's points, counted because Bench Boost is active."
                : "One extra copy of your captain's points (3× instead of 2×)."}
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
                ? `All ${remaining.played} counting players have played.`
                : `${remaining.played} of ${remaining.played + remaining.count} have played. Counting the captain's multiplier, that is ${remaining.effective} ${remaining.effective === 1 ? "player's" : "players'"} worth of points still to come.`}
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
            <Fact>Closest to the +2 DefCon bonus, earned per match: 10 for defenders, 12 for midfielders and forwards.</Fact>
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
            <Fact>Fit, but their club&apos;s match is over and they never played:</Fact>
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

function FormCard({ form }: { form: SeasonForm }) {
  return (
    <Card title="Form" headingLevel={3} className={styles.wide}>
      <Sparkline
        values={form.gameweeks.map((g) => g.net)}
        highlight={form.gameweeks.findIndex((g) => g.gw === form.best.gw)}
        label={`Points per gameweek: ${form.gameweeks.map((g) => `GW${g.gw} ${g.net}`).join(", ")}`}
      />
      <Fact>
        Average <strong>{oneDecimal(form.average)}</strong> a week through GW{form.gameweeks[form.gameweeks.length - 1].gw}. Best GW{form.best.gw} ({form.best.net}), worst GW{form.worst.gw} ({form.worst.net}).
      </Fact>
      {form.firstRank != null && form.latestRank != null ? (
        <Fact>
          Overall rank {formatRank(form.firstRank)} → <strong>{formatRank(form.latestRank)}</strong>
          {form.bestRank ? ` (best: ${formatRank(form.bestRank.rank)} after GW${form.bestRank.gw})` : ""}.
        </Fact>
      ) : null}
    </Card>
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
            {season.form ? <FormCard form={season.form} /> : null}

            {nextGw <= season.seasonEnd ? (
              <Card title="Transfers" headingLevel={3}>
                <p className={styles.big}>
                  {season.freeTransfers.available}
                  <span className={styles.bigNote}>
                    free {season.freeTransfers.available === 1 ? "transfer" : "transfers"} for GW{nextGw}
                  </span>
                </p>
                <Fact>
                  Worked out from your transfer history ({season.freeTransfers.max} can be banked); FPL&apos;s own count is the one that applies.
                  {season.form
                    ? ` ${season.form.transfers} made this season${season.form.hitPoints ? `, costing ${pts(season.form.hitPoints)} in hits` : ", no hits taken"}.`
                    : ""}
                </Fact>
                {!season.freeTransfers.verified ? (
                  <Fact>
                    <Badge tone="warning">Unverified</Badge> Your hits don&apos;t match this count, so FPL may have granted extra transfers.
                  </Fact>
                ) : null}
              </Card>
            ) : null}

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
              {season.tenure.firstSeason ? <Fact>Playing since {season.tenure.firstSeason}.</Fact> : null}
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
                    ? "Unchanged since the first gameweek."
                    : `${season.form.value.now > season.form.value.start ? "Up" : "Down"} ${formatMoney(Math.abs(season.form.value.now - season.form.value.start))} since the first gameweek.`}{" "}
                  Includes the bank.
                </Fact>
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
                Differentials: {ownership.differentials.map((d) => `${d.name} (${d.ownership}%)`).join(", ")}.
              </Fact>
            ) : (
              <Fact>No starter is owned by under 10% of managers.</Fact>
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
              Easiest run: {outlook.easiest.club} ({oneDecimal(outlook.easiest.average)}). Toughest: {outlook.hardest.club} ({oneDecimal(outlook.hardest.average)}).
            </Fact>
          </Card>
        ) : null}
      </div>
    </section>
  );
}
