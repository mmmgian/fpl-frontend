import styles from "./SkipLink.module.css";

export function SkipLink({ targetId = "main" }: { targetId?: string }) {
  return (
    <a className={styles.skip} href={`#${targetId}`}>
      Skip to content
    </a>
  );
}
