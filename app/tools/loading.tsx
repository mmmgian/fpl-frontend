import { LoadingState, Skeleton, getT } from "@/components/ui";
import { initLocale } from "@/app/locale";

/** Rendered alongside the layout, not after it, so it sets the language itself. */
export default async function Loading() {
  await initLocale();
  const t = getT().loading;
  return (
    <LoadingState label={t.tools}>
      <Skeleton width={160} height={34} />
      <Skeleton height={120} radius={8} />
      <Skeleton height={320} radius={8} />
      <Skeleton height={320} radius={8} />
    </LoadingState>
  );
}
