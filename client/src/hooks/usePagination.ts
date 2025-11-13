import { useState, useMemo, useEffect } from "react";

interface UsePaginationOptions {
  totalItems: number;
  initialPageSize?: number;
  storageKey?: string; // Optional localStorage key for persisting page size
}

interface UsePaginationReturn<T> {
  currentPage: number;
  pageSize: number;
  totalPages: number;
  setCurrentPage: (page: number) => void;
  setPageSize: (size: number) => void;
  paginateItems: (items: T[]) => T[];
  itemRange: { start: number; end: number };
  goToFirstPage: () => void;
  goToLastPage: () => void;
  goToNextPage: () => void;
  goToPreviousPage: () => void;
}

export function usePagination<T = any>({
  totalItems,
  initialPageSize = 10,
  storageKey,
}: UsePaginationOptions): UsePaginationReturn<T> {
  // Load page size from localStorage if storageKey is provided
  const getInitialPageSize = () => {
    if (storageKey) {
      const stored = localStorage.getItem(`pagination_${storageKey}`);
      if (stored) {
        const parsed = parseInt(stored, 10);
        if (!isNaN(parsed) && parsed > 0) return parsed;
      }
    }
    return initialPageSize;
  };

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(getInitialPageSize);

  // Calculate total pages
  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(totalItems / pageSize));
  }, [totalItems, pageSize]);

  // Clamp current page when data changes or page size changes
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  // Set page size and persist to localStorage
  const setPageSize = (size: number) => {
    setPageSizeState(size);
    setCurrentPage(1); // Reset to first page when changing page size
    if (storageKey) {
      localStorage.setItem(`pagination_${storageKey}`, size.toString());
    }
  };

  // Paginate items
  const paginateItems = (items: T[]): T[] => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return items.slice(startIndex, endIndex);
  };

  // Calculate item range for display
  const itemRange = useMemo(() => {
    const start = Math.min((currentPage - 1) * pageSize + 1, totalItems);
    const end = Math.min(currentPage * pageSize, totalItems);
    return { start, end };
  }, [currentPage, pageSize, totalItems]);

  // Navigation helpers
  const goToFirstPage = () => setCurrentPage(1);
  const goToLastPage = () => setCurrentPage(totalPages);
  const goToNextPage = () => setCurrentPage(Math.min(currentPage + 1, totalPages));
  const goToPreviousPage = () => setCurrentPage(Math.max(currentPage - 1, 1));

  return {
    currentPage,
    pageSize,
    totalPages,
    setCurrentPage,
    setPageSize,
    paginateItems,
    itemRange,
    goToFirstPage,
    goToLastPage,
    goToNextPage,
    goToPreviousPage,
  };
}
