import { Badge } from "./Badge";
import { getT } from "./i18n";

/** Server-only: its label comes from the request's language. */
export function CaptainBadge({ vice = false, multiplier = 2 }: { vice?: boolean; multiplier?: number }) {
  const t = getT().captainBadge;
  if (vice) return <Badge srLabel={t.vice}>VC</Badge>;
  const triple = multiplier === 3;
  return (
    <Badge tone="accent" srLabel={triple ? t.triple : t.captain}>
      {triple ? "C×3" : "C"}
    </Badge>
  );
}
