import { LoadingState, Skeleton, getT } from "@/components/ui";
import styles from "@/components/views/views.module.css";
import { initLocale } from "@/app/locale";

/** Rendered alongside the layout, not after it, so it sets the language itself. */
export default async function Loading() {
  await initLocale();
  const t = getT().loading;
  return (
    <LoadingState label={t.bonus}>
      <Skeleton width={120} />
      <Skeleton width={220} height={34} />
      <div className={styles.fixtureGrid}>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} style={{ display: "grid", gap: 10, padding: 16, border: "1px solid var(--border)", borderRadius: 12 }}>
            <Skeleton height={22} />
            <Skeleton width="60%" />
            <Skeleton width="80%" />
            <Skeleton width="70%" />
          </div>
        ))}
      </div>
    </LoadingState>
  );
}
