import { LoadingState, Skeleton, TableSkeleton, getT } from "@/components/ui";
import { initLocale } from "@/app/locale";

/** Rendered alongside the layout, not after it, so it sets the language itself. */
export default async function Loading() {
  await initLocale();
  const t = getT().loading;
  return (
    <LoadingState label={t.league}>
      <Skeleton width={220} height={34} />
      <Skeleton width={160} />
      <TableSkeleton rows={10} />
    </LoadingState>
  );
}
