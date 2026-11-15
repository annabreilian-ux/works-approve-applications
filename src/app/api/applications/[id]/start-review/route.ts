import { startApplicationReview } from "@/lib/server/application-commands";
import { getCurrentSession } from "@/lib/server/session";
import { WorkflowError } from "@/lib/server/workflow-error";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

export async function POST(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const session = await getCurrentSession({ refresh: true });

  if (!session) {
    return Response.json(
      {
        error: {
          code: "session-expired",
          message: "Your session expires, sign in again.",
        },
      },
      { status: 401 },
    );
  }

  const { id } = await context.params;

  try {
    const application = await startApplicationReview(id, session.user);

    return Response.json(application, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof WorkflowError) {
      return Response.json(
        {
          error: {
            code: error.code,
            message: error.message,
          },
        },
        { status: error.status },
      );
    }

    return Response.json(
      {
        error: {
          code: "network-error",
          message: "The review could not be started. Try again.",
        },
      },
      { status: 500 },
    );
  }
}
