# Phase 3: Web UI Design

## Overview

React + Vite web dashboard that connects to yoink's Phase 2 server via WebSocket for real-time state and commands. Runs alongside the Ink TUI — open `http://localhost:5173` (dev) while yoink runs in the terminal.

## Decisions

- **Framework:** React + Vite + TypeScript
- **Styling:** Tailwind CSS v4 (direct utility classes, arbitrary values for mockup colors)
- **Log rendering:** `ansi-to-html` for ANSI escape codes in Claude output
- **Layout:** Single-column issue list with inline detail expansion (per mockup)
- **Turns column:** Skipped for now — engine doesn't track turn count
- **Project selector:** Skipped for now — show all issues in one flat list
- **State management:** `useYoinkState` hook + props, no library
- **Optimistic updates:** None — wait for server state:changed round-trip

## Directory Structure

```
web/
  index.html
  vite.config.ts
  src/
    main.tsx
    App.tsx
    hooks/
      useYoinkState.ts
    components/
      TopBar.tsx
      Toolbar.tsx
      IssueTable.tsx
      IssueRow.tsx
      DetailPanel.tsx
      LogViewer.tsx
      StatusPill.tsx
      PRReviewModal.tsx
      Footer.tsx
    lib/
      statusMap.ts          # mapStatus() — 10 engine statuses → 5 display statuses
      formatElapsed.ts      # elapsed time formatter
```

## Components

| Component | Responsibility |
|-----------|---------------|
| `App` | Calls `useYoinkState`, passes state down. Shows "Connecting..." when null. |
| `TopBar` | Yoink logo, status counts (running/done/failed/queued), polling indicator. |
| `Toolbar` | Pause/Resume button, Review PR button. |
| `IssueTable` | Column headers + IssueRow list. Manages selected issue state. |
| `IssueRow` | Priority icon, ID, title, StatusPill, elapsed time, action buttons. |
| `DetailPanel` | Expands below selected row — metadata, error, resume cmd, LogViewer. |
| `LogViewer` | Renders logs with ansi-to-html. Auto-scrolls to bottom. |
| `StatusPill` | Colored badge with pulsing dot for running. |
| `PRReviewModal` | Overlay with URL input, dispatches reviewPR. |
| `Footer` | Fixed bottom — WS connection status, issue count, poll timer. |

## Status Mapping

| Engine status | Display status |
|---|---|
| `queued` | queued |
| `creating-worktree`, `running-claude`, `pushing` | running |
| `pr-created`, `review-posted` | completed |
| `failed` | failed |
| `stopped` | stopped |
| `reviewing` | running |
| `abandoned` | — (hidden) |

## TrackedIssue → Mockup Field Mapping

| Mockup | Source |
|---|---|
| id | `issue.identifier` |
| title | `issue.title` |
| status | `mapStatus(status)` |
| priority | `issue.priority` (1-4) |
| elapsed | `(completedAt ?? now) - startedAt` |
| branch | derived from worktreeDir |
| prUrl, prNumber | direct |
| error | direct |
| resumeCmd | `claude --resume ${sessionId}` |
| logs | `logs[]` through ansi-to-html |
| linearUrl | `issue.url` |

## useYoinkState Hook

```typescript
function useYoinkState(url?: string): {
  state: YoinkState | null;
  connected: boolean;
  dispatch: (action: string, params?: Record<string, unknown>) => void;
}
```

- Connects to `/ws`, receives `state:full` then `state:changed` events
- `dispatch()` sends JSON commands over the same WebSocket
- Reconnects with exponential backoff (1s, 2s, 4s, max 10s)
- No optimistic updates — waits for server round-trip

## Vite Dev Config

- Proxy `/api/*` → `http://localhost:7890`
- Proxy `/ws` → `ws://localhost:7890` (WebSocket upgrade)
- Dev workflow: run yoink in one terminal, `cd web && bunx vite` in another

## Visual Reference

See `docs/plans/yoink-dashboard-mockup.jsx` for the full mockup with colors, layout, and interactions.
