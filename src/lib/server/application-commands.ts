import "server-only";

import { createHash } from "node:crypto";
import {
  ApplicationStatus,
  AssignmentEndReason,
  AuditAction,
  DecisionResult,
  IdempotencyOperation,
  Prisma,
  UserRole,
} from "@/generated/prisma/client";
import type { Application } from "@/lib/domain/types";
import { getApplicationById } from "@/lib/server/application-queries";
import { db } from "@/lib/server/db";
import type { SessionUser } from "@/lib/server/session";
import { WorkflowError } from "@/lib/server/workflow-error";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export async function startApplicationReview(
  applicationId: string,
  actor: SessionUser,
): Promise<Application> {
  if (!isUuid(applicationId)) {
    throw new WorkflowError(
      "not-found",
      "The application could not be found.",
      404,
    );
  }

  if (actor.role !== UserRole.AUTHORIZED_WORKER) {
    throw new WorkflowError(
      "forbidden",
      "You cannot start this review.",
      403,
    );
  }

  try {
    await db.$transaction(async (transaction) => {
      const lockedRows = await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "Application"
        WHERE "id" = ${applicationId}::uuid
        FOR UPDATE
      `;

      if (lockedRows.length === 0) {
        throw new WorkflowError(
          "not-found",
          "The application could not be found.",
          404,
        );
      }

      const application = await transaction.application.findUnique({
        where: { id: applicationId },
        include: {
          source: true,
          decision: {
            select: { id: true },
          },
          assignments: {
            where: { endedAt: null },
            select: { id: true },
            take: 1,
          },
        },
      });

      if (!application) {
        throw new WorkflowError(
          "not-found",
          "The application could not be found.",
          404,
        );
      }

      if (
        application.status !== ApplicationStatus.NEW ||
        application.currentReviewerId !== null ||
        application.result !== null ||
        application.decision !== null ||
        application.assignments.length > 0
      ) {
        throw new WorkflowError(
          "ownership-conflict",
          "Another worker started this review first.",
          409,
        );
      }

      const snapshot = await transaction.reviewSnapshot.create({
        data: {
          applicationId: application.id,
          sourceIdentifier: application.sourceIdentifier,
          sourceData: application.source.data as Prisma.InputJsonValue,
          schemaVersion: 1,
          retrievedAt: new Date(),
        },
      });

      const assignment = await transaction.reviewAssignment.create({
        data: {
          applicationId: application.id,
          reviewerId: actor.id,
          snapshotId: snapshot.id,
        },
      });

      await transaction.application.update({
        where: { id: application.id },
        data: {
          status: ApplicationStatus.UNDER_REVIEW,
          currentReviewerId: actor.id,
          sourceLastSynchronizedAt: application.source.sourceUpdatedAt,
        },
      });

      await transaction.auditEvent.create({
        data: {
          applicationId: application.id,
          actorId: actor.id,
          action: AuditAction.START_REVIEW,
          details: {
            assignmentId: assignment.id,
            snapshotId: snapshot.id,
          },
        },
      });
    });
  } catch (error) {
    if (error instanceof WorkflowError) {
      throw error;
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new WorkflowError(
        "ownership-conflict",
        "Another worker started this review first.",
        409,
      );
    }

    throw error;
  }

  const application = await getApplicationById(applicationId);

  if (!application) {
    throw new WorkflowError(
      "uncertain-outcome",
      "The review started, but the latest state could not be loaded.",
      503,
    );
  }

  return application;
}

function approvalRequestHash(
  applicationId: string,
  decisionComment: string,
): string {
  return createHash("sha256")
    .update(applicationId)
    .update("\0")
    .update(decisionComment)
    .digest("hex");
}

export async function approveApplicationReview(
  applicationId: string,
  actor: SessionUser,
  decisionComment: string,
  idempotencyKey: string,
): Promise<Application> {
  if (!isUuid(applicationId)) {
    throw new WorkflowError(
      "not-found",
      "The application could not be found.",
      404,
    );
  }

  if (actor.role !== UserRole.AUTHORIZED_WORKER) {
    throw new WorkflowError(
      "forbidden",
      "You cannot approve this application.",
      403,
    );
  }

  const normalizedComment = decisionComment.trim();

  if (
    normalizedComment.length === 0 ||
    normalizedComment.length > 2_000
  ) {
    throw new WorkflowError(
      "validation-error",
      "Enter a decision comment of no more than 2,000 characters.",
      400,
    );
  }

  if (idempotencyKey.length === 0 || idempotencyKey.length > 100) {
    throw new WorkflowError(
      "validation-error",
      "The approval request identifier is invalid.",
      400,
    );
  }

  const requestHash = approvalRequestHash(
    applicationId,
    normalizedComment,
  );

  try {
    await db.$transaction(async (transaction) => {
      const lockedRows = await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "Application"
        WHERE "id" = ${applicationId}::uuid
        FOR UPDATE
      `;

      if (lockedRows.length === 0) {
        throw new WorkflowError(
          "not-found",
          "The application could not be found.",
          404,
        );
      }

      const application = await transaction.application.findUnique({
        where: { id: applicationId },
        include: {
          decision: true,
          assignments: {
            where: { endedAt: null },
            take: 1,
          },
        },
      });

      if (!application) {
        throw new WorkflowError(
          "not-found",
          "The application could not be found.",
          404,
        );
      }

      const existingRequest =
        await transaction.idempotencyRecord.findUnique({
          where: {
            userId_operation_key: {
              userId: actor.id,
              operation: IdempotencyOperation.APPROVE,
              key: idempotencyKey,
            },
          },
        });

      if (existingRequest) {
        if (existingRequest.requestHash !== requestHash) {
          throw new WorkflowError(
            "validation-error",
            "This approval request identifier was already used for different data.",
            409,
          );
        }

        if (
          existingRequest.responseStatus === 200 &&
          application.status === ApplicationStatus.DONE &&
          application.decision !== null
        ) {
          return;
        }

        throw new WorkflowError(
          "uncertain-outcome",
          "The approval outcome must be reconciled before another submission.",
          409,
        );
      }

      if (
        application.status === ApplicationStatus.DONE &&
        application.decision !== null
      ) {
        if (application.decision.decidingWorkerId === actor.id) {
          return;
        }

        throw new WorkflowError(
          "invalid-state",
          "This application is already completed.",
          409,
        );
      }

      const activeAssignment = application.assignments[0] ?? null;

      if (
        application.status !== ApplicationStatus.UNDER_REVIEW ||
        !activeAssignment ||
        application.currentReviewerId !== actor.id
      ) {
        throw new WorkflowError(
          "ownership-lost",
          "You no longer own this review.",
          409,
        );
      }

      if (application.result !== null || application.decision !== null) {
        throw new WorkflowError(
          "invalid-state",
          "This application is not available for approval.",
          409,
        );
      }

      const request = await transaction.idempotencyRecord.create({
        data: {
          key: idempotencyKey,
          operation: IdempotencyOperation.APPROVE,
          userId: actor.id,
          applicationId: application.id,
          requestHash,
        },
      });

      const decidedAt = new Date();
      const decision = await transaction.decision.create({
        data: {
          applicationId: application.id,
          assignmentId: activeAssignment.id,
          snapshotId: activeAssignment.snapshotId,
          decidingWorkerId: actor.id,
          result: DecisionResult.APPROVED,
          comment: normalizedComment,
          decidedAt,
        },
      });

      await transaction.reviewAssignment.update({
        where: { id: activeAssignment.id },
        data: {
          endedAt: decidedAt,
          endReason: AssignmentEndReason.APPROVAL,
        },
      });

      await transaction.application.update({
        where: { id: application.id },
        data: {
          status: ApplicationStatus.DONE,
          currentReviewerId: null,
          result: DecisionResult.APPROVED,
        },
      });

      await transaction.auditEvent.create({
        data: {
          applicationId: application.id,
          actorId: actor.id,
          action: AuditAction.APPROVE,
          details: {
            assignmentId: activeAssignment.id,
            snapshotId: activeAssignment.snapshotId,
            decisionId: decision.id,
            result: DecisionResult.APPROVED,
          },
          createdAt: decidedAt,
        },
      });

      await transaction.idempotencyRecord.update({
        where: { id: request.id },
        data: {
          responseStatus: 200,
          responseBody: {
            applicationId: application.id,
            decisionId: decision.id,
            result: DecisionResult.APPROVED,
          },
        },
      });
    });
  } catch (error) {
    if (error instanceof WorkflowError) {
      throw error;
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new WorkflowError(
        "uncertain-outcome",
        "The approval outcome must be reconciled before another submission.",
        409,
      );
    }

    throw error;
  }

  const application = await getApplicationById(applicationId);

  if (!application) {
    throw new WorkflowError(
      "uncertain-outcome",
      "The approval completed, but the latest state could not be loaded.",
      503,
    );
  }

  return application;
}
