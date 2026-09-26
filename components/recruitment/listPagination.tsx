"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
} from "@/components/ui/pagination";

export const DEFAULT_PAGE_SIZE = 25;

/**
 * Pager for lists that hold their rows in client state.
 *
 * `components/ui/pagination.tsx` ships `PaginationComponent`, but that one
 * navigates with `<a href>`, so it only fits server-rendered lists whose page
 * lives in the URL (the audit log). This one takes an `onPageChange` callback
 * and reuses the same container primitives, so both look identical.
 */
export function ListPagination({
  totalItems,
  pageSize = DEFAULT_PAGE_SIZE,
  currentPage,
  onPageChange,
}: {
  totalItems: number;
  pageSize?: number;
  currentPage: number;
  onPageChange: (page: number) => void;
}) {
  if (totalItems === 0) return null;

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(currentPage, 1), totalPages);
  const start = (safePage - 1) * pageSize + 1;
  const end = Math.min(safePage * pageSize, totalItems);

  const items: Array<{ kind: "page"; page: number } | { kind: "gap"; key: string }> =
    [];
  for (let page = 1; page <= totalPages; page += 1) {
    const distance = Math.abs(page - safePage);
    if (page === 1 || page === totalPages || distance <= 1) {
      items.push({ kind: "page", page });
    } else if (distance === 2) {
      const previous = items.at(-1);
      if (previous?.kind !== "gap") {
        items.push({ kind: "gap", key: `gap-${page}` });
      }
    }
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground tabular-nums">
        显示 {start} - {end}，共 {totalItems} 人
      </p>
      {totalPages > 1 && (
        <Pagination className="mx-0 w-auto justify-end">
          <PaginationContent>
            <PaginationItem>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="上一页"
                disabled={safePage <= 1}
                onClick={() => onPageChange(safePage - 1)}
              >
                <ChevronLeft />
              </Button>
            </PaginationItem>
            {items.map((item) =>
              item.kind === "gap" ? (
                <PaginationItem key={item.key}>
                  <PaginationEllipsis />
                </PaginationItem>
              ) : (
                <PaginationItem key={item.page}>
                  <Button
                    type="button"
                    variant={item.page === safePage ? "outline" : "ghost"}
                    size="icon"
                    aria-label={`第 ${item.page} 页`}
                    aria-current={item.page === safePage ? "page" : undefined}
                    onClick={() => onPageChange(item.page)}
                  >
                    {item.page}
                  </Button>
                </PaginationItem>
              ),
            )}
            <PaginationItem>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="下一页"
                disabled={safePage >= totalPages}
                onClick={() => onPageChange(safePage + 1)}
              >
                <ChevronRight />
              </Button>
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}
