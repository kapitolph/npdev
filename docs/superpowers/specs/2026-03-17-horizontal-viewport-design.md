# Horizontal Viewport with Peek Slivers

**Date:** 2026-03-17
**Status:** Approved

## Problem

The npdev dashboard uses three responsive layout modes (wide/normal/narrow) that stack or tab columns based on terminal width. This prevents adding more columns in the future and creates inconsistent navigation patterns across breakpoints.

## Solution

Replace the responsive system with a single horizontal viewport model. All columns are always side-by-side. A sliding window shows as many full columns as fit the terminal, with narrow "peek slivers" of adjacent off-screen columns to indicate scrollability.

## Design

### Column Order

Fixed order: `["sessions", "repos", "team"]`. Empty columns (0 repos, 0 team) are excluded from `availableColumns`.

### Viewport Model

- **Minimum column width**: 38 characters
- **Viewport start**: Index of the first fully-visible column (state: `viewportStart`)
- **Peek sliver width**: 5 characters — shows panel left-border + dimmed/truncated header text
- **Auto-scroll**: When focus moves to a peeked or off-screen column, shift `viewportStart` to fully reveal it

### Viewport Algorithm

```
MIN_COL_WIDTH = 38
PEEK_WIDTH = 5
GAP_WIDTH = 1  // gap between full columns (border-left on each non-first column)

availableWidth = terminalCols - 4  // paddingX={1} on outer box = 2 chars + 2 for breathing room
totalColumns = availableColumns.length

// How many full columns fit with no peeks?
maxFull = Math.floor((availableWidth + GAP_WIDTH) / (MIN_COL_WIDTH + GAP_WIDTH))
visibleFullCount = Math.min(totalColumns, maxFull)

// Determine peek slivers
hasLeftPeek = viewportStart > 0
hasRightPeek = viewportStart + visibleFullCount < totalColumns

// If peeks eat into available space, recompute
peekTotal = (hasLeftPeek ? PEEK_WIDTH : 0) + (hasRightPeek ? PEEK_WIDTH : 0)
usableWidth = availableWidth - peekTotal
visibleFullCount = Math.min(visibleFullCount, Math.floor((usableWidth + GAP_WIDTH) / (MIN_COL_WIDTH + GAP_WIDTH)))

// Re-check peeks after adjustment
hasLeftPeek = viewportStart > 0
hasRightPeek = viewportStart + visibleFullCount < totalColumns

// Final column width — distribute remaining space evenly
peekTotal = (hasLeftPeek ? PEEK_WIDTH : 0) + (hasRightPeek ? PEEK_WIDTH : 0)
usableWidth = availableWidth - peekTotal
columnWidth = Math.floor(usableWidth / visibleFullCount)
```

### Visual Layout

```
┃peek┃  Full Column A  │  Full Column B  │  Full Column C  ┃peek┃
┃ Se ┃  ● testing  ... │  ○ vim          │  datatable ju.. ┃ Ac ┃
```

- Peek slivers are not focusable — purely visual scroll indicators
- Slivers show the column's left border + header text, clipped to PEEK_WIDTH, rendered in dimmed overlay color
- When all columns fit the terminal, no slivers appear

### Navigation

- **Left/Right arrows**: Move focus between columns within `availableColumns`. If target column is outside the visible viewport, shift `viewportStart`. Left at index 0 and right at last index do nothing.
- **Tab**: Cycles through all columns then back to action bar. The `cursorArea` state ("actions" | "sessions") is preserved — Tab moves between the action bar and column focus zones.
- No stacked sections. No tab bar. Sessions and Team are always independent side-by-side columns.

### Chrome Height

With the layout modes removed, chrome height is calculated from terminal rows only:
```
compactLogo = rows < 30
chromeHeight = compactLogo ? 8 : 14
```

### Minimum Terminal Width

If terminal width < MIN_COL_WIDTH (38), show a single column at full terminal width with no peek slivers. This is a degraded mode — the focused column fills the screen.

### Dynamic Column Changes

When columns appear/disappear mid-session (e.g., repos load, team member connects), clamp `viewportStart` to `Math.max(0, Math.min(viewportStart, totalColumns - visibleFullCount))`.

### Components

| File | Change |
|------|--------|
| `useTerminalSize.ts` | Remove `Layout` type, return only `cols`/`rows` |
| `App.tsx` | Single viewport renderer; `viewportStart` state; simplified nav; remove all layout branching |
| `SessionList.tsx` | Remove `layout` prop |
| `SessionRow.tsx` | Remove `layout` prop; remove narrow-mode name truncation (column width handles clipping via `wrap="truncate"`) |
| `TeamSection.tsx` | Remove `layout` prop |
| `RepoList.tsx` | No `layout` prop currently — no change needed |
| `Logo.tsx` | Remove `layout` prop; use only `compact` boolean (derived from `rows < 30`) |
| `Header.tsx` | Remove `layout` prop; pass `compact` to Logo based on rows |
| `TabBar.tsx` | Delete |

### Edge Cases

- **1 column fits**: Full-width with peek slivers on sides if adjacent columns exist
- **All columns fit**: No slivers, behaves like current wide layout
- **Empty columns** (0 repos, 0 team): Not included in `availableColumns`
- **Terminal resize**: Recalculate `visibleFullCount` and clamp `viewportStart`
- **Very narrow terminal** (< 38 cols): Single column, no peeks
