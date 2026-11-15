import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";

import type { UserRole } from "@/generated/prisma/client";
import {
  SESSION_COOKIE_NAME,
  SESSION_HISTORY_COOKIE_NAME,
} from "@/lib/auth/constants";
import { db } from "@/lib/server/db";

const SESSION_IDLE_MILLISECONDS = 4 * 60 * 60 * 1000;

export interface SessionUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
}

export interface AuthenticatedSession {
  id: string;
  user: SessionUser;
  idleExpiresAt: Date;
}

function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function nextIdleExpiry(): Date {
  return new Date(Date.now() + SESSION_IDLE_MILLISECONDS);
}

async function setSessionCookie(
  token: string,
  expires: Date,
): Promise<void> {
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
  cookieStore.set(SESSION_HISTORY_COOKIE_NAME, "1", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });
}

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashSessionToken(token);
  const now = new Date();
  const idleExpiresAt = nextIdleExpiry();

  await db.session.create({
    data: {
      tokenHash,
      userId,
      createdAt: now,
      lastActivityAt: now,
      idleExpiresAt,
    },
  });

  await setSessionCookie(token, idleExpiresAt);
}

export async function getCurrentSession({
  refresh = false,
}: {
  refresh?: boolean;
} = {}): Promise<AuthenticatedSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  const session = await db.session.findUnique({
    where: {
      tokenHash: hashSessionToken(token),
    },
    select: {
      id: true,
      idleExpiresAt: true,
      revokedAt: true,
      user: {
        select: {
          id: true,
          username: true,
          displayName: true,
          role: true,
          isActive: true,
        },
      },
    },
  });

  const now = new Date();

  if (
    !session ||
    session.revokedAt ||
    session.idleExpiresAt <= now ||
    !session.user.isActive
  ) {
    return null;
  }

  let idleExpiresAt = session.idleExpiresAt;

  if (refresh) {
    idleExpiresAt = nextIdleExpiry();

    await db.session.update({
      where: { id: session.id },
      data: {
        lastActivityAt: now,
        idleExpiresAt,
      },
    });

    await setSessionCookie(token, idleExpiresAt);
  }

  return {
    id: session.id,
    idleExpiresAt,
    user: {
      id: session.user.id,
      username: session.user.username,
      displayName: session.user.displayName,
      role: session.user.role,
    },
  };
}

export async function revokeCurrentSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    await db.session.updateMany({
      where: {
        tokenHash: hashSessionToken(token),
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  cookieStore.delete(SESSION_COOKIE_NAME);
  cookieStore.delete(SESSION_HISTORY_COOKIE_NAME);
}
