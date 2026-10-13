import { LoadingState, Skeleton, getT } from "@/components/ui";
import { pickVariant, varietyKey } from "@/lib/domain";
import { initLocale } from "@/app/locale";

/** Rendered alongside the layout, not after it, so it sets the language itself. */
export default async function Loading() {
  await initLocale();
  const t = getT().loading;
  // No data yet, so the day alone picks the line: a different one each day, the same all day.
  const line = (items: readonly string[]) => pickVariant(items, varietyKey(0, "upcoming", new Date()), 1);
  return (
    <LoadingState label={line(t.issue)}>
      <Skeleton width={110} />
      <Skeleton width={260} height={34} />
      {/* The same proportions as an A4 page, so the layout doesn't jump when it arrives. */}
      <div style={{ width: "min(100%, 560px)", aspectRatio: "1080 / 1528", marginInline: "auto" }}>
        <Skeleton height="100%" radius={6} />
      </div>
      <Skeleton height={44} radius={22} />
    </LoadingState>
  );
}
