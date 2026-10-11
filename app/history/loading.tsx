import { LoadingState, Skeleton } from "@/components/ui";
import styles from "@/components/views/views.module.css";

export default function Loading() {
  return (
    <LoadingState
      label="Loading history"
      slowHint="Waking up the history server. It sleeps when idle, so the first visit can take up to a minute."
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
