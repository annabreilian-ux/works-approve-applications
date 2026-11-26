import os
from typing import TypedDict

import psycopg
from psycopg.rows import dict_row


DEFAULT_DATABASE_URL = (
    "postgresql://works_approve_e2e:e2e_only_password@127.0.0.1:5433/"
    "works_approve_e2e?schema=public"
)


class WorkflowEvidence(TypedDict):
    status: str
    snapshots: int
    active_assignments: int
    decisions: int
    start_events: int


def get_workflow_evidence(application_number: str) -> WorkflowEvidence:
    connection_string = os.getenv("E2E_DATABASE_URL", DEFAULT_DATABASE_URL)
    connection_string = connection_string.replace("?schema=public", "")
    query = """
        SELECT
          a."status"::text AS status,
          (SELECT count(*) FROM "ReviewSnapshot" s
            WHERE s."applicationId" = a."id") AS snapshots,
          (SELECT count(*) FROM "ReviewAssignment" ra
            WHERE ra."applicationId" = a."id"
              AND ra."endedAt" IS NULL) AS active_assignments,
          (SELECT count(*) FROM "Decision" d
            WHERE d."applicationId" = a."id") AS decisions,
          (SELECT count(*) FROM "AuditEvent" ae
            WHERE ae."applicationId" = a."id"
              AND ae."action" = 'START_REVIEW') AS start_events
        FROM "Application" a
        WHERE a."sourceIdentifier" = %s
    """

    with psycopg.connect(connection_string, row_factory=dict_row) as connection:
        with connection.cursor() as cursor:
            cursor.execute(query, (application_number,))
            row = cursor.fetchone()

    assert row is not None, f"{application_number} was not found."
    return WorkflowEvidence(
        status=row["status"],
        snapshots=row["snapshots"],
        active_assignments=row["active_assignments"],
        decisions=row["decisions"],
        start_events=row["start_events"],
    )
