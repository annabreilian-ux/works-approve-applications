-- Snapshots, decisions, and audit events are append-only records.
CREATE FUNCTION "prevent_immutable_record_change"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% records are immutable', TG_TABLE_NAME
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "ReviewSnapshot_prevent_change"
BEFORE UPDATE OR DELETE ON "ReviewSnapshot"
FOR EACH ROW EXECUTE FUNCTION "prevent_immutable_record_change"();

CREATE TRIGGER "Decision_prevent_change"
BEFORE UPDATE OR DELETE ON "Decision"
FOR EACH ROW EXECUTE FUNCTION "prevent_immutable_record_change"();

CREATE TRIGGER "AuditEvent_prevent_change"
BEFORE UPDATE OR DELETE ON "AuditEvent"
FOR EACH ROW EXECUTE FUNCTION "prevent_immutable_record_change"();

-- A decision must use the application, snapshot, and worker from its assignment.
CREATE FUNCTION "validate_decision_assignment"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  assignment_record "ReviewAssignment"%ROWTYPE;
  snapshot_application_id UUID;
BEGIN
  SELECT *
  INTO assignment_record
  FROM "ReviewAssignment"
  WHERE "id" = NEW."assignmentId";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Decision assignment does not exist'
      USING ERRCODE = '23503';
  END IF;

  SELECT "applicationId"
  INTO snapshot_application_id
  FROM "ReviewSnapshot"
  WHERE "id" = NEW."snapshotId";

  IF assignment_record."applicationId" <> NEW."applicationId"
    OR assignment_record."snapshotId" <> NEW."snapshotId"
    OR assignment_record."reviewerId" <> NEW."decidingWorkerId"
    OR snapshot_application_id <> NEW."applicationId"
  THEN
    RAISE EXCEPTION 'Decision does not match its application, assignment, snapshot, and deciding worker'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "Decision_validate_assignment"
BEFORE INSERT ON "Decision"
FOR EACH ROW EXECUTE FUNCTION "validate_decision_assignment"();
