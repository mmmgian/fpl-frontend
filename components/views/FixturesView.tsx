import { ClubLink, Crest, FdrChip, GameweekPager, PageHeader, StateMessage, getFormat, getIntlLocale, getT } from "@/components/ui";
import type { FixturesModel } from "@/lib/services/models";
import { FixturesTabs } from "./FixturesTabs";
import styles from "./fixtures.module.css";

const href = (gw: number, window: number) => `/fixtures?gw=${gw}&n=${window}`;

export function FixturesView({ model }: { model: FixturesModel }) {
  const t = getT();
  const f = t.fixtures;
  const format = getFormat();
  const dateLabel = new Intl.DateTimeFormat(getIntlLocale(), { day: "numeric", month: "short", timeZone: "UTC" });
  if (model.kind === "no-season") {
    return (
      <>
        <PageHeader title={t.meta.fixtures} />
        <StateMessage title={f.none}>
          <p>{f.noneBody}</p>
        </StateMessage>
      </>
    );
  }

  const { start, window, columns, rows } = model;
  return (
    <>
      <PageHeader
        eyebrow={f.gridEyebrow}
        title={t.meta.fixtures}
        meta={
          <>
            <span>{f.gridIntro(columns[0].gw, columns[columns.length - 1].gw)}</span>
            <span className={styles.legend} role="img" aria-label={t.client.fdr.scale}>
              {([1, 2, 3, 4, 5] as const).map((d) => (
                <FdrChip key={d} band={d} label={t.client.fdr.difficulty(d)}>
                  <span aria-hidden="true">{d}</span>
                </FdrChip>
              ))}
            </span>
          </>
        }
        actions={
          <>
            <FixturesTabs windows={model.windows} current={window} start={start} />
            <GameweekPager gw={start} min={model.min} max={model.max} href={(n) => href(n, window)} label={t.pager.startGameweekLabel} />
          </>
        }
      />

      <div className={styles.region} role="region" aria-label={f.gridRegion} tabIndex={0}>
        <table className={styles.table}>
          <caption className="sr-only">
            {f.gridCaption(columns[0].gw, columns[columns.length - 1].gw)}
          </caption>
          <thead>
            <tr>
              <th scope="col" className={`${styles.team} ${styles.corner}`}>
                {t.common.team}
              </th>
              {columns.map((c) => (
                <th key={c.gw} scope="col" className={styles.gw}>
                  <span className={styles.gwNumber}>{t.common.gw(c.gw)}</span>
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
                        <span className={styles.avg}>{f.avg(format.oneDecimal(row.average))}</span>
                      </span>
                    </ClubLink>
                    <span className="sr-only">
                      {f.rankSr(row.rank, row.team.name)}
                    </span>
                  </span>
                </th>
                {row.cells.map((matches, i) => (
                  <td key={columns[i].gw} className={styles.cell}>
                    {matches.length === 0 ? (
                      <span className={styles.blank}>
                        <span aria-hidden="true">–</span>
                        <span className="sr-only">{f.noFixture}</span>
                      </span>
                    ) : (
                      matches.map((m, j) => (
                        <FdrChip key={j} band={m.band} block label={t.client.fdr.difficulty(m.band)}>
                          <span>
                            <ClubLink id={m.opponentId} name={m.opponentName}>
                              {m.opponent}
                            </ClubLink>{" "}
                            <span className={styles.venue}>({m.home ? f.homeShort : f.awayShort})</span>
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
