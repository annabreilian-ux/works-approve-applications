import { UserRole } from "@/generated/prisma/client";
import { db } from "@/lib/server/db";
import { verifyPassword } from "@/lib/server/password";
import {
  createSession,
  revokeCurrentSession,
} from "@/lib/server/session";

interface SignInBody {
  username?: unknown;
  password?: unknown;
}

export async function POST(request: Request): Promise<Response> {
  let body: SignInBody;

  try {
    body = (await request.json()) as SignInBody;
  } catch {
    return Response.json(
      {
        error: {
          code: "validation-error",
          message: "Enter a username and password.",
        },
      },
      { status: 400 },
    );
  }

  const username =
    typeof body.username === "string" ? body.username.trim() : "";
  const password =
    typeof body.password === "string" ? body.password : "";

  if (
    username.length === 0 ||
    username.length > 100 ||
    password.length === 0 ||
    password.length > 200
  ) {
    return Response.json(
      {
        error: {
          code: "validation-error",
          message: "Enter a valid username and password.",
        },
      },
      { status: 400 },
    );
  }

  const user = await db.user.findUnique({
    where: { username },
    select: {
      id: true,
      username: true,
      displayName: true,
      passwordHash: true,
      role: true,
      isActive: true,
    },
  });

  const passwordIsValid =
    user?.isActive === true &&
    (await verifyPassword(password, user.passwordHash));

  if (!user || !passwordIsValid) {
    return Response.json(
      {
        error: {
          code: "invalid-credentials",
          message: "The username or password is incorrect.",
        },
      },
      { status: 401 },
    );
  }

  await revokeCurrentSession();
  await createSession(user.id);

  return Response.json(
    {
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role:
          user.role === UserRole.AUTHORIZED_WORKER
            ? "authorized-worker"
            : "read-only",
      },
      expiresAfterInactiveMinutes: 240,
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}