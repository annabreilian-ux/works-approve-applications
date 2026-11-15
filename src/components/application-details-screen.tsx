"use client";

import { useCallback, useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";

import { ApprovalDialog } from "@/components/approval-dialog";
import { FeedbackAlert } from "@/components/feedback-alert";
import { ApplicationDetailsSkeleton } from "@/components/loading-states";
import { ResultBadge, StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Application, SnapshotSourceData, User } from "@/lib/domain/types";
import {
  applicationService,
} from "@/lib/services/http-application-service";
import { authService } from "@/lib/services/http-auth-service";

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    new Date(`${value}T00:00:00`),
  );
}

function DetailsList({ data }: { data: SnapshotSourceData }) {
  const items = [
    ["Application number", data.applicationNumber],
    ["Work type", data.workType],
    ["Description", data.description],
    ["Location", data.location],
    ["Applicant", data.applicant],
    ["Planned start", formatDate(data.plannedStartDate)],
    ["Planned end", formatDate(data.plannedEndDate)],
  ];

  return (
    <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
      {items.map(([label, value]) => (
        <div key={label} className={label === "Description" ? "sm:col-span-2" : undefined}>
          <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
          <dd className="mt-1 whitespace-pre-wrap break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ApplicationDetailsScreen() {
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const applicationId = params.id;
  const [application, setApplication] = useState<Application>();
  const [currentUser, setCurrentUser] = useState<User>();
  const [isLoading, setIsLoading] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  const [pageError, setPageError] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [actionErrorTitle, setActionErrorTitle] = useState("Review could not be started");
  const [actionMessage, setActionMessage] = useState<string>();
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [decisionComment, setDecisionComment] = useState("");
  const [decisionCommentError, setDecisionCommentError] = useState<string>();
  const [approvalError, setApprovalError] = useState<string>();
  const [isApproving, setIsApproving] = useState(false);

  const loadApplication = useCallback(async () => {
    setIsLoading(true);
    setPageError(undefined);

    const session = await authService.getSession();
    if (!session.ok || !session.data) {
      const reason =
        !session.ok && session.error.code === "session-expired"
          ? "reason=session-expired&"
          : "";
      router.replace(
        `/sign-in?${reason}returnTo=${encodeURIComponent(pathname)}`,
      );
      return;
    }

    setCurrentUser(session.data.user);
    const response = await applicationService.getApplication(applicationId);
    if (response.ok) {
      setApplication(response.data);
    } else {
      setPageError(response.error.message);
    }
    setIsLoading(false);
  }, [applicationId, pathname, router]);

  useEffect(() => {
    void Promise.resolve().then(loadApplication);
  }, [loadApplication]);

  async function startReview() {
    if (!currentUser || !application) return;

    flushSync(() => setIsStarting(true));
    setActionError(undefined);
    setActionErrorTitle("Review could not be started");
    setActionMessage(undefined);
    const response = await applicationService.startReview({
      applicationId: application.id,
    });

    if (response.ok) {
      setApplication(response.data);
      setActionMessage("Review started. The snapshot is now fixed for this review.");
      setIsStarting(false);
      return;
    }

    if (response.error.code === "session-expired") {
      setIsStarting(false);
      router.push(
        `/sign-in?reason=session-expired&returnTo=${encodeURIComponent(pathname)}`,
      );
      return;
    }

    if (
      response.error.code === "ownership-conflict" ||
      response.error.code === "uncertain-outcome"
    ) {
      setActionMessage("Checking the latest application state before another attempt.");
      const authoritative = await applicationService.getApplication(application.id);
      if (authoritative.ok) {
        setApplication(authoritative.data);
        setActionError(
          authoritative.data.status === "new"
            ? "The review was not started. You can try again."
            : response.error.message,
        );
      } else {
        setActionError(authoritative.error.message);
      }
      setActionMessage(undefined);
    } else {
      setActionError(response.error.message);
    }

    setIsStarting(false);
  }

  async function approveApplication() {
    if (!currentUser || !application) return;

    const normalizedComment = decisionComment.trim();
    if (normalizedComment.length === 0) {
      setDecisionCommentError("Enter a decision comment.");
      return;
    }
    if (normalizedComment.length > 2_000) {
      setDecisionCommentError("Enter no more than 2,000 characters after trimming.");
      return;
    }

    setDecisionCommentError(undefined);
    setApprovalError(undefined);
    flushSync(() => setIsApproving(true));
    const response = await applicationService.approveApplication({
      applicationId: application.id,
      decisionComment: normalizedComment,
    });

    if (response.ok) {
      setApplication(response.data);
      setApprovalOpen(false);
      setDecisionComment("");
      setActionMessage("Application approved. The completed result is now read-only.");
      setIsApproving(false);
      return;
    }

    if (response.error.code === "session-expired") {
      setIsApproving(false);
      setApprovalOpen(false);
      await authService.signOut();
      router.push(
        `/sign-in?reason=session-expired&returnTo=${encodeURIComponent(pathname)}`,
      );
      return;
    }

    if (
      response.error.code === "ownership-lost" ||
      response.error.code === "uncertain-outcome"
    ) {
      const authoritative = await applicationService.getApplication(application.id);
      if (authoritative.ok) {
        setApplication(authoritative.data);

        if (authoritative.data.status === "done") {
          setApprovalOpen(false);
          setDecisionComment("");
          setActionMessage("The approval was completed and the confirmed result is shown.");
        } else if (authoritative.data.currentReviewer?.id === currentUser.id) {
          setApprovalError(
            "The approval was not completed. Your comment is preserved; you can try again.",
          );
        } else {
          setApprovalOpen(false);
          setActionErrorTitle("Review ownership changed");
          setActionError(response.error.message);
        }
      } else {
        setApprovalError(authoritative.error.message);
      }
    } else if (response.error.field === "decisionComment") {
      setDecisionCommentError(response.error.message);
    } else {
      setApprovalError(response.error.message);
    }

    setIsApproving(false);
  }

  async function restoreDetails() {
    await loadApplication();
  }

  function setApprovalDialogOpen(nextOpen: boolean) {
    setApprovalOpen(nextOpen);

    if (!nextOpen) {
      setDecisionComment("");
      setDecisionCommentError(undefined);
      setApprovalError(undefined);
    }
  }

  if (isLoading) {
    return (
      <section className="space-y-6">
        <h1 className="text-3xl font-semibold tracking-tight">Application details</h1>
        <ApplicationDetailsSkeleton />
      </section>
    );
  }

  if (pageError || !application || !currentUser) {
    return (
      <section className="space-y-6">
        <h1 className="text-3xl font-semibold tracking-tight">Application details</h1>
        <FeedbackAlert
          kind="error"
          title="Application could not be loaded"
          message={pageError ?? "The application is unavailable."}
          actions={
            <>
              <Button variant="outline" onClick={() => void restoreDetails()}>
                Try again
              </Button>
              <Button
                render={<Link href="/applications" />}
                nativeButton={false}
                variant="outline"
              >
                Return to registry
              </Button>
            </>
          }
        />
      </section>
    );
  }

  const ownsReview = application.currentReviewer?.id === currentUser.id;
  const canStart = currentUser.role === "authorized-worker" && application.status === "new";
  const snapshotData = application.activeSnapshot ?? application.sourceData;

  return (
    <section className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <Link
            href="/applications"
            className="text-sm font-medium underline underline-offset-4"
          >
            Return to registry
          </Link>
          <p className="mt-4 text-sm font-medium text-muted-foreground">Application</p>
          <h1 className="text-3xl font-semibold tracking-tight">
            {application.applicationNumber}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={application.status} />
          {application.result ? <ResultBadge result={application.result} /> : null}
        </div>
      </div>

      {actionMessage ? (
        <FeedbackAlert kind="information" title="Review update" message={actionMessage} />
      ) : null}
      {actionError ? (
        <FeedbackAlert
          kind="error"
          title={actionErrorTitle}
          message={actionError}
          actions={
            canStart ? (
              <Button variant="outline" onClick={() => void startReview()} disabled={isStarting}>
                Try again
              </Button>
            ) : undefined
          }
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>
            {application.activeSnapshot ? "Review snapshot" : "Application information"}
          </CardTitle>
          {application.activeSnapshot ? (
            <p className="text-sm text-muted-foreground">
              Snapshot retrieved {formatDateTime(application.activeSnapshot.retrievedAt)}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Source data last synchronized {formatDateTime(application.sourceLastSynchronizedAt)}
            </p>
          )}
        </CardHeader>
        <CardContent>
          <DetailsList data={snapshotData} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Review</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {application.status === "new" ? (
            <>
              <p className="text-muted-foreground">This application has not been claimed for review.</p>
              {canStart ? (
                <Button onClick={() => void startReview()} disabled={isStarting}>
                  {isStarting ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
                  {isStarting ? "Starting review" : "Start review"}
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">You have read-only access.</p>
              )}
            </>
          ) : null}

          {application.status === "under-review" ? (
            <>
              <dl className="grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">Current reviewer</dt>
                  <dd className="mt-1">{application.currentReviewer?.displayName}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">Review started</dt>
                  <dd className="mt-1">
                    {application.activeAssignment
                      ? formatDateTime(application.activeAssignment.startedAt)
                      : "—"}
                  </dd>
                </div>
              </dl>
              <FeedbackAlert
                kind="information"
                title={ownsReview ? "You own this review" : "Review in progress"}
                message={
                  ownsReview
                    ? "You can approve this application after entering a decision comment."
                    : `Only ${application.currentReviewer?.displayName ?? "the current reviewer"} can complete this review.`
                }
              />
              {ownsReview ? (
                <Button
                  onClick={() => {
                    setApprovalError(undefined);
                    setDecisionCommentError(undefined);
                    setApprovalOpen(true);
                  }}
                >
                  Approve
                </Button>
              ) : null}
            </>
          ) : null}

          {application.status === "done" && application.decision ? (
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-sm font-medium text-muted-foreground">Decision</dt>
                <dd className="mt-1"><ResultBadge result={application.decision.result} /></dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">Deciding worker</dt>
                <dd className="mt-1">{application.decision.decidingWorker.displayName}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">Decision time</dt>
                <dd className="mt-1">{formatDateTime(application.decision.decidedAt)}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-sm font-medium text-muted-foreground">Decision comment</dt>
                <dd className="mt-1 whitespace-pre-wrap break-words">{application.decision.comment}</dd>
              </div>
            </dl>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>General comments</CardTitle>
        </CardHeader>
        <CardContent>
          {application.generalComments.length === 0 ? (
            <p className="text-muted-foreground">No general comments.</p>
          ) : (
            <ul className="divide-y">
              {application.generalComments.map((comment) => (
                <li key={comment.id} className="py-4 first:pt-0 last:pb-0">
                  <p className="whitespace-pre-wrap break-words">{comment.text}</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {comment.author.displayName} · {formatDateTime(comment.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {application.status === "done" ? (
        <Button render={<Link href="/applications" />} nativeButton={false}>
          Return to registry
        </Button>
      ) : null}

      <ApprovalDialog
        open={approvalOpen}
        applicationNumber={application.applicationNumber}
        decisionComment={decisionComment}
        fieldError={decisionCommentError}
        error={approvalError}
        isPending={isApproving}
        onOpenChange={setApprovalDialogOpen}
        onDecisionCommentChange={(value) => {
          setDecisionComment(value);
          const trimmedLength = value.trim().length;
          if (trimmedLength > 0 && trimmedLength <= 2_000) {
            setDecisionCommentError(undefined);
          }
          setApprovalError(undefined);
        }}
        onApprove={() => void approveApplication()}
      />
    </section>
  );
}
