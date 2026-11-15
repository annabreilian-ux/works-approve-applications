import "dotenv/config";

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { hashPassword, verifyPassword } from "../src/lib/password";

const CONFIRMATION_VALUE = "I_UNDERSTAND_THIS_ROTATES_PRODUCTION_PASSWORDS";

interface RotationUserInput {
  username: string;
  password: string;
}

interface RotationInput {
  users: RotationUserInput[];
}

class SafeRotationError extends Error {}

function requireNonEmptyString(
  value: unknown,
  field: string,
  maximumLength: number,
): string {
  if (typeof value !== "string") {
    throw new SafeRotationError(`${field} must be a string.`);
  }

  const normalized = value.trim();

  if (normalized.length === 0 || normalized.length > maximumLength) {
    throw new SafeRotationError(
      `${field} must contain between 1 and ${maximumLength} characters.`,
    );
  }

  return normalized;
}

function parseInput(value: unknown): RotationInput {
  if (typeof value !== "object" || value === null) {
    throw new SafeRotationError("The rotation input must be a JSON object.");
  }

  const candidate = value as Partial<RotationInput>;

  if (!Array.isArray(candidate.users) || candidate.users.length === 0) {
    throw new SafeRotationError(
      "The rotation input must include at least one user.",
    );
  }

  const users = candidate.users.map((user, index) => {
    const username = requireNonEmptyString(
      user?.username,
      `users[${index}].username`,
      100,
    );
    const password = requireNonEmptyString(
      user?.password,
      `users[${index}].password`,
      200,
    );

    if (password.length < 12) {
      throw new SafeRotationError(
        `users[${index}].password must contain at least 12 characters.`,
      );
    }

    return { username, password };
  });

  if (new Set(users.map((user) => user.username)).size !== users.length) {
    throw new SafeRotationError("Rotation usernames must be unique.");
  }

  return { users };
}

async function main(): Promise<void> {
  if (process.env.ROTATE_PRODUCTION_PASSWORDS_CONFIRM !== CONFIRMATION_VALUE) {
    throw new SafeRotationError(
      "Set ROTATE_PRODUCTION_PASSWORDS_CONFIRM to the documented confirmation value before rotating production passwords.",
    );
  }

  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new SafeRotationError("DATABASE_URL is not configured.");
  }

  const inputPath = process.argv[2];

  if (!inputPath) {
    throw new SafeRotationError(
      "Provide the protected rotation JSON path: npm run rotate-passwords:production -- <path>.",
    );
  }

  let parsedInput: unknown;

  try {
    parsedInput = JSON.parse(
      await readFile(resolve(inputPath), "utf8"),
    ) as unknown;
  } catch {
    throw new SafeRotationError(
      "The protected rotation input could not be read as JSON.",
    );
  }

  const input = parseInput(parsedInput);
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  try {
    const activeUsers = await prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, username: true, passwordHash: true },
    });
    const requestedUsernames = new Set(
      input.users.map((user) => user.username),
    );

    if (
      activeUsers.length !== input.users.length ||
      activeUsers.some((user) => !requestedUsernames.has(user.username))
    ) {
      throw new SafeRotationError(
        "The rotation input must contain every active production user exactly once and cannot contain unknown users.",
      );
    }

    const activeUserByUsername = new Map(
      activeUsers.map((user) => [user.username, user]),
    );
    const preparedUsers = await Promise.all(
      input.users.map(async (user) => {
        const existingUser = activeUserByUsername.get(user.username);

        if (!existingUser) {
          throw new SafeRotationError(
            "The rotation input contains an unknown or inactive user.",
          );
        }

        if (await verifyPassword(user.password, existingUser.passwordHash)) {
          throw new SafeRotationError(
            "Every replacement password must differ from its current password.",
          );
        }

        return {
          id: existingUser.id,
          passwordHash: await hashPassword(user.password),
        };
      }),
    );
    const rotatedAt = new Date();

    await prisma.$transaction(async (transaction) => {
      for (const user of preparedUsers) {
        await transaction.user.update({
          where: { id: user.id },
          data: { passwordHash: user.passwordHash },
        });
      }

      await transaction.session.updateMany({
        where: {
          userId: { in: preparedUsers.map((user) => user.id) },
          revokedAt: null,
        },
        data: { revokedAt: rotatedAt },
      });
    });

    console.log(
      `Production password rotation completed for ${preparedUsers.length} active users; their existing sessions were revoked.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof SafeRotationError
      ? error.message
      : "Production password rotation failed.",
  );
  process.exitCode = 1;
});
