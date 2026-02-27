# Yoink Architecture

## Overview

Yoink is a CLI tool that fetches Linear issues and processes them with Claude Code — creating worktrees, implementing fixes, and opening PRs. Built with Bun + TypeScript, React + Ink for the terminal UI.

The architecture separates **orchestration** from **rendering**: a headless `YoinkEngine` owns all business logic and emits state events, while the UIs are thin subscribers. Both the Ink terminal UI and the web dashboard consume the same engine state — the TUI via direct event subscription, the web dashboard via an HTTP/WebSocket server that bridges engine events to browser clients.

## High-Level Architecture

```
┌──────────────────────────────────────────────────────────┐
│                     CLI Entry Point                      │
│                    bin/yoink.ts → src/index.tsx          │
│                                                          │
│  Parses args, loads config, creates engine, renders UI   │
│  Starts HTTP/WS server, optionally starts Vite dev       │
└──────────────────────┬───────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────┐
│                     YoinkEngine                          │
│                   src/engine/                            │
│                                                          │
│  Typed EventEmitter that owns all orchestration.         │
│  Can run headless — no UI dependency.                    │
│                                                          │
│  ┌────────────┐ ┌──────────────┐ ┌────────────────────┐  │
│  │ Linear     │ │ Worktree     │ │ Claude Process     │  │
│  │ Poller     │ │ Manager      │ │ Manager            │  │
│  │            │ │              │ │ (spawn/stop/resume)│  │
│  └─────┬──────┘ └──────┬───────┘ └──────────┬─────────┘  │
│        │               │                    │            │
│  ┌─────┴───────────────┴────────────────────┴─────────┐  │
│  │                  Processor                         │  │
│  │  Queue management, concurrency control, state      │  │
│  │  persistence, issue lifecycle (retry/continue/     │  │
│  │  stop/delete), PR review orchestration             │  │
│  └────────────────────┬───────────────────────────────┘  │
│                       │                                  │
│              emits 'state:changed'                       │
└───────────────────────┼──────────────────────────────────┘
                        │
              ┌─────────┼──────────┐
              ▼         │          ▼
┌──────────────────┐    │   ┌──────────────────────────┐
│ Ink Terminal UI  │    │   │  HTTP + WebSocket Server │
│ src/app.tsx      │    │   │  src/server/server.ts    │
│ src/components/  │    │   │                          │
│                  │    │   │  REST: /api/state,       │
│ Subscribes to    │    │   │        /api/actions      │
│ engine events,   │    │   │  WS:   /ws (real-time)   │
│ renders TUI      │    │   │  Static: web/dist/       │
└──────────────────┘    │   └────────────┬─────────────┘
                        │                │
                        │                ▼
                        │   ┌──────────────────────────┐
                        │   │  Web Dashboard           │
                        │   │  web/src/                │
                        │   │                          │
                        │   │  React + Vite + Tailwind │
                        │   │  Connects via WebSocket  │
                        │   │  Light/dark theme        │
                        │   └──────────────────────────┘
```

## Project Structure

