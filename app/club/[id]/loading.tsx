import { LoadingState, Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <LoadingState label="Loading club">
      <Skeleton width={140} />
      <Skeleton width={240} height={34} />
      <div style={{ display: "grid", gap: 12 }}>
        <Skeleton height={140} radius={16} />
        <Skeleton height={140} radius={16} />
        <Skeleton height={220} radius={16} />
      </div>
    </LoadingState>
  );
}
