import type {
  AuthService,
  AuthSession,
  ServiceError,
  ServiceResult,
  SignInCredentials,
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

class HttpAuthService implements AuthService {
  async signIn(
    credentials: SignInCredentials,
  ): Promise<ServiceResult<AuthSession>> {
    try {
      const response = await fetch("/api/auth/sign-in", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(credentials),
      });

      if (!response.ok) {
        return {
          ok: false,
          error: await readError(response, "Sign in failed. Try again."),
        };
      }

      return {
        ok: true,
        data: (await response.json()) as AuthSession,
      };
    } catch {
      return {
        ok: false,
        error: {
          code: "network-error",
          message: "Sign in failed. Check your connection and try again.",
        },
      };
    }
  }

  async signOut(): Promise<void> {
    try {
      await fetch("/api/auth/sign-out", {
        method: "POST",
        credentials: "same-origin",
      });
    } catch {
      // The browser cannot retain a usable server session after expiry.
    }
  }

  async getSession(): Promise<ServiceResult<AuthSession | null>> {
    try {
      const response = await fetch("/api/auth/session", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      });

      if (response.status === 401) {
        return {
          ok: false,
          error: await readError(
            response,
            "Your session expires, sign in again.",
          ),
        };
      }

      if (!response.ok) {
        return {
          ok: false,
          error: await readError(
            response,
            "The session could not be checked. Try again.",
          ),
        };
      }

      return {
        ok: true,
        data: (await response.json()) as AuthSession,
      };
    } catch {
      return {
        ok: false,
        error: {
          code: "network-error",
          message: "The session could not be checked. Try again.",
        },
      };
    }
  }
}

export const authService = new HttpAuthService();