```
bin/
  yoink.ts                    Executable entry point (shebang → bun)

src/
  index.tsx                   CLI setup (meow), config loading, engine creation,
                              signal handlers, Ink render
  app.tsx                     React component — calls engine.start(), renders Dashboard
  types.ts                    Shared types: TrackedIssue, Config, IssueStatus, etc.
  config.ts                   TOML config loading from ~/.config/yoink/config.toml

  engine/
    YoinkEngine.ts            Core engine — wraps Processor, handles init (issue loading,
                              history merge), exposes typed EventEmitter API with
                              getState(), lifecycle methods, issue actions
    types.ts                  YoinkState, YoinkEngineOptions, YoinkEngineEvents
    index.ts                  Barrel export

  services/
    processor.ts              Queue management, concurrency control, issue processing
                              pipeline (worktree → claude → PR), polling, state
                              persistence, retry/continue/stop/delete/reviewPR
    claude.ts                 Claude CLI spawning (fresh + resume), prompt building,
                              stderr streaming, PR URL extraction, superpowers plugin
                              resolution
    linear.ts                 Linear GraphQL API — fetch issues, update state, add comments
    state.ts                  JSON state persistence (~/.config/yoink/state.json),
                              pruning (24h TTL)

  components/
    Dashboard.tsx             Main TUI — subscribes to engine state:changed events,
                              keyboard input (j/k/enter/s/r/c/d/v/p/q), issue list
                              with history section, review mode
    IssueRow.tsx              Single issue row — status icon, identifier, title, timing
    LogPanel.tsx              Expandable log viewer — Claude output, action hints,
                              resume commands
    StatusBar.tsx             Bottom bar — active/queued/done counts, elapsed time,
                              poll countdown, keyboard shortcuts
    SetupWizard.tsx           Interactive first-run config wizard (Ink + ink-text-input)
    InitOverwrite.tsx         Overwrite confirmation for `yoink init` with existing config

  lib/
    git.ts                    Git worktree create/remove, branch cleanup, review worktrees
    github.ts                 GitHub CLI wrapper for PR creation
    pr.ts                     PR URL parsing, metadata fetching via GitHub CLI
    shell.ts                  splitCommand() — whitespace splitting with tilde expansion
    pidlock.ts                PID-based single-instance lock (~/.config/yoink/yoink.pid)

  server/
    server.ts                 HTTP + WebSocket server (Bun.serve) — REST API, real-time
                              state push, static file serving, action dispatch
    server.test.ts            Server tests (HTTP endpoints, WebSocket protocol)

web/
  index.html                  SPA entry point with theme-init script (prevents flash)
  vite.config.ts              Vite config with proxy to yoink server on port 7890
  src/
    App.tsx                   Root component — state, theme, routing to sub-components
    hooks/
      useYoinkState.ts        WebSocket hook — connects to /ws, receives state snapshots,
                              dispatches actions, auto-reconnects with backoff
      useTheme.ts             OS-preference-aware light/dark theme with localStorage persist
    components/
      TopBar.tsx              Header — project title, active/done counts, pause toggle,
                              theme toggle (sun/moon)
      Toolbar.tsx             Action bar — "Review PR" button
      IssueTable.tsx          Issue list with column headers, expandable detail panel
      IssueRow.tsx            Single issue row — identifier link, title, status pill, time,
                              action buttons (stop/retry/continue/delete) with hover reveal
      StatusPill.tsx          Colored status badge with pulse animation for running items
      DetailPanel.tsx         Expanded issue details — branch, PR link, elapsed time,
                              Linear link, error banner, resume command with open/copy,
                              log viewer
      LogViewer.tsx           ANSI-rendered log output with auto-scroll
      PRReviewModal.tsx       Modal for submitting PR review requests
      Footer.tsx              Connection status indicator, issue count
    lib/
      formatElapsed.ts        Human-readable elapsed time formatting
      statusMap.ts            Maps engine statuses to display labels, colors, badge styles

skills/
  workflow/SKILL.md           End-to-end Linear issue flow (understand → implement →
                              review → commit → PR)
  review/SKILL.md             PR code review — dispatch superpowers code-reviewer,
                              post comment
  quality-gates/SKILL.md      Pre-commit checklist (tests, lint, diff review, scope)
  standards/SKILL.md          Engineering principles (small changes, follow patterns)

.claude-plugin/
  plugin.json                 Plugin metadata — loaded via --plugin-dir when spawning
                              Claude instances
```

## Engine Architecture

### YoinkEngine

The engine is the central orchestration layer. It wraps `Processor` (composition) and adds:

- **Initialization**: Config-driven issue loading, history merging, project resolution
- **Typed EventEmitter**: Emits `state:changed` with full `YoinkState` snapshots
- **Clean API**: `start()`, `pause()`, `resume()`, `shutdown()`, `destroy()`, plus issue action methods

```typescript
// Engine can run headless — no React/Ink dependency
const engine = new YoinkEngine(config, { projectName: 'myproject' });
engine.on('state:changed', (state) => console.log(state));
await engine.start();
```

### YoinkState

A single snapshot object containing everything a UI needs to render:

```typescript
interface YoinkState {
  issues: TrackedIssue[];    // all issues (history + active)
  paused: boolean;
  polling: boolean;
  done: boolean;
  dryRun: boolean;
  title: string;
  nextPollAt: number | null;
}
```

### Processor

Internal to the engine. Handles the mechanics:

- **Queue**: Processes issues up to configured concurrency
- **Pipeline**: `queued → creating-worktree → running-claude → pr-created`
- **Polling**: Periodic Linear API checks for new issues
- **Actions**: stop (kill process), retry (clean + restart), continue (resume session), delete (abandon + cleanup)
- **State persistence**: Saves to `~/.config/yoink/state.json` on every status change

