import { getT } from "./i18n";
import styles from "./SkipLink.module.css";

export function SkipLink({ targetId = "main" }: { targetId?: string }) {
  return (
    <a className={styles.skip} href={`#${targetId}`}>
      {getT().client.nav.skip}
    </a>
  );
}
