# CLAUDE.md

## Project Overview

**yoink** — a CLI tool that fetches Linear issues and processes them with Claude Code, creating worktrees, implementing fixes, and opening PRs. Built with Bun + TypeScript, React + Ink for the terminal UI.

## Tech Stack

- **Runtime**: Bun
- **Language**: TypeScript (strict)
- **UI**: React 18 + Ink 5 (terminal), React + Vite + Tailwind (web dashboard)
- **Config**: TOML via `smol-toml`
- **CLI**: `meow`
- **Testing**: `bun test` (built-in test runner)
- **Plugin dependency**: [superpowers](https://github.com/obra/superpowers) — resolved from `~/.claude/plugins/cache/` at runtime, auto-installed if missing. Provides TDD, debugging, and code review skills to spawned Claude instances (passed as a second `--plugin-dir`).

## Project Structure

```
bin/yoink.ts              CLI entry point (executable)
.claude-plugin/
  plugin.json              plugin metadata (loaded via --plugin-dir)
skills/
  workflow/                end-to-end Linear issue flow (understand → implement → review → PR)
  review/                  PR code review workflow (dispatch superpowers code-reviewer, post comment)
  quality-gates/           pre-commit checklist (tests, lint, diff review, scope)
  standards/               engineering principles (small changes, follow patterns)
src/
  index.tsx               meow CLI setup, renders App (or SetupWizard if no config)
  app.tsx                 App component (initialization, history loading)
  types.ts                shared types (TrackedIssue, Config, etc.)
  config.ts               TOML config loading from ~/.config/yoink/config.toml
  engine/
    YoinkEngine.ts         headless orchestration engine (EventEmitter, owns all state)
    types.ts               YoinkState, YoinkEngineOptions, YoinkEngineEvents
  server/
    server.ts              HTTP + WebSocket server (Bun.serve), REST API + real-time state
  components/
    SetupWizard.tsx        interactive first-run config wizard (Ink + ink-text-input)
    InitOverwrite.tsx      overwrite confirmation when running `yoink init` with existing config
    Dashboard.tsx          main TUI — issue list, keyboard input, sections
    IssueRow.tsx           single issue row with status icon and timing
    LogPanel.tsx           expandable log viewer with action hints and resume commands
    StatusBar.tsx          bottom bar with counts, elapsed time, help
  services/
    processor.ts           core orchestration — queue, concurrency, stop/retry/continue/delete
    claude.ts              Claude CLI spawning, prompt building, output parsing, superpowers plugin resolution
    linear.ts              Linear GraphQL API client
    state.ts               JSON state persistence (~/.config/yoink/state.json)
  lib/
    git.ts                 git worktree create/remove, branch cleanup, review worktree helpers
    pr.ts                  PR URL parsing and metadata fetching via GitHub CLI
    github.ts              GitHub CLI wrapper for PR creation
    shell.ts               splitCommand() — splits command strings with tilde expansion
web/
  src/                     React + Vite web dashboard (connects via WebSocket to server)
  vite.config.ts           Vite config with proxy to yoink server on port 7890
```

## Commands

```bash
bun test                  # run all tests
bun run src/index.tsx     # run the CLI in development
cd web && bunx vite       # run web dashboard dev server (needs yoink running for WebSocket)
cd web && bunx vite build # rebuild web UI (required after changing web/ files)
```

## Conventions

- Use `Bun.spawn()` for subprocesses, not `child_process`
- Pipe stdout/stderr in spawned processes (`stdout: 'pipe', stderr: 'pipe'`)
- Use `await proc.exited` for exit codes, `new Response(proc.stdout).text()` for output
- Processor emits events (`update`, `done`, `polling`) — Dashboard listens via `processor.on()`
- State mutations go through `Processor.updateIssue()` which calls `persistIssue()` automatically
- All external API calls (Linear, GitHub CLI) are `.catch(() => {})` wrapped to avoid crashing the pipeline
- Worktree paths follow the pattern: `../reponame-identifier/` (review worktrees: `../reponame-pr-<number>/`)
- Branch names follow: `linear/<identifier-lowercase>`
- Use `splitCommand()` from `src/lib/shell.ts` when spawning `githubCommand` — it splits on whitespace and expands `~/` (needed for multi-word commands like `proxychains4 -q -f ~/.proxychains.conf gh`)
- PR titles are prefixed with a robot emoji programmatically after creation via the GitHub CLI
- Web server runs on `web_port` (default 7890) — serves REST API (`/api/state`, `/api/actions`) + WebSocket (`/ws`) for real-time state

## Testing

Tests use `bun:test` with `describe`/`it`/`expect`. Test files live alongside source files as `*.test.ts`. Mock external dependencies (Linear API, Claude CLI, git) — don't make real API calls or spawn real processes in tests.

## Issue Status Flow

```
queued → creating-worktree → running-claude → pr-created
                                            → failed  → (retry | continue | abandoned)
                                            → stopped → (retry | continue | abandoned)

PR reviews (triggered via `v` key):
creating-worktree → reviewing → review-posted
                              → failed
```

All terminal statuses (`pr-created`, `failed`, `stopped`, `abandoned`) show a `claude --resume` command when a sessionId exists. Review items do not support resume.

## Key Types

- `IssueStatus`: `'queued' | 'creating-worktree' | 'running-claude' | 'pushing' | 'pr-created' | 'reviewing' | 'review-posted' | 'failed' | 'stopped' | 'abandoned'`
- `TrackedIssue`: the central data structure — issue metadata, status, logs, sessionId, worktreeDir, prUrl, prNumber
- `Config` / `ProjectConfig`: typed config from TOML
- `ProcessorEvent`: event union emitted to the UI
