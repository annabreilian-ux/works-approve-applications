import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { ResultBadge, StatusBadge } from "@/components/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ApplicationSummary } from "@/lib/domain/types";

export function ApplicationRegistry({
  applications,
}: {
  applications: ApplicationSummary[];
}) {
  if (applications.length === 0) {
    return <EmptyState />;
  }

  return (
    <>
      <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Application</TableHead>
              <TableHead>Work type</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Current reviewer</TableHead>
              <TableHead>Result</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {applications.map((application) => (
              <TableRow key={application.id}>
                <TableCell className="font-medium">
                  {application.applicationNumber}
                </TableCell>
                <TableCell>{application.workType}</TableCell>
                <TableCell>{application.location}</TableCell>
                <TableCell>
                  <StatusBadge status={application.status} />
                </TableCell>
                <TableCell>{application.currentReviewerName ?? "—"}</TableCell>
                <TableCell>
                  {application.result ? (
                    <ResultBadge result={application.result} />
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Link
                    href={`/applications/${application.id}`}
                    className="font-medium underline underline-offset-4"
                  >
                    Open
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="grid gap-4 md:hidden">
        {applications.map((application) => (
          <article key={application.id} className="rounded-xl border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{application.applicationNumber}</p>
                <p className="text-sm text-muted-foreground">
                  {application.workType}
                </p>
              </div>
              <StatusBadge status={application.status} />
            </div>
            <dl className="mt-4 grid gap-2 text-sm">
              <div>
                <dt className="text-muted-foreground">Location</dt>
                <dd>{application.location}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Current reviewer</dt>
                <dd>{application.currentReviewerName ?? "—"}</dd>
              </div>
              {application.result ? (
                <div>
                  <dt className="text-muted-foreground">Result</dt>
                  <dd className="mt-1">
                    <ResultBadge result={application.result} />
                  </dd>
                </div>
              ) : null}
            </dl>
            <Link
              href={`/applications/${application.id}`}
              className="mt-4 inline-flex font-medium underline underline-offset-4"
            >
              Open application
            </Link>
          </article>
        ))}
      </div>
    </>
  );
}
