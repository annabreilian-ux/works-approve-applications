-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('AUTHORIZED_WORKER', 'READ_ONLY');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('NEW', 'UNDER_REVIEW', 'DONE');

-- CreateEnum
CREATE TYPE "DecisionResult" AS ENUM ('APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AssignmentEndReason" AS ENUM ('APPROVAL', 'REJECTION', 'RELEASE');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('START_REVIEW', 'RELEASE_REVIEW', 'APPROVE', 'REJECT', 'ADD_GENERAL_COMMENT', 'DELETE_GENERAL_COMMENT');

-- CreateEnum
CREATE TYPE "IdempotencyOperation" AS ENUM ('START_REVIEW', 'APPROVE');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "username" VARCHAR(100) NOT NULL,
    "displayName" VARCHAR(200) NOT NULL,
    "passwordHash" VARCHAR(255) NOT NULL,
    "role" "UserRole" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivityAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idleExpiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceApplication" (
    "id" UUID NOT NULL,
    "externalIdentifier" VARCHAR(100) NOT NULL,
    "data" JSONB NOT NULL,
    "sourceUpdatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SourceApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" UUID NOT NULL,
    "sourceIdentifier" VARCHAR(100) NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'NEW',
    "currentReviewerId" UUID,
    "result" "DecisionResult",
    "sourceLastSynchronizedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewSnapshot" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "sourceIdentifier" VARCHAR(100) NOT NULL,
    "sourceData" JSONB NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "retrievedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewAssignment" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "reviewerId" UUID NOT NULL,
    "snapshotId" UUID NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMPTZ(3),
    "endReason" "AssignmentEndReason",

    CONSTRAINT "ReviewAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Decision" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "assignmentId" UUID NOT NULL,
    "snapshotId" UUID NOT NULL,
    "decidingWorkerId" UUID NOT NULL,
    "result" "DecisionResult" NOT NULL,
    "comment" VARCHAR(2000) NOT NULL,
    "decidedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneralComment" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ(3),
    "deletedById" UUID,

    CONSTRAINT "GeneralComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "action" "AuditAction" NOT NULL,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "id" UUID NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "operation" "IdempotencyOperation" NOT NULL,
    "userId" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "responseStatus" INTEGER,
    "responseBody" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_idleExpiresAt_idx" ON "Session"("idleExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "SourceApplication_externalIdentifier_key" ON "SourceApplication"("externalIdentifier");

-- CreateIndex
CREATE UNIQUE INDEX "Application_sourceIdentifier_key" ON "Application"("sourceIdentifier");

-- CreateIndex
CREATE INDEX "Application_status_idx" ON "Application"("status");

-- CreateIndex
CREATE INDEX "Application_currentReviewerId_idx" ON "Application"("currentReviewerId");

-- CreateIndex
CREATE INDEX "ReviewSnapshot_applicationId_idx" ON "ReviewSnapshot"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewAssignment_snapshotId_key" ON "ReviewAssignment"("snapshotId");

-- CreateIndex
CREATE INDEX "ReviewAssignment_applicationId_idx" ON "ReviewAssignment"("applicationId");

-- CreateIndex
CREATE INDEX "ReviewAssignment_reviewerId_idx" ON "ReviewAssignment"("reviewerId");

-- CreateIndex
CREATE UNIQUE INDEX "Decision_applicationId_key" ON "Decision"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "Decision_assignmentId_key" ON "Decision"("assignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Decision_snapshotId_key" ON "Decision"("snapshotId");

-- CreateIndex
CREATE INDEX "Decision_decidingWorkerId_idx" ON "Decision"("decidingWorkerId");

-- CreateIndex
CREATE INDEX "GeneralComment_applicationId_createdAt_idx" ON "GeneralComment"("applicationId", "createdAt");

-- CreateIndex
CREATE INDEX "GeneralComment_authorId_idx" ON "GeneralComment"("authorId");

-- CreateIndex
CREATE INDEX "AuditEvent_applicationId_createdAt_idx" ON "AuditEvent"("applicationId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_actorId_idx" ON "AuditEvent"("actorId");

-- CreateIndex
CREATE INDEX "IdempotencyRecord_applicationId_idx" ON "IdempotencyRecord"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyRecord_userId_operation_key_key" ON "IdempotencyRecord"("userId", "operation", "key");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_sourceIdentifier_fkey" FOREIGN KEY ("sourceIdentifier") REFERENCES "SourceApplication"("externalIdentifier") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_currentReviewerId_fkey" FOREIGN KEY ("currentReviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewSnapshot" ADD CONSTRAINT "ReviewSnapshot_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewAssignment" ADD CONSTRAINT "ReviewAssignment_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewAssignment" ADD CONSTRAINT "ReviewAssignment_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewAssignment" ADD CONSTRAINT "ReviewAssignment_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "ReviewSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "ReviewAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "ReviewSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_decidingWorkerId_fkey" FOREIGN KEY ("decidingWorkerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneralComment" ADD CONSTRAINT "GeneralComment_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneralComment" ADD CONSTRAINT "GeneralComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneralComment" ADD CONSTRAINT "GeneralComment_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdempotencyRecord" ADD CONSTRAINT "IdempotencyRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdempotencyRecord" ADD CONSTRAINT "IdempotencyRecord_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Only one unfinished review assignment may exist per application.
CREATE UNIQUE INDEX "ReviewAssignment_one_active_per_application_key"
ON "ReviewAssignment" ("applicationId")
WHERE "endedAt" IS NULL;

-- An assignment is either active or ended with a reason.
ALTER TABLE "ReviewAssignment"
ADD CONSTRAINT "ReviewAssignment_end_state_check"
CHECK (
  ("endedAt" IS NULL AND "endReason" IS NULL)
  OR
  ("endedAt" IS NOT NULL AND "endReason" IS NOT NULL)
);

-- Application workflow fields must agree with the processing status.
ALTER TABLE "Application"
ADD CONSTRAINT "Application_workflow_state_check"
CHECK (
  (
    "status" = 'NEW'
    AND "currentReviewerId" IS NULL
    AND "result" IS NULL
  )
  OR
  (
    "status" = 'UNDER_REVIEW'
    AND "currentReviewerId" IS NOT NULL
    AND "result" IS NULL
  )
  OR
  (
    "status" = 'DONE'
    AND "currentReviewerId" IS NULL
    AND "result" IS NOT NULL
  )
);

-- Decision comments must contain non-whitespace text.
ALTER TABLE "Decision"
ADD CONSTRAINT "Decision_comment_check"
CHECK (char_length(btrim("comment")) BETWEEN 1 AND 2000);

-- Comment deletion metadata must be set together.
ALTER TABLE "GeneralComment"
ADD CONSTRAINT "GeneralComment_deletion_state_check"
CHECK (
  ("deletedAt" IS NULL AND "deletedById" IS NULL)
  OR
  ("deletedAt" IS NOT NULL AND "deletedById" IS NOT NULL)
);

-- Session idle expiry must be later than its recorded activity.
ALTER TABLE "Session"
ADD CONSTRAINT "Session_idle_expiry_check"
CHECK ("idleExpiresAt" > "lastActivityAt");

-- Snapshot schema versions must be positive.
ALTER TABLE "ReviewSnapshot"
ADD CONSTRAINT "ReviewSnapshot_schema_version_check"
CHECK ("schemaVersion" > 0);
