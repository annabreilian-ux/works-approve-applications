import { Inbox } from "lucide-react";

export function EmptyState({ message = "No applications found" }: { message?: string }) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed bg-card p-8 text-center">
      <Inbox className="mb-3 size-8 text-muted-foreground" aria-hidden="true" />
      <p className="font-medium">{message}</p>
    </div>
  );
}
