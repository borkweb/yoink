# yoink

A CLI tool that fetches Linear issues and processes them with Claude Code — creating worktrees, implementing fixes, and opening PRs automatically. Built with Bun, React, and [Ink](https://github.com/vadimdemedes/ink) for a live terminal dashboard.

## How It Works

1. Fetches issues from Linear (filtered by team, assignee, label, state=Todo)
2. Creates an isolated git worktree per issue
3. Spawns Claude Code to implement the fix, run tests, commit, and create a PR
4. Updates Linear issue state throughout (Todo → In Progress → In Review)
5. Cleans up worktrees after successful PRs

Multiple issues run concurrently. Failed issues persist across restarts and can be retried, continued (via Claude's `--resume`), or abandoned.

## Installation

```bash
bun install
bun link
```

## Configuration

Copy the example config and edit it:

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
yoink config                 # open config file in $EDITOR
yoink projects               # list configured projects
```

## Dashboard

The terminal UI shows a live view of all issues with keyboard controls:

| Key       | Action                                    |
|-----------|-------------------------------------------|
| `j` / `k` | Navigate up/down                         |
| `Enter`   | Expand/collapse issue logs                |
| `r`       | Retry failed issue (clean worktree, restart) |
| `c`       | Continue failed issue (resume Claude session) |
| `d`       | Delete failed issue (clean up, abandon)   |
| `p`       | Pause/resume processing                   |
| `q`       | Graceful shutdown                         |

## State Persistence

Issue state is saved to `~/.config/yoink/state.json`. On startup, issues from the last 24 hours are shown in a history section. Failed issues can be acted on immediately.

## Development

```bash
bun test             # run tests
bun run src/index.tsx # run without linking
```
