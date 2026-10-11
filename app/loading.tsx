import { LoadingState, Skeleton, TableSkeleton } from "@/components/ui";

export default function Loading() {
  return (
    <LoadingState label="Loading league table">
      <Skeleton width={220} height={34} />
      <Skeleton width={160} />
      <TableSkeleton rows={10} />
    </LoadingState>
  );
}
