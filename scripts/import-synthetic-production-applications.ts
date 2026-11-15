import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import {
  ApplicationStatus,
  Prisma,
  PrismaClient,
} from "../src/generated/prisma/client";

const APPLICATION_COUNT = 100;
const CONFIRMATION_VALUE =
  "I_UNDERSTAND_THIS_ADDS_SYNTHETIC_PRODUCTION_APPLICATIONS";
const IDENTIFIER_PREFIX = "SYNTHETIC-TEST-";

interface SyntheticApplication {
  sourceIdentifier: string;
  sourceUpdatedAt: Date;
  data: Prisma.InputJsonObject;
}

function requireExpectedExistingCount(): number {
  const value = process.env.EXPECTED_EXISTING_APPLICATION_COUNT;
  const count = Number(value);

  if (!value || !Number.isSafeInteger(count) || count < 0) {
    throw new Error(
      "EXPECTED_EXISTING_APPLICATION_COUNT must be a non-negative integer.",
    );
  }

  return count;
}

function requireBaseDate(): Date {
  const value =
    process.env.SYNTHETIC_IMPORT_BASE_DATE ??
    new Date().toISOString().slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("SYNTHETIC_IMPORT_BASE_DATE must use YYYY-MM-DD.");
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error("SYNTHETIC_IMPORT_BASE_DATE must be a valid date.");
  }

  return date;
}

function addUtcDays(value: Date, days: number): Date {
  const result = new Date(value);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function createSyntheticApplications(
  baseDate: Date,
): SyntheticApplication[] {
  const workTypes = [
    "Synthetic road maintenance",
    "Synthetic utility works",
    "Synthetic public-space improvement",
    "Synthetic traffic-management works",
  ];

  return Array.from({ length: APPLICATION_COUNT }, (_, index) => {
    const sequence = index + 1;
    const suffix = sequence.toString().padStart(3, "0");
    const plannedStart = addUtcDays(baseDate, index % 30);
    const plannedEnd = addUtcDays(plannedStart, 8);

    return {
      sourceIdentifier: `${IDENTIFIER_PREFIX}${suffix}`,
      sourceUpdatedAt: new Date(baseDate.getTime() + index * 1_000),
      data: {
        applicationNumber: `TEST-${suffix}`,
        workType: workTypes[index % workTypes.length],
        description:
          `Synthetic test application ${suffix}. ` +
          "Contains no real applicant or operational data.",
        location: `Synthetic Test Location ${suffix}`,
        applicant: `Synthetic Applicant ${suffix}`,
        plannedStartDate: formatDate(plannedStart),
        plannedEndDate: formatDate(plannedEnd),
      },
    };
  });
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");

  if (
    !dryRun &&
    process.env.IMPORT_SYNTHETIC_PRODUCTION_CONFIRM !== CONFIRMATION_VALUE
  ) {
    throw new Error(
      "Set IMPORT_SYNTHETIC_PRODUCTION_CONFIRM to the documented confirmation value before importing.",
    );
  }

  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured.");
  }

  const expectedExistingCount = requireExpectedExistingCount();
  const applications = createSyntheticApplications(requireBaseDate());
  const sourceIdentifiers = applications.map(
    (application) => application.sourceIdentifier,
  );

  if (
    applications.length !== APPLICATION_COUNT ||
    new Set(sourceIdentifiers).size !== APPLICATION_COUNT
  ) {
    throw new Error("The synthetic application batch is invalid.");
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  try {
    const [sourceCount, applicationCount, conflictingSources, conflictingApps] =
      await Promise.all([
        prisma.sourceApplication.count(),
        prisma.application.count(),
        prisma.sourceApplication.count({
          where: { externalIdentifier: { in: sourceIdentifiers } },
        }),
        prisma.application.count({
          where: { sourceIdentifier: { in: sourceIdentifiers } },
        }),
      ]);

    if (
      sourceCount !== expectedExistingCount ||
      applicationCount !== expectedExistingCount
    ) {
      throw new Error(
        `Target count mismatch: expected ${expectedExistingCount} source and workflow records, ` +
          `found ${sourceCount} source and ${applicationCount} workflow records.`,
      );
    }

    if (conflictingSources > 0 || conflictingApps > 0) {
      throw new Error(
        `Synthetic identifier conflict: ${conflictingSources} source and ${conflictingApps} workflow records already exist.`,
      );
    }

    if (dryRun) {
      console.log(
        `Dry run passed: ${APPLICATION_COUNT} synthetic NEW applications can be added; ` +
          `the target would contain ${expectedExistingCount + APPLICATION_COUNT} applications.`,
      );
      return;
    }

    await prisma.$transaction(
      async (transaction) => {
        await transaction.sourceApplication.createMany({
          data: applications.map((application) => ({
            externalIdentifier: application.sourceIdentifier,
            data: application.data,
            sourceUpdatedAt: application.sourceUpdatedAt,
          })),
        });

        await transaction.application.createMany({
          data: applications.map((application) => ({
            sourceIdentifier: application.sourceIdentifier,
            status: ApplicationStatus.NEW,
            sourceLastSynchronizedAt: application.sourceUpdatedAt,
          })),
        });

        const [createdSources, createdApps, createdNewApps] = await Promise.all([
          transaction.sourceApplication.count({
            where: { externalIdentifier: { in: sourceIdentifiers } },
          }),
          transaction.application.count({
            where: { sourceIdentifier: { in: sourceIdentifiers } },
          }),
          transaction.application.count({
            where: {
              sourceIdentifier: { in: sourceIdentifiers },
              status: ApplicationStatus.NEW,
            },
          }),
        ]);

        if (
          createdSources !== APPLICATION_COUNT ||
          createdApps !== APPLICATION_COUNT ||
          createdNewApps !== APPLICATION_COUNT
        ) {
          throw new Error(
            "Post-import verification failed; the transaction will be rolled back.",
          );
        }
      },
      { maxWait: 10_000, timeout: 60_000 },
    );

    console.log(
      `Import completed: ${APPLICATION_COUNT} synthetic NEW applications created; ` +
        `the target now contains ${expectedExistingCount + APPLICATION_COUNT} applications.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? error.message
      : "Synthetic production application import failed.",
  );
  process.exitCode = 1;
});
