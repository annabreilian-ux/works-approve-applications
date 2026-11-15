import { Skeleton } from "@/components/ui/skeleton";

export function RegistrySkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-label="Loading applications" aria-busy="true">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-14 w-full rounded-lg" />
      ))}
    </div>
  );
}

export function ApplicationDetailsSkeleton() {
  return (
    <div
      className="space-y-6"
      aria-label="Loading application details"
      aria-busy="true"
    >
      <Skeleton className="h-28 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
      <Skeleton className="h-40 w-full rounded-xl" />
    </div>
  );
}
