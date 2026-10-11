import { LoadingState, Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <LoadingState label="Loading fixtures">
      <Skeleton width={110} />
      <Skeleton width={180} height={34} />
      <div style={{ display: "grid", gap: 8 }}>
        {Array.from({ length: 10 }, (_, i) => (
          <Skeleton key={i} height={46} radius={12} />
        ))}
      </div>
    </LoadingState>
  );
}