## Data Flow

### Issue Processing

```
Linear API → fetchIssues() → TrackedIssue[] (queued)
  → createWorktree() → update Linear state to "In Progress"
  → spawnClaude() with prompt + plugins → stream stderr logs
  → parse stdout for PR URL + session ID
  → update Linear state to "In Review", add PR comment
  → removeWorktree() cleanup
```

### Event Flow

```
Processor mutates TrackedIssue → emits ProcessorEvent
  → YoinkEngine listener → emits 'state:changed' with YoinkState snapshot
    → Dashboard setState → React re-render
```

### Web Dashboard

The web dashboard is an alternative UI that runs alongside the terminal UI. It connects to the same engine via an HTTP/WebSocket server.

**Server** (`src/server/server.ts`):
- `GET /api/state` — returns current `YoinkState` as JSON
- `POST /api/actions` — dispatches actions (pause, resume, shutdown, stopIssue, retryIssue, continueIssue, deleteIssue, reviewPR, openTerminal)
- `GET /ws` — WebSocket endpoint; sends `state:full` on connect, `state:changed` on updates; accepts action messages from clients
- Static file serving from `web/dist/` with SPA fallback

**Client** (`web/src/`):
- React + Vite + Tailwind CSS 4
- `useYoinkState` hook manages the WebSocket connection with auto-reconnect and exposes `dispatch()` for sending actions
- `useTheme` hook provides OS-preference-aware light/dark mode with localStorage persistence and manual toggle
- CSS custom properties define all theme colors (`:root` for light, `.dark` for dark); an inline script in `index.html` prevents flash of wrong theme on load
- All issue actions (stop, retry, continue, delete, review PR) are available through the UI
- Resume commands include an "open" button that spawns a new terminal tab on the server (iTerm2 > Terminal.app on macOS; gnome-terminal/konsole/xfce4-terminal/xterm on Linux)

**Development**: Run `yoink --dev` to start the Vite dev server with HMR on port 5173, proxying API/WS requests to the yoink server on port 7890. In production, `web/dist/` is built ahead of time and served directly by the Bun HTTP server.

### PR Review Flow

```
User presses 'v' → enters PR URL/number
  → engine.reviewPR() → fetchPRMetadata() via GitHub CLI
  → createReviewWorktree() on PR branch
  → spawnClaude() with review prompt + superpowers plugin
  → Claude posts review comment via GitHub CLI
  → removeWorktree() cleanup
```

## Issue Status Flow

```
queued → creating-worktree → running-claude → pr-created
                                            → failed  → retry | continue | abandoned
                                            → stopped → retry | continue | abandoned

PR reviews:
creating-worktree → reviewing → review-posted
                              → failed
```

## Plugin System

Yoink is itself a Claude Code plugin. When spawning Claude instances, it passes two `--plugin-dir` flags:

1. **Yoink root** — provides workflow, review, quality-gates, and standards skills
2. **Superpowers** (auto-installed) — provides TDD, debugging, and code review skills

The spawned Claude instances auto-discover skills from these plugin directories. The prompt tells Claude to follow the `yoink-workflow` skill, which orchestrates the entire implementation flow.

## Configuration

Config lives at `~/.config/yoink/config.toml` (TOML via `smol-toml`). Key sections:

- `[defaults]` — concurrency, maxTurns, pollInterval
- `[linear]` — API key
- `[projects.<name>]` — repo dir, base branch, Linear team/assignee/label, GitHub CLI command, allowed tools

Environment variables (`YOINK_LINEAR_API_KEY`, etc.) override config values.

## Conventions

- **Subprocess spawning**: `Bun.spawn()` with `stdout: 'pipe', stderr: 'pipe'`, `await proc.exited` for exit codes
- **Worktree paths**: `../<reponame>-<identifier>/` (reviews: `../<reponame>-pr-<number>/`)
- **Branch names**: `linear/<identifier-lowercase>`
- **Error handling**: External API calls are `.catch(() => {})` wrapped to avoid crashing the pipeline
- **State mutations**: Always through `Processor.updateIssue()` which auto-persists
- **GitHub CLI**: Use `splitCommand()` for the configured `githubCommand` to support multi-word commands (e.g., proxychains wrappers)
