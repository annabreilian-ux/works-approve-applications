import "dotenv/config";

import { randomBytes, scryptSync } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";

import {
  ApplicationStatus,
  AssignmentEndReason,
  AuditAction,
  DecisionResult,
  PrismaClient,
  UserRole,
} from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not configured.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const DEMO_PASSWORD = "CouncilDemo2026!";

function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);

  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

function applicationNumber(index: number): string {
  return `APP-${String(index).padStart(3, "0")}`;
}

function sourceData(index: number) {
  const specialData = {
    1: {
      workType: "Road resurfacing",
      description:
        "Resurface the eastbound lane and repair damaged drainage.",
      location: "14 Market Street",
      applicant: "North District Works Ltd",
      plannedStartDate: "2026-12-01",
      plannedEndDate: "2026-12-12",
    },
    2: {
      workType: "Utility excavation",
      description: "Excavate and replace a damaged water connection.",
      location: "8 Station Road",
      applicant: "City Water Services",
      plannedStartDate: "2026-11-24",
      plannedEndDate: "2026-11-28",
    },
    3: {
      workType: "Footpath closure",
      description:
        "Temporarily close the footpath during facade repair work.",
      location: "22 Bridge Avenue",
      applicant: "Heritage Building Group",
      plannedStartDate: "2026-11-20",
      plannedEndDate: "2026-11-26",
    },
    4: {
      workType: "Crane operation",
      description:
        "Operate a mobile crane for rooftop equipment replacement.",
      location: "5 Council Square",
      applicant: "Central Engineering PLC",
      plannedStartDate: "2026-11-18",
      plannedEndDate: "2026-11-18",
    },
  } as const;

  const special = specialData[index as keyof typeof specialData];

  if (special) {
    return {
      applicationNumber: applicationNumber(index),
      ...special,
    };
  }

  const workTypes = [
    "Road maintenance",
    "Utility inspection",
    "Temporary access",
    "Drainage repair",
  ];

  return {
    applicationNumber: applicationNumber(index),
    workType: workTypes[index % workTypes.length],
    description: "Planned council works submitted for review.",
    location: `${index} Civic Road`,
    applicant: `Applicant ${String(index).padStart(3, "0")}`,
    plannedStartDate: "2026-12-01",
    plannedEndDate: "2026-12-05",
  };
}

