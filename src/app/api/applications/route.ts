import { listApplications } from "@/lib/server/application-queries";
import { getCurrentSession } from "@/lib/server/session";

const PAGE_SIZES = new Set([5, 10, 25, 100]);

export async function GET(request: Request): Promise<Response> {
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

  const url = new URL(request.url);
  const page = Number(url.searchParams.get("page") ?? "1");
  const pageSize = Number(url.searchParams.get("pageSize") ?? "10");

  if (
    !Number.isInteger(page) ||
    page < 1 ||
    !PAGE_SIZES.has(pageSize)
  ) {
    return Response.json(
      {
        error: {
          code: "validation-error",
          message: "The requested registry page is invalid.",
        },
      },
      { status: 400 },
    );
  }

  try {
    const result = await listApplications({
      page,
      pageSize: pageSize as 5 | 10 | 25 | 100,
    });

    return Response.json(result, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return Response.json(
      {
        error: {
          code: "refresh-error",
          message: "Applications could not be loaded. Try again.",
        },
      },
      { status: 500 },
    );
  }
}