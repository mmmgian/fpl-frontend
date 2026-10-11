import { LoadingState, Skeleton, TableSkeleton } from "@/components/ui";
import styles from "@/components/views/views.module.css";

export default function Loading() {
  return (
    <LoadingState label="Loading team">
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
