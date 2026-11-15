import "server-only";

import {
  ApplicationStatus,
  DecisionResult,
  Prisma,
  UserRole,
} from "@/generated/prisma/client";
import type {
  Application,
  ApplicationSummary,
  PageResult,
  SnapshotSourceData,
  User,
} from "@/lib/domain/types";
import { db } from "@/lib/server/db";

function mapRole(role: UserRole): User["role"] {
  return role === UserRole.AUTHORIZED_WORKER
    ? "authorized-worker"
    : "read-only";
}

function mapUser(user: {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
}): User {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: mapRole(user.role),
  };
}

function mapStatus(
  status: ApplicationStatus,
): Application["status"] {
  switch (status) {
    case ApplicationStatus.NEW:
      return "new";
    case ApplicationStatus.UNDER_REVIEW:
      return "under-review";
    case ApplicationStatus.DONE:
      return "done";
  }
}

function mapResult(
  result: DecisionResult | null,
): Application["result"] {
  if (result === null) {
    return null;
  }

  return result === DecisionResult.APPROVED
    ? "approved"
    : "rejected";
}

function readSourceData(value: Prisma.JsonValue): SnapshotSourceData {
  if (
    value === null ||
    Array.isArray(value) ||
    typeof value !== "object"
  ) {
    throw new Error("Stored source application data is invalid.");
  }

  const data = value as Prisma.JsonObject;

  function requiredString(field: keyof SnapshotSourceData): string {
    const fieldValue = data[field];

    if (typeof fieldValue !== "string") {
      throw new Error(
        `Stored source application field "${field}" is invalid.`,
      );
    }

    return fieldValue;
  }

  return {
    applicationNumber: requiredString("applicationNumber"),
    workType: requiredString("workType"),
    description: requiredString("description"),
    location: requiredString("location"),
    applicant: requiredString("applicant"),
    plannedStartDate: requiredString("plannedStartDate"),
    plannedEndDate: requiredString("plannedEndDate"),
  };
}

export async function listApplications({
  page,
  pageSize,
}: {
  page: number;
  pageSize: 5 | 10 | 25 | 100;
}): Promise<PageResult<ApplicationSummary>> {
  const [rows, totalItems] = await db.$transaction([
    db.application.findMany({
      orderBy: {
        sourceIdentifier: "asc",
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        source: {
          select: {
            data: true,
          },
        },
        currentReviewer: {
          select: {
            displayName: true,
          },
        },
      },
    }),
    db.application.count(),
  ]);

  return {
    items: rows.map((application) => {
      const sourceData = readSourceData(application.source.data);

      return {
        id: application.id,
        applicationNumber: sourceData.applicationNumber,
        workType: sourceData.workType,
        location: sourceData.location,
        status: mapStatus(application.status),
        currentReviewerName:
          application.currentReviewer?.displayName ?? null,
        result: mapResult(application.result),
      };
    }),
    page,
    pageSize,
    totalItems,
    totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
  };
}

export async function getApplicationById(
  id: string,
): Promise<Application | null> {
  const application = await db.application.findUnique({
    where: { id },
    include: {
      source: true,
      currentReviewer: true,
      assignments: {
        where: {
          endedAt: null,
        },
        take: 1,
        include: {
          reviewer: true,
          snapshot: true,
        },
      },
      decision: {
        include: {
          decidingWorker: true,
          snapshot: true,
        },
      },
      generalComments: {
        where: {
          deletedAt: null,
        },
        orderBy: {
          createdAt: "asc",
        },
        include: {
          author: true,
        },
      },
    },
  });

  if (!application) {
    return null;
  }

  const activeAssignment = application.assignments[0] ?? null;
  const displayedSnapshot =
    activeAssignment?.snapshot ??
    application.decision?.snapshot ??
    null;

  return {
    id: application.id,
    applicationNumber: application.sourceIdentifier,
    status: mapStatus(application.status),
    currentReviewer: application.currentReviewer
      ? mapUser(application.currentReviewer)
      : null,
    result: mapResult(application.result),
    sourceData: readSourceData(application.source.data),
    sourceLastSynchronizedAt:
      application.sourceLastSynchronizedAt.toISOString(),
    activeSnapshot: displayedSnapshot
      ? {
          id: displayedSnapshot.id,
          ...readSourceData(displayedSnapshot.sourceData),
          retrievedAt: displayedSnapshot.retrievedAt.toISOString(),
        }
      : null,
    activeAssignment: activeAssignment
      ? {
          id: activeAssignment.id,
          reviewer: mapUser(activeAssignment.reviewer),
          startedAt: activeAssignment.startedAt.toISOString(),
          endedAt: null,
          endReason: null,
        }
      : null,
    generalComments: application.generalComments.map((comment) => ({
      id: comment.id,
      text: comment.text,
      author: mapUser(comment.author),
      createdAt: comment.createdAt.toISOString(),
    })),
    decision: application.decision
      ? {
          id: application.decision.id,
          result:
            application.decision.result === DecisionResult.APPROVED
              ? "approved"
              : "rejected",
          comment: application.decision.comment,
          decidingWorker: mapUser(
            application.decision.decidingWorker,
          ),
          decidedAt: application.decision.decidedAt.toISOString(),
          snapshotId: application.decision.snapshotId,
        }
      : null,
  };
}