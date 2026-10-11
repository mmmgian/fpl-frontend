import { ClubLink, Crest, FdrChip, GameweekPager, PageHeader, StateMessage } from "@/components/ui";
import { oneDecimal } from "@/lib/domain";
import type { FixturesModel } from "@/lib/services/models";
import { FixturesTabs } from "./FixturesTabs";
import styles from "./fixtures.module.css";

const dateLabel = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

const href = (gw: number, window: number) => `/fixtures?gw=${gw}&n=${window}`;

export function FixturesView({ model }: { model: FixturesModel }) {
  if (model.kind === "no-season") {
    return (
      <>
        <PageHeader title="Fixtures" />
        <StateMessage title="No fixtures yet">
          <p>The fixture list appears once FPL publishes the season.</p>
        </StateMessage>
      </>
    );
  }

  const { start, window, columns, rows } = model;
  return (
    <>
      <PageHeader
        eyebrow="Fixture difficulty"
        title="Fixtures"
        meta={
          <>
            <span>Easiest run first, over GW{columns[0].gw}–GW{columns[columns.length - 1].gw}</span>
            <span className={styles.legend} role="img" aria-label="Difficulty scale: 1 easiest to 5 hardest">
              {([1, 2, 3, 4, 5] as const).map((d) => (
                <FdrChip key={d} band={d}>
                  <span aria-hidden="true">{d}</span>
                </FdrChip>
              ))}
            </span>
          </>
        }
        actions={
          <>
            <FixturesTabs windows={model.windows} current={window} start={start} />
            <GameweekPager gw={start} min={model.min} max={model.max} href={(n) => href(n, window)} label="Start gameweek" />
          </>
        }
      />

      <div className={styles.region} role="region" aria-label="Fixture difficulty table" tabIndex={0}>
        <table className={styles.table}>
          <caption className="sr-only">
            Fixture difficulty from gameweek {columns[0].gw} to {columns[columns.length - 1].gw}, easiest run first
          </caption>
          <thead>
            <tr>
              <th scope="col" className={`${styles.team} ${styles.corner}`}>
                Team
              </th>
              {columns.map((c) => (
                <th key={c.gw} scope="col" className={styles.gw}>
                  <span className={styles.gwNumber}>GW{c.gw}</span>
                  {c.deadline ? <span className={styles.gwDate}>{dateLabel.format(new Date(c.deadline))}</span> : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.team.id}>
                <th scope="row" className={styles.team}>
                  <span className={styles.teamCell}>
                    <span className={styles.rank} aria-hidden="true">
                      {row.rank}
                    </span>
                    <ClubLink id={row.team.id} name={row.team.name} className={styles.teamLink}>
                      <Crest code={row.team.code} name={row.team.name} size={22} />
                      <span className={styles.teamText}>
                        <span className={styles.teamName}>{row.team.short}</span>
                        <span className={styles.avg}>avg {oneDecimal(row.average)}</span>
                      </span>
                    </ClubLink>
                    <span className="sr-only">
                      Rank {row.rank}, {row.team.name}
                    </span>
                  </span>
                </th>
                {row.cells.map((matches, i) => (
                  <td key={columns[i].gw} className={styles.cell}>
                    {matches.length === 0 ? (
                      <span className={styles.blank}>
                        <span aria-hidden="true">–</span>
                        <span className="sr-only">No fixture</span>
                      </span>
                    ) : (
                      matches.map((m, j) => (
                        <FdrChip key={j} band={m.band} block>
                          <span>
                            <ClubLink id={m.opponentId} name={m.opponentName}>
                              {m.opponent}
                            </ClubLink>{" "}
                            <span className={styles.venue}>({m.home ? "H" : "A"})</span>
                          </span>
                          <span className={styles.diff} aria-hidden="true">
                            {m.difficulty}
                          </span>
                        </FdrChip>
                      ))
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
