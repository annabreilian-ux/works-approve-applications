import "dotenv/config";

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";

import {
  ApplicationStatus,
  Prisma,
  PrismaClient,
  UserRole,
} from "../src/generated/prisma/client";
import { hashPassword } from "../src/lib/password";

const CONFIRMATION_VALUE = "I_UNDERSTAND_THIS_WRITES_PRODUCTION_DATA";

interface BootstrapUserInput {
  username: string;
  displayName: string;
  role: "AUTHORIZED_WORKER" | "READ_ONLY";
  password: string;
}

interface BootstrapApplicationInput {
  sourceIdentifier: string;
  sourceUpdatedAt: string;
  data: Record<string, unknown>;
}

interface BootstrapInput {
  users: BootstrapUserInput[];
  applications: BootstrapApplicationInput[];
}

interface ParsedBootstrapInput {
  users: BootstrapUserInput[];
  applications: Array<{
    sourceIdentifier: string;
    sourceUpdatedAt: Date;
    data: Prisma.InputJsonObject;
  }>;
}

function requireNonEmptyString(
  value: unknown,
  field: string,
  maximumLength: number,
): string {
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string.`);
  }

  const normalized = value.trim();

  if (normalized.length === 0 || normalized.length > maximumLength) {
    throw new Error(
      `${field} must contain between 1 and ${maximumLength} characters.`,
    );
  }

  return normalized;
}

function parseInput(value: unknown): ParsedBootstrapInput {
  if (typeof value !== "object" || value === null) {
    throw new Error("The bootstrap input must be a JSON object.");
  }

  const candidate = value as Partial<BootstrapInput>;

  if (!Array.isArray(candidate.users) || candidate.users.length === 0) {
    throw new Error("The bootstrap input must include at least one user.");
  }

  if (
    !Array.isArray(candidate.applications) ||
    candidate.applications.length === 0
  ) {
    throw new Error(
      "The bootstrap input must include at least one synthetic application.",
    );
  }

  const users = candidate.users.map((user, index) => {
    const username = requireNonEmptyString(
      user?.username,
      `users[${index}].username`,
      100,
    );
    const displayName = requireNonEmptyString(
      user?.displayName,
      `users[${index}].displayName`,
      200,
    );
    const password = requireNonEmptyString(
      user?.password,
      `users[${index}].password`,
      200,
    );

    if (password.length < 12) {
      throw new Error(
        `users[${index}].password must contain at least 12 characters.`,
      );
    }

    if (user.role !== "AUTHORIZED_WORKER" && user.role !== "READ_ONLY") {
      throw new Error(
        `users[${index}].role must be AUTHORIZED_WORKER or READ_ONLY.`,
      );
    }

    return {
      username,
      displayName,
      password,
      role: user.role,
    };
  });

  if (!users.some((user) => user.role === "AUTHORIZED_WORKER")) {
    throw new Error("At least one authorized worker is required.");
  }

  if (!users.some((user) => user.role === "READ_ONLY")) {
    throw new Error("At least one read-only user is required.");
  }

  if (new Set(users.map((user) => user.username)).size !== users.length) {
    throw new Error("Bootstrap usernames must be unique.");
  }

  const applications = candidate.applications.map((application, index) => {
    const sourceIdentifier = requireNonEmptyString(
      application?.sourceIdentifier,
      `applications[${index}].sourceIdentifier`,
      100,
    );
    const sourceUpdatedAtText = requireNonEmptyString(
      application?.sourceUpdatedAt,
      `applications[${index}].sourceUpdatedAt`,
      100,
    );
    const sourceUpdatedAt = new Date(sourceUpdatedAtText);

    if (Number.isNaN(sourceUpdatedAt.getTime())) {
      throw new Error(
        `applications[${index}].sourceUpdatedAt must be an ISO date-time.`,
      );
    }

    if (
      typeof application?.data !== "object" ||
      application.data === null ||
      Array.isArray(application.data)
    ) {
      throw new Error(`applications[${index}].data must be a JSON object.`);
    }

    return {
      sourceIdentifier,
      sourceUpdatedAt,
      data: application.data as Prisma.InputJsonObject,
    };
  });

  if (
    new Set(applications.map((application) => application.sourceIdentifier))
      .size !== applications.length
  ) {
    throw new Error("Bootstrap source identifiers must be unique.");
  }

  return { users, applications };
}

async function main(): Promise<void> {
  if (process.env.BOOTSTRAP_PRODUCTION_CONFIRM !== CONFIRMATION_VALUE) {
    throw new Error(
      "Set BOOTSTRAP_PRODUCTION_CONFIRM to the documented confirmation value before running the production bootstrap.",
    );
  }

  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured.");
  }

  const inputPath = process.argv[2];

  if (!inputPath) {
    throw new Error(
      "Provide the protected bootstrap JSON path: npm run bootstrap:production -- <path>.",
    );
  }

  const input = parseInput(
    JSON.parse(await readFile(resolve(inputPath), "utf8")) as unknown,
  );
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  try {
    const [userCount, applicationCount] = await Promise.all([
      prisma.user.count(),
      prisma.application.count(),
    ]);
    const databaseIsNonEmpty = userCount > 0 || applicationCount > 0;
    const allowNonEmpty =
      process.env.ALLOW_NON_EMPTY_PRODUCTION_BOOTSTRAP === "true";

    if (databaseIsNonEmpty && !allowNonEmpty) {
      throw new Error(
        "Production bootstrap refused because users or applications already exist. Set ALLOW_NON_EMPTY_PRODUCTION_BOOTSTRAP=true only after reviewing the target database.",
      );
    }

    const preparedUsers = await Promise.all(
      input.users.map(async (user) => ({
        username: user.username,
        displayName: user.displayName,
        role:
          user.role === "AUTHORIZED_WORKER"
            ? UserRole.AUTHORIZED_WORKER
            : UserRole.READ_ONLY,
        passwordHash: await hashPassword(user.password),
      })),
    );

    await prisma.$transaction(async (transaction) => {
      for (const user of preparedUsers) {
        await transaction.user.create({ data: user });
      }

      for (const application of input.applications) {
        await transaction.sourceApplication.create({
          data: {
            externalIdentifier: application.sourceIdentifier,
            data: application.data,
            sourceUpdatedAt: application.sourceUpdatedAt,
          },
        });
        await transaction.application.create({
          data: {
            sourceIdentifier: application.sourceIdentifier,
            status: ApplicationStatus.NEW,
            sourceLastSynchronizedAt: application.sourceUpdatedAt,
          },
        });
      }
    });

    console.log(
      `Production bootstrap completed: ${preparedUsers.length} users and ${input.applications.length} synthetic applications created.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Production bootstrap failed.",
  );
  process.exitCode = 1;
});
