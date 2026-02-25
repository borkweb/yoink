# Stop & Resume Design

## Overview

Add the ability to stop a running ticket and show a copy-paste `claude --resume` command for any finished ticket so the user can work on it interactively.

## Changes

### 1. New `stopped` Status

Add `stopped` to `IssueStatus` in `types.ts`. Visually distinct from `failed` (yellow, stop icon) to indicate intentional user action. Supports the same actions as `failed`: retry, continue, delete.

### 2. Processor.stopIssue()

New method on `Processor`:

1. Find the tracked issue (must be in `running-claude`, `creating-worktree`, or `pushing`)
2. Set status to `stopped` *before* killing (prevents catch block from overwriting to `failed`)
3. Kill the process via `proc.kill()` using `activeProcesses` map
4. The catch blocks in `processIssue`/`resumeIssue` check if status is already `stopped` and skip overwriting

Also update `retryIssue`, `continueIssue`, `deleteIssue` to accept `stopped` status in addition to `failed`.

### 3. Dashboard Keybinding

`s` key stops the focused issue if it's in an active state. `r`, `c`, `d` actions work on both `failed` and `stopped` issues.

### 4. LogPanel Resume Hint

For all terminal statuses (`pr-created`, `failed`, `stopped`, `abandoned`) when a `sessionId` exists, show:

```
┃ Resume: cd /path/to/worktree && claude --resume <sessionId>
```

### 5. IssueRow Display

```
stopped: { icon: '⏹', color: 'yellow', label: 'Stopped', spinning: false }
```

### 6. StatusBar

Add stopped count and `[s] stop` to help text.
