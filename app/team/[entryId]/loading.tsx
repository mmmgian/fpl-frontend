import { LoadingState, Skeleton, TableSkeleton, getT } from "@/components/ui";
import styles from "@/components/views/views.module.css";
import { initLocale } from "@/app/locale";

/** Rendered alongside the layout, not after it, so it sets the language itself. */
export default async function Loading() {
  await initLocale();
  const t = getT().loading;
  return (
    <LoadingState label={t.team}>
      <Skeleton width={120} />
      <Skeleton width={260} height={34} />
      <div className={styles.positionGrid}>
        {[1, 2, 3, 4].map((k) => (
          <TableSkeleton key={k} rows={k === 1 ? 1 : 4} columns={3} />
        ))}
      </div>
    </LoadingState>
  );
}
