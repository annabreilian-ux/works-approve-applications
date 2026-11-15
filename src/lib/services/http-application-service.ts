import type { Application } from "@/lib/domain/types";
import type {
  ApplicationService,
  ApproveApplicationInput,
  ListApplicationsInput,
  ServiceError,
  ServiceResult,
  StartReviewInput,
} from "@/lib/services/contracts";

interface ErrorPayload {
  error?: ServiceError;
}

async function readError(
  response: Response,
  fallbackMessage: string,
): Promise<ServiceError> {
  try {
    const payload = (await response.json()) as ErrorPayload;

    if (payload.error) {
      return payload.error;
    }
  } catch {
    // Use the safe fallback below.
  }

  return {
    code: "network-error",
    message: fallbackMessage,
  };
}

class HttpApplicationService implements ApplicationService {
  async listApplications({ page, pageSize }: ListApplicationsInput) {
    try {
      const query = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      const response = await fetch(`/api/applications?${query}`, {
        credentials: "same-origin",
        cache: "no-store",
      });

      if (!response.ok) {
        return {
          ok: false as const,
          error: await readError(
            response,
            "Applications could not be loaded. Try again.",
          ),
        };
      }

      return {
        ok: true as const,
        data: await response.json(),
      };
    } catch {
      return {
        ok: false as const,
        error: {
          code: "refresh-error" as const,
          message: "Applications could not be loaded. Try again.",
        },
      };
    }
  }

  async getApplication(id: string): Promise<ServiceResult<Application>> {
    try {
      const response = await fetch(`/api/applications/${encodeURIComponent(id)}`, {
        credentials: "same-origin",
        cache: "no-store",
      });

      if (!response.ok) {
        return {
          ok: false,
          error: await readError(
            response,
            "Application details could not be loaded. Try again.",
          ),
        };
      }

      return {
        ok: true,
        data: (await response.json()) as Application,
      };
    } catch {
      return {
        ok: false,
        error: {
          code: "refresh-error",
          message: "Application details could not be loaded. Try again.",
        },
      };
    }
  }

  async startReview({
    applicationId,
  }: StartReviewInput): Promise<ServiceResult<Application>> {
    try {
      const response = await fetch(
        `/api/applications/${encodeURIComponent(applicationId)}/start-review`,
        {
          method: "POST",
          credentials: "same-origin",
        },
      );

      if (!response.ok) {
        return {
          ok: false,
          error: await readError(
            response,
            "The review could not be started. Try again.",
          ),
        };
      }

      return {
        ok: true,
        data: (await response.json()) as Application,
      };
    } catch {
      return {
        ok: false,
        error: {
          code: "uncertain-outcome",
          message: "The request outcome is uncertain. Checking the latest state.",
        },
      };
    }
  }

  async approveApplication({
    applicationId,
    decisionComment,
  }: ApproveApplicationInput): Promise<ServiceResult<Application>> {
    try {
      const response = await fetch(
        `/api/applications/${encodeURIComponent(applicationId)}/approve`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            decisionComment,
            idempotencyKey: crypto.randomUUID(),
          }),
        },
      );

      if (!response.ok) {
        return {
          ok: false,
          error: await readError(
            response,
            "The approval could not be submitted. Try again.",
          ),
        };
      }

      return {
        ok: true,
        data: (await response.json()) as Application,
      };
    } catch {
      return {
        ok: false,
        error: {
          code: "uncertain-outcome",
          message: "The approval outcome is uncertain. Checking the latest state.",
        },
      };
    }
  }
}

export const applicationService = new HttpApplicationService();
