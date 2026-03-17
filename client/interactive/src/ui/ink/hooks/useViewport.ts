import { useCallback, useState, useEffect } from "react";

const MIN_COL_WIDTH = 38;
const PEEK_WIDTH = 5;

export interface ViewportState {
  /** Index of first fully-visible column */
  viewportStart: number;
  /** Number of fully-visible columns */
  visibleFullCount: number;
  /** Computed width for each full column */
  columnWidth: number;
  /** Whether there's a peek sliver on the left */
  hasLeftPeek: boolean;
  /** Whether there's a peek sliver on the right */
  hasRightPeek: boolean;
  /** Shift viewport to ensure a column index is fully visible */
  ensureVisible: (columnIndex: number) => void;
}

export function useViewport(cols: number, totalColumns: number): ViewportState {
  const [viewportStart, setViewportStart] = useState(0);

  const availableWidth = Math.max(MIN_COL_WIDTH, cols - 4);

  // How many full columns fit without peeks?
  let maxFull = Math.max(1, Math.floor(availableWidth / MIN_COL_WIDTH));
  let visibleFullCount = Math.min(totalColumns, maxFull);

  // Clamp viewportStart
  const clampedStart = Math.max(0, Math.min(viewportStart, totalColumns - visibleFullCount));

  // Determine peek slivers
  let hasLeftPeek = clampedStart > 0;
  let hasRightPeek = clampedStart + visibleFullCount < totalColumns;

  // If peeks eat into available space, recompute
  const peekTotal = (hasLeftPeek ? PEEK_WIDTH : 0) + (hasRightPeek ? PEEK_WIDTH : 0);
  if (peekTotal > 0) {
    const usableWidth = availableWidth - peekTotal;
    const adjusted = Math.max(1, Math.floor(usableWidth / MIN_COL_WIDTH));
    visibleFullCount = Math.min(visibleFullCount, adjusted);

    // Re-check peeks after adjustment
    hasLeftPeek = clampedStart > 0;
    hasRightPeek = clampedStart + visibleFullCount < totalColumns;
  }

  // Final column width — distribute remaining space evenly
  const finalPeekTotal = (hasLeftPeek ? PEEK_WIDTH : 0) + (hasRightPeek ? PEEK_WIDTH : 0);
  const usableWidth = availableWidth - finalPeekTotal;
  const columnWidth = Math.max(MIN_COL_WIDTH, Math.floor(usableWidth / visibleFullCount));

  // Clamp viewportStart when totalColumns changes
  useEffect(() => {
    setViewportStart((prev) => {
      const max = Math.max(0, totalColumns - visibleFullCount);
      return Math.min(prev, max);
    });
  }, [totalColumns, visibleFullCount]);

  const ensureVisible = useCallback(
    (columnIndex: number) => {
      setViewportStart((prev) => {
        // If column is before the viewport, shift left
        if (columnIndex < prev) return columnIndex;
        // If column is past the viewport, shift right
        if (columnIndex >= prev + visibleFullCount) return columnIndex - visibleFullCount + 1;
        return prev;
      });
    },
    [visibleFullCount],
  );

  return {
    viewportStart: clampedStart,
    visibleFullCount,
    columnWidth,
    hasLeftPeek,
    hasRightPeek,
    ensureVisible,
  };
}

export { PEEK_WIDTH };
