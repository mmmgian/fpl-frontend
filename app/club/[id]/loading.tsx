import { LoadingState, Skeleton, getT } from "@/components/ui";
import { initLocale } from "@/app/locale";

/** Rendered alongside the layout, not after it, so it sets the language itself. */
export default async function Loading() {
  await initLocale();
  const t = getT().loading;
  return (
    <LoadingState label={t.club}>
      <Skeleton width={140} />
      <Skeleton width={240} height={34} />
      <div style={{ display: "grid", gap: 12 }}>
        <Skeleton height={140} radius={16} />
        <Skeleton height={140} radius={16} />
        <Skeleton height={220} radius={16} />
      </div>
    </LoadingState>
  );
}
