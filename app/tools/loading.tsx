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
    <LoadingState label={line(t.tools)}>
      <Skeleton width={160} height={34} />
      <Skeleton height={120} radius={8} />
      <Skeleton height={320} radius={8} />
      <Skeleton height={320} radius={8} />
    </LoadingState>
  );
}
