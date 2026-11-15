import type {
  Application,
  ApplicationSummary,
  PageResult,
  User,
} from "@/lib/domain/types";

export type ServiceErrorCode =
  | "invalid-credentials"
  | "not-found"
  | "forbidden"
  | "ownership-conflict"
  | "ownership-lost"
  | "invalid-state"
  | "validation-error"
  | "session-expired"
  | "network-error"
  | "refresh-error"
  | "uncertain-outcome";

export interface ServiceError {
  code: ServiceErrorCode;
  message: string;
  field?: "username" | "password" | "decisionComment";
}

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ServiceError };

export interface SignInCredentials {
  username: string;
  password: string;
}

export interface AuthSession {
  user: User;
  expiresAfterInactiveMinutes: 240;
}

export interface AuthService {
  signIn(credentials: SignInCredentials): Promise<ServiceResult<AuthSession>>;
  signOut(): Promise<void>;
  getSession(): Promise<ServiceResult<AuthSession | null>>;
}

export interface ListApplicationsInput {
  page: number;
  pageSize: 5 | 10 | 25 | 100;
}

export interface StartReviewInput {
  applicationId: string;
}

export interface ApproveApplicationInput {
  applicationId: string;
  decisionComment: string;
}

export interface ApplicationService {
  listApplications(
    input: ListApplicationsInput,
  ): Promise<ServiceResult<PageResult<ApplicationSummary>>>;
  getApplication(id: string): Promise<ServiceResult<Application>>;
  startReview(input: StartReviewInput): Promise<ServiceResult<Application>>;
  approveApplication(
    input: ApproveApplicationInput,
  ): Promise<ServiceResult<Application>>;
}
