# yoink

A CLI tool that fetches Linear issues and processes them with Claude Code — creating worktrees, implementing fixes, and opening PRs automatically. Also supports on-demand PR code reviews from the dashboard. Built with Bun, React, and [Ink](https://github.com/vadimdemedes/ink) for a live terminal dashboard.

## How It Works

1. Fetches issues from Linear (filtered by team, assignee, label, state=Todo)
2. Creates an isolated git worktree per issue
3. Spawns Claude Code with yoink + configured plugins (`--plugin-dir`) to implement the fix, run tests, review, commit, and create a PR
4. Updates Linear issue state throughout (Todo → In Progress → In Review)
5. Cleans up worktrees after successful PRs

Multiple issues run concurrently. Running issues can be stopped mid-execution. Failed and stopped issues persist across restarts and can be retried, continued (via Claude's `--resume`), or abandoned. All finished tickets show a copy-paste `claude --resume` command for interactive follow-up.

You can also review any GitHub PR from the dashboard by pressing `v` and pasting a PR URL or number. Yoink creates a worktree, runs a code review via Claude, and posts the result as a comment on the PR.

## Prerequisites

- [Bun](https://bun.sh/) runtime
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI
- Claude Code plugins are configurable via `claude_plugins` in config (defaults to [superpowers](https://github.com/obra/superpowers)) — yoink auto-installs configured plugins on first run

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
claude_plugins = ["superpowers@claude-plugins-official"]  # plugins to install and load

[linear]
api_key = "lin_api_..."

[projects.myproject]
repo_dir = "/path/to/repo"
base_branch = "main"
linear_team = "TEAM"
linear_assignee = "your.name"
linear_label = "AI Automation"
github_command = "gh"                        # supports multi-word commands, e.g. "proxychains4 -q -f ~/.proxychains.conf gh"
allowed_tools = "Read,Edit,Write,Glob,Grep,Bash(git *)"
```

Environment variables override config values: `YOINK_LINEAR_API_KEY`, `YOINK_CONCURRENCY`, `YOINK_MAX_TURNS`, `YOINK_POLL_INTERVAL`, `YOINK_CLAUDE_PLUGINS` (comma-separated).

## Usage

```bash
yoink                        # process all configured projects (default)
yoink <project>              # process a single project
yoink <project> TEAM-123     # process a single issue
yoink --dry-run              # fetch and display issues without processing
yoink init                   # run the setup wizard (auto-runs on first launch)
yoink config                 # open config file in $EDITOR
yoink projects               # list configured projects
```

## Dashboard

### Terminal UI

The terminal UI shows a live view of all issues with keyboard controls:

| Key       | Action                                         |
|-----------|------------------------------------------------|
| `j` / `k` | Navigate up/down                              |
| `Enter`   | Expand/collapse issue logs                     |
| `s`       | Stop running issue (kills Claude process)      |
| `r`       | Retry failed/stopped issue (clean worktree, restart) |
| `c`       | Continue failed/stopped issue (resume Claude session) |
| `d`       | Delete failed/stopped issue (clean up, abandon) |
| `v`       | Review a PR (enter URL or number)              |
| `p`       | Pause/resume processing                        |
| `q`       | Graceful shutdown                              |

Expanding a finished ticket shows a `claude --resume` command you can copy-paste to continue the session interactively in your terminal.

### Web Dashboard

A browser-based dashboard runs alongside the terminal UI on port 7890 (configurable via `web_port` in config). It provides the same functionality as the TUI — view issues, stop/retry/continue/delete, trigger PR reviews, and open resume commands in a new terminal tab.

Features:
- **Real-time updates** via WebSocket — state changes appear instantly
- **Light/dark mode** — follows OS preference with manual toggle, persisted to localStorage
- **Issue actions** — stop running issues, retry/continue/delete failed ones, all with click-to-confirm for destructive actions
- **Resume commands** — copy to clipboard or open directly in a new terminal tab (iTerm2, Terminal.app, gnome-terminal, konsole, xfce4-terminal, xterm)
- **PR reviews** — submit PR review requests from a modal dialog
- **Issue/PR links** — identifiers link to Linear, PR numbers link to GitHub

For development with hot reload:
```bash
yoink myproject --dev    # starts Vite dev server on port 5173 with HMR
```

## Skills

Yoink is structured as a Claude Code plugin. When spawning Claude, it passes `--plugin-dir` flags — one for yoink's own skills and one for each configured plugin (via `claude_plugins` in config, defaulting to [superpowers](https://github.com/obra/superpowers)) — making the following skills available to every spawned instance:

**Yoink skills:**
- **workflow** — end-to-end Linear issue flow: understand the issue, explore the codebase, implement, code review, commit, push, and create a PR
- **review** — PR code review workflow: dispatch a code-reviewer subagent, format the output, post it as a PR comment
- **quality-gates** — pre-commit checklist: run tests, lint, review the diff, check scope, validate the commit message
- **standards** — engineering principles: small focused changes, follow existing patterns, no drive-by improvements, no leftover artifacts

**Configured plugin skills** — by default, superpowers provides TDD, debugging, and code review skills. The workflow dispatches the `superpowers:code-reviewer` subagent before committing to catch issues early. You can add or replace plugins via the `claude_plugins` config array (set to `[]` to disable all external plugins).

Skills live in `skills/` and are defined as `SKILL.md` files with YAML frontmatter. Claude auto-discovers and invokes them based on context. The prompt only provides issue context and project config — the skills handle the workflow.

Spawned instances also inherit skills from the target project's `.claude/skills/` directory and the user's global plugins.

## State Persistence

Issue state is saved to `~/.config/yoink/state.json`. On startup, issues from the last 24 hours are shown in a history section. Failed and stopped issues can be acted on immediately.

## Development

```bash
bun test                  # run tests
bun run src/index.tsx     # run without linking
cd web && bunx vite       # run web dashboard dev server (needs yoink running)
cd web && bunx vite build # rebuild web UI after changes
```
