import { LoadingState, Skeleton, getT } from "@/components/ui";
import { initLocale } from "@/app/locale";

/** Rendered alongside the layout, not after it, so it sets the language itself. */
export default async function Loading() {
  await initLocale();
  const t = getT().loading;
  return (
    <LoadingState label={t.fixtures}>
      <Skeleton width={110} />
      <Skeleton width={180} height={34} />
      <div style={{ display: "grid", gap: 8 }}>
        {Array.from({ length: 10 }, (_, i) => (
          <Skeleton key={i} height={46} radius={12} />
        ))}
      </div>
    </LoadingState>
  );
}
