import { getApplicationById } from "@/lib/server/application-queries";
import { getCurrentSession } from "@/lib/server/session";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export async function GET(
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

  if (!isUuid(id)) {
    return Response.json(
      {
        error: {
          code: "not-found",
          message: "The application could not be found.",
        },
      },
      { status: 404 },
    );
  }

  try {
    const application = await getApplicationById(id);

    if (!application) {
      return Response.json(
        {
          error: {
            code: "not-found",
            message: "The application could not be found.",
          },
        },
        { status: 404 },
      );
    }

    return Response.json(application, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return Response.json(
      {
        error: {
          code: "refresh-error",
          message: "Application details could not be loaded. Try again.",
        },
      },
      { status: 500 },
    );
  }
}