import { LoadingState, Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <LoadingState label="Opening the issue">
      <Skeleton width={110} />
      <Skeleton width={260} height={34} />
      {/* The same proportions as an A4 page, so the layout doesn't jump when it arrives. */}
      <div style={{ width: "min(100%, 560px)", aspectRatio: "1080 / 1528", marginInline: "auto" }}>
        <Skeleton height="100%" radius={6} />
      </div>
      <Skeleton height={44} radius={22} />
    </LoadingState>
  );
}
