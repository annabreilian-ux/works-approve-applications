"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { ApplicationRegistry } from "@/components/application-registry";
import { FeedbackAlert } from "@/components/feedback-alert";
import { PaginationControls } from "@/components/pagination-controls";
import { RegistrySkeleton } from "@/components/loading-states";
import { Button } from "@/components/ui/button";
import type { ApplicationSummary, PageResult } from "@/lib/domain/types";
import { applicationService } from "@/lib/services/http-application-service";

type PageSize = 5 | 10 | 25 | 100;

export function RegistryScreen() {
  const pathname = usePathname();
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(10);
  const [result, setResult] = useState<PageResult<ApplicationSummary>>();
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState<string>();
  const [refreshError, setRefreshError] = useState<string>();

  const redirectIfSessionExpired = useCallback((code: string): boolean => {
    if (code !== "session-expired") {
      return false;
    }

    router.replace(
      `/sign-in?reason=session-expired&returnTo=${encodeURIComponent(pathname)}`,
    );
    return true;
  }, [pathname, router]);

  async function loadApplications({ silent = false }: { silent?: boolean } = {}) {
    if (!silent) setIsLoading(true);

    const response = await applicationService.listApplications({
      page,
      pageSize,
    });

    if (response.ok) {
      setResult(response.data);
      setPageError(undefined);
      setRefreshError(undefined);
    } else if (redirectIfSessionExpired(response.error.code)) {
      return;
    } else if (silent) {
      setRefreshError(
        "The latest changes could not be loaded. The last confirmed data is still shown.",
      );
    } else {
      setPageError(response.error.message);
    }

    if (!silent) setIsLoading(false);
  }

  useEffect(() => {
    let cancelled = false;

    void applicationService.listApplications({ page, pageSize }).then((response) => {
      if (cancelled) return;

      if (response.ok) {
        setResult(response.data);
        setPageError(undefined);
        setRefreshError(undefined);
      } else {
        if (redirectIfSessionExpired(response.error.code)) return;
        setPageError(response.error.message);
      }
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [page, pageSize, redirectIfSessionExpired]);

  useEffect(() => {
    const refreshTimer = window.setInterval(() => {
      void applicationService
        .listApplications({ page, pageSize })
        .then((response) => {
          if (response.ok) {
            setResult(response.data);
            setRefreshError(undefined);
          } else {
            if (redirectIfSessionExpired(response.error.code)) return;
            setRefreshError(
              "The latest changes could not be loaded. The last confirmed data is still shown.",
            );
          }
        });
    }, 15_000);

    return () => window.clearInterval(refreshTimer);
  }, [page, pageSize, redirectIfSessionExpired]);

  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm font-medium text-muted-foreground">Registry</p>
        <h1 className="text-3xl font-semibold tracking-tight">Applications</h1>
      </div>

      {refreshError ? (
        <FeedbackAlert
          kind="warning"
          title="Data may be out of date"
          message={refreshError}
          actions={
            <Button variant="outline" onClick={() => void loadApplications()}>
              Try again
            </Button>
          }
        />
      ) : null}

      {pageError ? (
        <FeedbackAlert
          kind="error"
          title="Applications could not be loaded"
          message={pageError}
          actions={
            <Button variant="outline" onClick={() => void loadApplications()}>
              Try again
            </Button>
          }
        />
      ) : null}

      {isLoading ? <RegistrySkeleton rows={pageSize > 10 ? 10 : pageSize} /> : null}

      {!isLoading && !pageError && result ? (
        <>
          <p className="text-sm text-muted-foreground">
            {result.totalItems} applications
          </p>
          <ApplicationRegistry applications={result.items} />
          <PaginationControls
            page={result.page}
            pageSize={result.pageSize as PageSize}
            totalPages={result.totalPages}
            onPageChange={(nextPage) => {
              setIsLoading(true);
              setPage(nextPage);
            }}
            onPageSizeChange={(nextPageSize) => {
              setIsLoading(true);
              setPage(1);
              setPageSize(nextPageSize);
            }}
          />
        </>
      ) : null}
    </section>
  );
}
