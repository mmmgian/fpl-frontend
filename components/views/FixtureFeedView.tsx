import { PageHeader, StateMessage, getT } from "@/components/ui";
import { pickVariant } from "@/lib/domain";
import type { FixtureFeedModel } from "@/lib/services/models";
import { FixtureFeed } from "./FixtureFeed";
import { FixturesTabs } from "./FixturesTabs";
import { fixturesLede } from "./fixturesLede";
import styles from "./fixtures.module.css";

/** The Fixtures page as it opens: every fixture of the season, scrolling. */
export function FixtureFeedView({ model }: { model: FixtureFeedModel }) {
  const t = getT().fixtures;
  if (model.kind === "no-season" || model.gameweeks.length === 0) {
    return (
      <>
        <PageHeader title={getT().meta.fixtures} />
        <StateMessage title={t.none}>
          <p>{t.noneBody}</p>
        </StateMessage>
      </>
    );
  }
  return (
    <>
      <PageHeader
        eyebrow={t.feedEyebrow}
        title={getT().meta.fixtures}
        meta={<span>{pickVariant(t.feedIntro, model.variety)}</span>}
        actions={<FixturesTabs windows={model.windows} current="all" />}
      />
      <p className={styles.lede}>{fixturesLede(model.highlights, model.next, model.variety).join(" ")}</p>
      <FixtureFeed gameweeks={model.gameweeks} teams={model.teams} startIndex={model.startIndex} />
    </>
  );
}
