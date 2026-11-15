"use client";

import { Button } from "@/components/ui/button";

interface PaginationControlsProps {
  page: number;
  totalPages: number;
  pageSize: 5 | 10 | 25 | 100;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: 5 | 10 | 25 | 100) => void;
}

type PageItem = number | "ellipsis-start" | "ellipsis-end";

function getVisiblePages(page: number, totalPages: number): PageItem[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  if (page <= 4) {
    return [1, 2, 3, 4, 5, "ellipsis-end", totalPages];
  }

  if (page >= totalPages - 3) {
    return [
      1,
      "ellipsis-start",
      totalPages - 4,
      totalPages - 3,
      totalPages - 2,
      totalPages - 1,
      totalPages,
    ];
  }

  return [
    1,
    "ellipsis-start",
    page - 1,
    page,
    page + 1,
    "ellipsis-end",
    totalPages,
  ];
}

export function PaginationControls({
  page,
  totalPages,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: PaginationControlsProps) {
  const visiblePages = getVisiblePages(page, totalPages);

  return (
    <nav
      className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      aria-label="Applications pagination"
    >
      <label className="flex items-center gap-2 text-sm">
        Applications per page
        <select
          value={pageSize}
          onChange={(event) =>
            onPageSizeChange(Number(event.target.value) as 5 | 10 | 25 | 100)
          }
          className="h-8 rounded-lg border bg-background px-2 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {[5, 10, 25, 100].map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>

      <div className="flex items-center justify-between gap-3 sm:justify-end">
        <Button
          variant="outline"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>

        <div className="hidden items-center gap-1 sm:flex">
          {visiblePages.map((item) =>
            typeof item === "number" ? (
              <Button
                key={item}
                variant={item === page ? "default" : "outline"}
                size="icon-sm"
                aria-label={`Page ${item}`}
                aria-current={item === page ? "page" : undefined}
                onClick={() => onPageChange(item)}
              >
                {item}
              </Button>
            ) : (
              <span key={item} className="px-1 text-muted-foreground" aria-hidden="true">
                …
              </span>
            ),
          )}
        </div>

        <span className="text-sm sm:hidden" aria-live="polite">
          Page {page} of {totalPages}
        </span>
        <Button
          variant="outline"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </nav>
  );
}
