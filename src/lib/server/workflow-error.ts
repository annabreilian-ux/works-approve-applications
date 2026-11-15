import "server-only";

export type WorkflowErrorCode =
  | "not-found"
  | "forbidden"
  | "ownership-conflict"
  | "ownership-lost"
  | "invalid-state"
  | "validation-error"
  | "session-expired"
  | "uncertain-outcome";

export class WorkflowError extends Error {
  constructor(
    public readonly code: WorkflowErrorCode,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "WorkflowError";
  }
}
