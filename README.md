# yoink

A CLI tool that fetches Linear issues and processes them with Claude Code — creating worktrees, implementing fixes, and opening PRs automatically. Built with Bun, React, and [Ink](https://github.com/vadimdemedes/ink) for a live terminal dashboard.

## How It Works

1. Fetches issues from Linear (filtered by team, assignee, label, state=Todo)
2. Creates an isolated git worktree per issue
3. Spawns Claude Code with yoink + superpowers plugins (`--plugin-dir`) to implement the fix, run tests, review, commit, and create a PR
4. Updates Linear issue state throughout (Todo → In Progress → In Review)
5. Cleans up worktrees after successful PRs

Multiple issues run concurrently. Running issues can be stopped mid-execution. Failed and stopped issues persist across restarts and can be retried, continued (via Claude's `--resume`), or abandoned. All finished tickets show a copy-paste `claude --resume` command for interactive follow-up.

## Prerequisites

- [Bun](https://bun.sh/) runtime
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI
- The [superpowers](https://github.com/obra/superpowers) Claude Code plugin — yoink auto-installs this on first run if missing, or install manually:
  ```bash
  claude plugin install superpowers@superpowers-dev
  ```

## Installation

```bash
bun install
bun link
```

## Configuration

Run `yoink init` (or just run `yoink` with no config) to launch the interactive setup wizard. It will prompt for your Linear API key, project details, and optionally advanced settings, then write the config to `~/.config/yoink/config.toml`.

Alternatively, copy the example config and edit it manually:

```bash
mkdir -p ~/.config/yoink
cp config.example.toml ~/.config/yoink/config.toml
```

```toml
[defaults]
concurrency = 2         # parallel Claude sessions
max_turns = 100         # max Claude turns per issue
poll_interval = 30      # seconds between Linear polls (0 to disable)

[linear]
api_key = "lin_api_..."

[projects.myproject]
repo_dir = "/path/to/repo"
base_branch = "main"
linear_team = "TEAM"
linear_assignee = "your.name"
linear_label = "AI Automation"
github_command = "gh"                        # or a custom wrapper
allowed_tools = "Read,Edit,Write,Glob,Grep,Bash(git *)"
```

Environment variables override config values: `YOINK_LINEAR_API_KEY`, `YOINK_CONCURRENCY`, `YOINK_MAX_TURNS`, `YOINK_POLL_INTERVAL`.

## Usage

```bash
yoink <project>              # process all matching issues for a project
yoink <project> TEAM-123     # process a single issue
yoink --all                  # process all configured projects
yoink --dry-run              # fetch and display issues without processing
yoink init                   # run the setup wizard (auto-runs on first launch)
yoink config                 # open config file in $EDITOR
yoink projects               # list configured projects
```

## Dashboard

The terminal UI shows a live view of all issues with keyboard controls:

| Key       | Action                                         |
|-----------|------------------------------------------------|
| `j` / `k` | Navigate up/down                              |
| `Enter`   | Expand/collapse issue logs                     |
| `s`       | Stop running issue (kills Claude process)      |
| `r`       | Retry failed/stopped issue (clean worktree, restart) |
| `c`       | Continue failed/stopped issue (resume Claude session) |
| `d`       | Delete failed/stopped issue (clean up, abandon) |
| `p`       | Pause/resume processing                        |
| `q`       | Graceful shutdown                              |

Expanding a finished ticket shows a `claude --resume` command you can copy-paste to continue the session interactively in your terminal.

## Skills

Yoink is structured as a Claude Code plugin. When spawning Claude, it passes two `--plugin-dir` flags — one for yoink's own skills and one for the [superpowers](https://github.com/obra/superpowers) plugin — making the following skills available to every spawned instance:

**Yoink skills:**
- **workflow** — end-to-end Linear issue flow: understand the issue, explore the codebase, implement, code review, commit, push, and create a PR
- **quality-gates** — pre-commit checklist: run tests, lint, review the diff, check scope, validate the commit message
- **standards** — engineering principles: small focused changes, follow existing patterns, no drive-by improvements, no leftover artifacts

**Superpowers skills** (TDD, debugging, code review, etc.) — the workflow dispatches the `superpowers:code-reviewer` subagent before committing to catch issues early.

Skills live in `skills/` and are defined as `SKILL.md` files with YAML frontmatter. Claude auto-discovers and invokes them based on context. The prompt only provides issue context and project config — the skills handle the workflow.

Spawned instances also inherit skills from the target project's `.claude/skills/` directory and the user's global plugins.

## State Persistence

Issue state is saved to `~/.config/yoink/state.json`. On startup, issues from the last 24 hours are shown in a history section. Failed and stopped issues can be acted on immediately.

## Development

```bash
bun test             # run tests
bun run src/index.tsx # run without linking
```
