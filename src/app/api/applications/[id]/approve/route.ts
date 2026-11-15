import { approveApplicationReview } from "@/lib/server/application-commands";
import { getCurrentSession } from "@/lib/server/session";
import { WorkflowError } from "@/lib/server/workflow-error";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

interface ApprovalBody {
  decisionComment?: unknown;
  idempotencyKey?: unknown;
}

export async function POST(
  request: Request,
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

  let body: ApprovalBody;

  try {
    body = (await request.json()) as ApprovalBody;
  } catch {
    return Response.json(
      {
        error: {
          code: "validation-error",
          message: "Enter a valid decision comment.",
        },
      },
      { status: 400 },
    );
  }

  if (
    typeof body.decisionComment !== "string" ||
    typeof body.idempotencyKey !== "string"
  ) {
    return Response.json(
      {
        error: {
          code: "validation-error",
          message: "Enter a valid decision comment.",
        },
      },
      { status: 400 },
    );
  }

  const { id } = await context.params;

  try {
    const application = await approveApplicationReview(
      id,
      session.user,
      body.decisionComment,
      body.idempotencyKey,
    );

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
            field:
              error.code === "validation-error"
                ? "decisionComment"
                : undefined,
          },
        },
        { status: error.status },
      );
    }

    return Response.json(
      {
        error: {
          code: "network-error",
          message: "The approval could not be submitted. Try again.",
        },
      },
      { status: 500 },
    );
  }
}
