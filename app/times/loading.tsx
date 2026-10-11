import { LoadingState, Skeleton, getT } from "@/components/ui";
import styles from "@/components/views/times.module.css";
import { initLocale } from "@/app/locale";

/** Rendered alongside the layout, not after it, so it sets the language itself. */
export default async function Loading() {
  await initLocale();
  const t = getT().loading;
  return (
    <LoadingState label={t.times}>
      <div className={styles.masthead}>
        <Skeleton width="60%" height={64} radius={8} />
      </div>
      <Skeleton height={260} radius={20} />
      <div className={styles.grid}>
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} height={300} radius={16} />
        ))}
      </div>
    </LoadingState>
  );
}
