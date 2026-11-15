import { UserRole } from "@/generated/prisma/client";
import { getCurrentSession } from "@/lib/server/session";

export async function GET(): Promise<Response> {
  const session = await getCurrentSession({ refresh: true });

  if (!session) {
    return Response.json(
      {
        error: {
          code: "session-expired",
          message: "Your session expires, sign in again.",
        },
      },
      {
        status: 401,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  return Response.json(
    {
      user: {
        id: session.user.id,
        username: session.user.username,
        displayName: session.user.displayName,
        role:
          session.user.role === UserRole.AUTHORIZED_WORKER
            ? "authorized-worker"
            : "read-only",
      },
      expiresAfterInactiveMinutes: 240,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}