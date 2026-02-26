# Yoink Architecture

## Overview

Yoink is a CLI tool that fetches Linear issues and processes them with Claude Code — creating worktrees, implementing fixes, and opening PRs. Built with Bun + TypeScript, React + Ink for the terminal UI.

The architecture separates **orchestration** from **rendering**: a headless `YoinkEngine` owns all business logic and emits state events, while the Ink terminal UI is a thin subscriber. This enables future UI targets (web dashboard, API) without changing the core engine.

## High-Level Architecture

```
┌──────────────────────────────────────────────────────────┐
│                     CLI Entry Point                      │
│                    bin/yoink.ts → src/index.tsx          │
│                                                          │
│  Parses args, loads config, creates engine, renders UI   │
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
              ┌─────────┴──────────┐
              ▼                    ▼
┌──────────────────────┐  ┌────────────────────┐
│  Ink Terminal UI     │  │  (Future: Web UI,  │
│  src/app.tsx         │  │   HTTP/WS server)  │
│  src/components/     │  │                    │
│                      │  │                    │
│  Subscribes to       │  │                    │
│  engine events,      │  │                    │
│  renders dashboard   │  │                    │
└──────────────────────┘  └────────────────────┘
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
