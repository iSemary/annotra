"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export interface PaginationProps {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
  className?: string
  /** Enables “Showing X–Y of Z” (including single-page and empty lists). */
  totalItems?: number
  pageSize?: number
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  className,
  totalItems,
  pageSize,
}: PaginationProps) {
  const getPageNumbers = () => {
    const pages: (number | string)[] = []
    const maxVisible = 7

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i)
      }
    } else {
      if (currentPage <= 3) {
        for (let i = 1; i <= 4; i++) {
          pages.push(i)
        }
        pages.push("ellipsis")
        pages.push(totalPages)
      } else if (currentPage >= totalPages - 2) {
        pages.push(1)
        pages.push("ellipsis")
        for (let i = totalPages - 3; i <= totalPages; i++) {
          pages.push(i)
        }
      } else {
        pages.push(1)
        pages.push("ellipsis")
        for (let i = currentPage - 1; i <= currentPage + 1; i++) {
          pages.push(i)
        }
        pages.push("ellipsis")
        pages.push(totalPages)
      }
    }

    return pages
  }

  const summary =
    totalItems !== undefined && pageSize !== undefined
      ? totalItems === 0 || totalPages === 0
        ? "No records"
        : `Showing ${(currentPage - 1) * pageSize + 1}–${Math.min(
            currentPage * pageSize,
            totalItems,
          )} of ${totalItems}`
      : null

  const showPageButtons = totalPages > 1

  if (!summary && !showPageButtons) {
    return null
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 border-t border-border pt-4 mt-4",
        className,
      )}
    >
      {summary && (
        <p className="text-xs text-muted-foreground tabular-nums">{summary}</p>
      )}
      {showPageButtons && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="sr-only">Previous page</span>
          </Button>

          {getPageNumbers().map((page, index) => {
            if (page === "ellipsis") {
              return (
                <Button
                  key={`ellipsis-${index}`}
                  variant="ghost"
                  size="sm"
                  disabled
                >
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">More pages</span>
                </Button>
              )
            }

            const pageNum = page as number
            return (
              <Button
                key={pageNum}
                variant={currentPage === pageNum ? "default" : "outline"}
                size="sm"
                onClick={() => onPageChange(pageNum)}
              >
                {pageNum}
              </Button>
            )
          })}

          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            <ChevronRight className="h-4 w-4" />
            <span className="sr-only">Next page</span>
          </Button>
        </div>
      )}
    </div>
  )
}
