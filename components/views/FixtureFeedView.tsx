import { PageHeader, StateMessage, getT } from "@/components/ui";
import type { FixtureFeedModel } from "@/lib/services/models";
import { FixtureFeed } from "./FixtureFeed";
import { FixturesTabs } from "./FixturesTabs";

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
        meta={<span>{t.feedIntro}</span>}
        actions={<FixturesTabs windows={model.windows} current="all" />}
      />
      <FixtureFeed gameweeks={model.gameweeks} teams={model.teams} startIndex={model.startIndex} />
    </>
  );
}