async function main() {
  const existingApplicationCount = await prisma.application.count();

  if (existingApplicationCount > 0) {
    console.log(
      `Seed skipped: the database already contains ${existingApplicationCount} applications.`,
    );
    return;
  }

  const users = [
    {
      username: "anna.worker",
      displayName: "Anna Worker",
      role: UserRole.AUTHORIZED_WORKER,
    },
    {
      username: "michael.worker",
      displayName: "Michael Worker",
      role: UserRole.AUTHORIZED_WORKER,
    },
    {
      username: "olivia.viewer",
      displayName: "Olivia Viewer",
      role: UserRole.READ_ONLY,
    },
  ];

  const savedUsers = new Map<string, { id: string }>();

  for (const user of users) {
    const saved = await prisma.user.upsert({
      where: { username: user.username },
      update: {
        displayName: user.displayName,
        passwordHash: hashPassword(DEMO_PASSWORD),
        role: user.role,
        isActive: true,
      },
      create: {
        ...user,
        passwordHash: hashPassword(DEMO_PASSWORD),
      },
      select: { id: true },
    });

    savedUsers.set(user.username, saved);
  }

  const annaId = savedUsers.get("anna.worker")!.id;
  const michaelId = savedUsers.get("michael.worker")!.id;

  for (let index = 1; index <= 100; index += 1) {
    const identifier = applicationNumber(index);
    const data = sourceData(index);
    const synchronizedAt = new Date("2026-11-13T10:00:00.000Z");

    await prisma.sourceApplication.upsert({
      where: { externalIdentifier: identifier },
      update: {
        data,
        sourceUpdatedAt: synchronizedAt,
      },
      create: {
        externalIdentifier: identifier,
        data,
        sourceUpdatedAt: synchronizedAt,
      },
    });

    const status =
      index === 2 || index === 3
        ? ApplicationStatus.UNDER_REVIEW
        : index === 4
          ? ApplicationStatus.DONE
          : ApplicationStatus.NEW;

    const currentReviewerId =
      index === 2 ? annaId : index === 3 ? michaelId : null;

    const result = index === 4 ? DecisionResult.APPROVED : null;

    await prisma.application.upsert({
      where: { sourceIdentifier: identifier },
      update: {
        status,
        currentReviewerId,
        result,
        sourceLastSynchronizedAt: synchronizedAt,
      },
      create: {
        sourceIdentifier: identifier,
        status,
        currentReviewerId,
        result,
        sourceLastSynchronizedAt: synchronizedAt,
      },
    });
  }

  const application2 = await prisma.application.findUniqueOrThrow({
    where: { sourceIdentifier: "APP-002" },
  });
  const application3 = await prisma.application.findUniqueOrThrow({
    where: { sourceIdentifier: "APP-003" },
  });
  const application4 = await prisma.application.findUniqueOrThrow({
    where: { sourceIdentifier: "APP-004" },
  });

  const snapshot2Id = "00000000-0000-4000-8000-000000000202";
  const snapshot3Id = "00000000-0000-4000-8000-000000000203";
  const snapshot4Id = "00000000-0000-4000-8000-000000000204";

  await prisma.reviewSnapshot.upsert({
    where: { id: snapshot2Id },
    update: {},
    create: {
      id: snapshot2Id,
      applicationId: application2.id,
      sourceIdentifier: "APP-002",
      sourceData: sourceData(2),
      retrievedAt: new Date("2026-11-13T09:00:00.000Z"),
    },
  });

  await prisma.reviewSnapshot.upsert({
    where: { id: snapshot3Id },
    update: {},
    create: {
      id: snapshot3Id,
      applicationId: application3.id,
      sourceIdentifier: "APP-003",
      sourceData: sourceData(3),
      retrievedAt: new Date("2026-11-13T09:20:00.000Z"),
    },
  });

  await prisma.reviewSnapshot.upsert({
    where: { id: snapshot4Id },
    update: {},
    create: {
      id: snapshot4Id,
      applicationId: application4.id,
      sourceIdentifier: "APP-004",
      sourceData: sourceData(4),
      retrievedAt: new Date("2026-11-12T08:00:00.000Z"),
    },
  });

  const assignment2Id = "00000000-0000-4000-8000-000000000302";
  const assignment3Id = "00000000-0000-4000-8000-000000000303";
  const assignment4Id = "00000000-0000-4000-8000-000000000304";

  await prisma.reviewAssignment.upsert({
    where: { id: assignment2Id },
    update: {},
    create: {
      id: assignment2Id,
      applicationId: application2.id,
      reviewerId: annaId,
      snapshotId: snapshot2Id,
      startedAt: new Date("2026-11-13T09:00:00.000Z"),
    },
  });

  await prisma.reviewAssignment.upsert({
    where: { id: assignment3Id },
    update: {},
    create: {
      id: assignment3Id,
      applicationId: application3.id,
      reviewerId: michaelId,
      snapshotId: snapshot3Id,
      startedAt: new Date("2026-11-13T09:20:00.000Z"),
    },
  });

  await prisma.reviewAssignment.upsert({
    where: { id: assignment4Id },
    update: {},
    create: {
      id: assignment4Id,
      applicationId: application4.id,
      reviewerId: annaId,
      snapshotId: snapshot4Id,
      startedAt: new Date("2026-11-12T08:00:00.000Z"),
      endedAt: new Date("2026-11-12T09:05:00.000Z"),
      endReason: AssignmentEndReason.APPROVAL,
    },
  });

  await prisma.decision.upsert({
    where: { applicationId: application4.id },
    update: {},
    create: {
      id: "00000000-0000-4000-8000-000000000604",
      applicationId: application4.id,
      assignmentId: assignment4Id,
      snapshotId: snapshot4Id,
      decidingWorkerId: annaId,
      result: DecisionResult.APPROVED,
      comment: "Approved after review of the revised lifting plan.",
      decidedAt: new Date("2026-11-12T09:05:00.000Z"),
    },
  });

  await prisma.generalComment.upsert({
    where: { id: "00000000-0000-4000-8000-000000000402" },
    update: {},
    create: {
      id: "00000000-0000-4000-8000-000000000402",
      applicationId: application2.id,
      authorId: michaelId,
      text: "Traffic management information has been reviewed.",
      createdAt: new Date("2026-11-12T15:10:00.000Z"),
    },
  });

  await prisma.generalComment.upsert({
    where: { id: "00000000-0000-4000-8000-000000000404" },
    update: {},
    create: {
      id: "00000000-0000-4000-8000-000000000404",
      applicationId: application4.id,
      authorId: annaId,
      text: "Applicant supplied the revised lifting plan.",
      createdAt: new Date("2026-11-12T08:15:00.000Z"),
    },
  });

  const auditEvents = [
    {
      id: "00000000-0000-4000-8000-000000000502",
      applicationId: application2.id,
      actorId: annaId,
      action: AuditAction.START_REVIEW,
      details: { snapshotId: snapshot2Id, assignmentId: assignment2Id },
      createdAt: new Date("2026-11-13T09:00:00.000Z"),
    },
    {
      id: "00000000-0000-4000-8000-000000000503",
      applicationId: application3.id,
      actorId: michaelId,
      action: AuditAction.START_REVIEW,
      details: { snapshotId: snapshot3Id, assignmentId: assignment3Id },
      createdAt: new Date("2026-11-13T09:20:00.000Z"),
    },
    {
      id: "00000000-0000-4000-8000-000000000504",
      applicationId: application4.id,
      actorId: annaId,
      action: AuditAction.APPROVE,
      details: {
        snapshotId: snapshot4Id,
        assignmentId: assignment4Id,
        result: DecisionResult.APPROVED,
      },
      createdAt: new Date("2026-11-12T09:05:00.000Z"),
    },
  ];

  for (const event of auditEvents) {
    await prisma.auditEvent.upsert({
      where: { id: event.id },
      update: {},
      create: event,
    });
  }

  console.log("Seed completed.");
  console.log("Demo users: anna.worker, michael.worker, olivia.viewer");
  console.log(`Demo password: ${DEMO_PASSWORD}`);
  console.log("Applications: 100");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
