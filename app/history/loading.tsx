import { LoadingState, Skeleton, TableSkeleton, getT } from "@/components/ui";
import { pickVariant, varietyKey } from "@/lib/domain";
import { initLocale } from "@/app/locale";

/** Rendered alongside the layout, not after it, so it sets the language itself. */
export default async function Loading() {
  await initLocale();
  const t = getT().loading;
  // No data yet, so the day alone picks the line: a different one each day, the same all day.
  const line = (items: readonly string[]) => pickVariant(items, varietyKey(0, "upcoming", new Date()), 1);
  return (
    <LoadingState
      label={line(t.history)}
      slowHint={t.historySlow}
    >
      {/* The shape of a past table (/history goes straight on to /times#tables): back link, title, summary, then the table. */}
      <Skeleton width={110} />
      <Skeleton width={90} />
      <Skeleton width={280} height={34} />
      <Skeleton height={40} />
      <TableSkeleton rows={21} columns={5} />
    </LoadingState>
  );
}
