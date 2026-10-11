import { PageHeader, StateMessage } from "@/components/ui";
import type { FixtureFeedModel } from "@/lib/services/models";
import { FixtureFeed } from "./FixtureFeed";
import { FixturesTabs } from "./FixturesTabs";

/** The Fixtures page as it opens: every fixture of the season, scrolling. */
export function FixtureFeedView({ model }: { model: FixtureFeedModel }) {
  if (model.kind === "no-season" || model.gameweeks.length === 0) {
    return (
      <>
        <PageHeader title="Fixtures" />
        <StateMessage title="No fixtures yet">
          <p>The fixture list appears once FPL publishes the season.</p>
        </StateMessage>
      </>
    );
  }
  return (
    <>
      <PageHeader
        eyebrow="Every fixture, all season"
        title="Fixtures"
        meta={<span>Scroll through the lot. Doubles and blanks are flagged, and each side carries its difficulty from 1 (a gift) to 5 (a nightmare).</span>}
        actions={<FixturesTabs windows={model.windows} current="all" />}
      />
      <FixtureFeed gameweeks={model.gameweeks} teams={model.teams} startIndex={model.startIndex} />
    </>
  );
}
