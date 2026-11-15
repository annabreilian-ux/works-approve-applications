import { Badge } from "@/components/ui/badge";
import type {
  ApplicationStatus,
  DecisionResult,
} from "@/lib/domain/types";

const statusLabels: Record<ApplicationStatus, string> = {
  new: "New",
  "under-review": "Under review",
  done: "Done",
};

const resultLabels: Record<DecisionResult, string> = {
  approved: "Approved",
  rejected: "Rejected",
};

export function StatusBadge({ status }: { status: ApplicationStatus }) {
  return (
    <Badge
      variant="outline"
      className="border-current bg-background text-foreground"
    >
      {statusLabels[status]}
    </Badge>
  );
}

export function ResultBadge({ result }: { result: DecisionResult }) {
  return (
    <Badge
      variant="secondary"
      className={
        result === "approved"
          ? "bg-emerald-100 text-emerald-900"
          : "bg-red-100 text-red-900"
      }
    >
      {resultLabels[result]}
    </Badge>
  );
}
