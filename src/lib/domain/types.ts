export type UserRole = "authorized-worker" | "read-only";

export type ApplicationStatus = "new" | "under-review" | "done";

export type DecisionResult = "approved" | "rejected";

export interface User {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
}

export interface SnapshotSourceData {
  applicationNumber: string;
  workType: string;
  description: string;
  location: string;
  applicant: string;
  plannedStartDate: string;
  plannedEndDate: string;
}

export interface ReviewSnapshot extends SnapshotSourceData {
  id: string;
  retrievedAt: string;
}

export interface ReviewAssignment {
  id: string;
  reviewer: User;
  startedAt: string;
  endedAt: string | null;
  endReason: "approval" | "rejection" | "release" | null;
}

export interface GeneralComment {
  id: string;
  text: string;
  author: User;
  createdAt: string;
}

export interface Decision {
  id: string;
  result: DecisionResult;
  comment: string;
  decidingWorker: User;
  decidedAt: string;
  snapshotId: string;
}

export interface Application {
  id: string;
  applicationNumber: string;
  status: ApplicationStatus;
  currentReviewer: User | null;
  result: DecisionResult | null;
  sourceData: SnapshotSourceData;
  sourceLastSynchronizedAt: string;
  activeSnapshot: ReviewSnapshot | null;
  activeAssignment: ReviewAssignment | null;
  generalComments: GeneralComment[];
  decision: Decision | null;
}

export interface ApplicationSummary {
  id: string;
  applicationNumber: string;
  workType: string;
  location: string;
  status: ApplicationStatus;
  currentReviewerName: string | null;
  result: DecisionResult | null;
}

export interface PageResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}
