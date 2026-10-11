import { Badge } from "@/components/ui";
import type { GwStatus } from "@/lib/domain";

const MAP: Record<GwStatus, { label: string; tone: "live" | "warning" | "neutral" | "positive" }> = {
  upcoming: { label: "Upcoming", tone: "neutral" },
  live: { label: "Live", tone: "live" },
  provisional: { label: "Provisional", tone: "warning" },
  final: { label: "Final", tone: "positive" },
};

export function GwStatusBadge({ status }: { status: GwStatus }) {
  const { label, tone } = MAP[status];
  return <Badge tone={tone}>{label}</Badge>;
}
