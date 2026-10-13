import { LoadingState, Skeleton, getT } from "@/components/ui";
import styles from "@/components/views/views.module.css";
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
      <Skeleton width={90} />
      <Skeleton width={240} height={34} />
      <div className={styles.snapshotList}>
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} height={74} radius={12} />
        ))}
      </div>
    </LoadingState>
  );
}
