import { LoadingState, Skeleton } from "@/components/ui";
import styles from "@/components/views/times.module.css";

export default function Loading() {
  return (
    <LoadingState label="Loading The Times">
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
