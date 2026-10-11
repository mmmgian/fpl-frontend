import { LoadingState, Skeleton, getT } from "@/components/ui";
import styles from "@/components/views/views.module.css";
import { initLocale } from "@/app/locale";

/** Rendered alongside the layout, not after it, so it sets the language itself. */
export default async function Loading() {
  await initLocale();
  const t = getT().loading;
  return (
    <LoadingState
      label={t.history}
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
