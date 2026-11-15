import { createHash } from "node:crypto";
import { Pool, type QueryResultRow } from "pg";

const connectionString =
  process.env.E2E_DATABASE_URL ??
  "postgresql://works_approve_e2e:e2e_only_password@127.0.0.1:5433/works_approve_e2e?schema=public";

const pool = new Pool({ connectionString, max: 4 });

export async function query<T extends QueryResultRow>(
  text: string,
  values: unknown[] = [],
): Promise<T[]> {
  const result = await pool.query<T>(text, values);
  return result.rows;
}

export async function getWorkflowEvidence(applicationNumber: string) {
  const rows = await query<{
    status: string;
    result: string | null;
    currentReviewer: string | null;
    snapshots: string;
    activeAssignments: string;
    endedApprovals: string;
    decisions: string;
    startEvents: string;
    approveEvents: string;
    idempotencyRecords: string;
  }>(
    `SELECT
      a."status"::text AS status,
      a."result"::text AS result,
      u."username" AS "currentReviewer",
      (SELECT count(*) FROM "ReviewSnapshot" s WHERE s."applicationId" = a."id")::text AS snapshots,
      (SELECT count(*) FROM "ReviewAssignment" ra WHERE ra."applicationId" = a."id" AND ra."endedAt" IS NULL)::text AS "activeAssignments",
      (SELECT count(*) FROM "ReviewAssignment" ra WHERE ra."applicationId" = a."id" AND ra."endReason" = 'APPROVAL')::text AS "endedApprovals",
      (SELECT count(*) FROM "Decision" d WHERE d."applicationId" = a."id")::text AS decisions,
      (SELECT count(*) FROM "AuditEvent" ae WHERE ae."applicationId" = a."id" AND ae."action" = 'START_REVIEW')::text AS "startEvents",
      (SELECT count(*) FROM "AuditEvent" ae WHERE ae."applicationId" = a."id" AND ae."action" = 'APPROVE')::text AS "approveEvents",
      (SELECT count(*) FROM "IdempotencyRecord" ir WHERE ir."applicationId" = a."id")::text AS "idempotencyRecords"
    FROM "Application" a
    LEFT JOIN "User" u ON u."id" = a."currentReviewerId"
    WHERE a."sourceIdentifier" = $1`,
    [applicationNumber],
  );

  if (!rows[0]) {
    throw new Error(`${applicationNumber} was not found.`);
  }

  return {
    status: rows[0].status,
    result: rows[0].result,
    currentReviewer: rows[0].currentReviewer,
    snapshots: Number(rows[0].snapshots),
    activeAssignments: Number(rows[0].activeAssignments),
    endedApprovals: Number(rows[0].endedApprovals),
    decisions: Number(rows[0].decisions),
    startEvents: Number(rows[0].startEvents),
    approveEvents: Number(rows[0].approveEvents),
    idempotencyRecords: Number(rows[0].idempotencyRecords),
  };
}

export async function expireSession(rawToken: string): Promise<void> {
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const result = await pool.query(
    `UPDATE "Session"
     SET "lastActivityAt" = now() - interval '2 minutes',
         "idleExpiresAt" = now() - interval '1 minute'
     WHERE "tokenHash" = $1 AND "revokedAt" IS NULL`,
    [tokenHash],
  );

  if (result.rowCount !== 1) {
    throw new Error("The active browser session could not be expired.");
  }
}

export async function replaceSourceDescription(
  applicationNumber: string,
  description: string,
): Promise<void> {
  const result = await pool.query(
    `UPDATE "SourceApplication"
     SET "data" = jsonb_set("data", '{description}', to_jsonb($2::text), true),
         "sourceUpdatedAt" = now()
     WHERE "externalIdentifier" = $1`,
    [applicationNumber, description],
  );

  if (result.rowCount !== 1) {
    throw new Error(`${applicationNumber} source data could not be updated.`);
  }
}

export async function closeDatabase(): Promise<void> {
  await pool.end();
}
