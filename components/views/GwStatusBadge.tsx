import { Badge, getT } from "@/components/ui";
import type { GwStatus } from "@/lib/domain";

const TONE: Record<GwStatus, "live" | "warning" | "neutral" | "positive"> = { upcoming: "neutral", live: "live", provisional: "warning", final: "positive" };

export function GwStatusBadge({ status }: { status: GwStatus }) {
  return <Badge tone={TONE[status]}>{getT().status[status]}</Badge>;
}
