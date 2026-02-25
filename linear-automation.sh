#!/usr/bin/env bash
# linear-automation.sh — Fetch Linear issues and use Claude Code to fix them
#
# Fetches issues from Linear assigned to a user with a specific label,
# creates a worktree per issue, runs Claude Code headless to implement
# a fix, and opens a PR.
#
# Requirements:
#   - REPO_DIR, LINEAR_API_KEY, LINEAR_TEAM, LINEAR_ASSIGNEE, LINEAR_LABEL
#     in env or in $REPO_DIR/.env
#   - claude CLI (Agent SDK / Claude Code)
#   - jq, curl, git, proxychains4 + gh (ghe alias)
#
# Usage:
#   ./linear-automation.sh              # process all matching issues
#   ./linear-automation.sh --dry-run    # list issues without processing
#   ./linear-automation.sh BIGR-123     # process a single issue by ID

set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────
LINEAR_API="https://api.linear.app/graphql"
MAX_TURNS="${CLAUDE_AUTOMATION_MAX_TURNS:-100}"
DRY_RUN=false
SINGLE_ISSUE=""

# ghe = proxychains4 + gh (alias not available in scripts)
GHE="proxychains4 -q -f $HOME/.proxychains.conf gh"

# ── Parse arguments ────────────────────────────────────────────────────
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    BIGR-*|bigr-*) SINGLE_ISSUE=$(echo "$arg" | tr '[:lower:]' '[:upper:]') ;;
    *) echo "Unknown argument: $arg"; exit 1 ;;
  esac
done

# ── Load environment ───────────────────────────────────────────────────
# REPO_DIR must be set via env — it's needed to locate .env
if [[ -z "${REPO_DIR:-}" ]]; then
  echo "ERROR: REPO_DIR is not set. Export it or add it to your environment."
  echo "  e.g. export REPO_DIR=/Users/matt/sites/telex"
  exit 1
fi

if [[ -f "$REPO_DIR/.env" ]]; then
  [[ -z "${LINEAR_API_KEY:-}" ]]  && LINEAR_API_KEY=$(grep '^LINEAR_API_KEY=' "$REPO_DIR/.env" | cut -d'=' -f2-)
  [[ -z "${LINEAR_TEAM:-}" ]]     && LINEAR_TEAM=$(grep '^LINEAR_TEAM=' "$REPO_DIR/.env" | cut -d'=' -f2-)
  [[ -z "${LINEAR_ASSIGNEE:-}" ]] && LINEAR_ASSIGNEE=$(grep '^LINEAR_ASSIGNEE=' "$REPO_DIR/.env" | cut -d'=' -f2-)
  [[ -z "${LINEAR_LABEL:-}" ]]    && LINEAR_LABEL=$(grep '^LINEAR_LABEL=' "$REPO_DIR/.env" | cut -d'=' -f2-)
  [[ -z "${CLAUDE_AUTOMATION_MAX_TURNS:-}" ]] && CLAUDE_AUTOMATION_MAX_TURNS=$(grep '^CLAUDE_AUTOMATION_MAX_TURNS=' "$REPO_DIR/.env" | cut -d'=' -f2-)
fi

# Require all config values
missing=()
[[ -z "${LINEAR_API_KEY:-}" ]]  && missing+=("LINEAR_API_KEY")
[[ -z "${LINEAR_TEAM:-}" ]]     && missing+=("LINEAR_TEAM (e.g. BIGR)")
[[ -z "${LINEAR_ASSIGNEE:-}" ]] && missing+=("LINEAR_ASSIGNEE (e.g. matthew.batchelder)")
[[ -z "${LINEAR_LABEL:-}" ]]    && missing+=("LINEAR_LABEL (e.g. AI Automation)")

if [[ ${#missing[@]} -gt 0 ]]; then
  echo "ERROR: Missing required config. Set these in $REPO_DIR/.env or export them:"
  for var in "${missing[@]}"; do
    echo "  - $var"
  done
  exit 1
fi

# ── Logging ────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$SCRIPT_DIR/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/automation-$(date +%Y%m%d-%H%M%S).log"

log() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

# ── Fetch issues from Linear ──────────────────────────────────────────
fetch_issues() {
  local graphql_query

  if [[ -n "$SINGLE_ISSUE" ]]; then
    # Extract number from identifier (e.g. BIGR-525 -> 525)
    local issue_number="${SINGLE_ISSUE#*-}"
    graphql_query="query { issues(filter: { team: { key: { eq: \"$LINEAR_TEAM\" } }, number: { eq: $issue_number } }) { nodes { id identifier title description url priority state { name type } labels { nodes { name } } } } }"
  else
    graphql_query="query { issues(filter: { team: { key: { eq: \"$LINEAR_TEAM\" } }, assignee: { displayName: { containsIgnoreCase: \"$LINEAR_ASSIGNEE\" } }, labels: { name: { eq: \"$LINEAR_LABEL\" } }, state: { name: { eq: \"Todo\" } } }) { nodes { id identifier title description url priority state { name type } labels { nodes { name } } } } }"
  fi

  # Use jq to safely build JSON payload (handles all escaping)
  local payload
  payload=$(jq -n --arg q "$graphql_query" '{ query: $q }')

  curl -s "$LINEAR_API" \
    -H "Authorization: $LINEAR_API_KEY" \
    -H "Content-Type: application/json" \
    -d "$payload"
}

# ── Update issue state in Linear ───────────────────────────────────────
update_issue_state() {
  local issue_id="$1"
  local state_name="$2"

  # First find the state ID for the target state
  local state_query
  state_query=$(cat <<EOF
{"query":"query { workflowStates(filter: { team: { key: { eq: \\"$LINEAR_TEAM\\" } }, name: { eq: \\"$state_name\\" } }) { nodes { id name } } }"}
EOF
  )

  local state_id
  state_id=$(curl -s "$LINEAR_API" \
    -H "Authorization: $LINEAR_API_KEY" \
    -H "Content-Type: application/json" \
    -d "$state_query" | jq -r '.data.workflowStates.nodes[0].id // empty')

  if [[ -z "$state_id" ]]; then
    log "WARNING: Could not find state '$state_name' for team $LINEAR_TEAM"
    return 1
  fi

  local mutation
  mutation=$(cat <<EOF
{"query":"mutation { issueUpdate(id: \\"$issue_id\\", input: { stateId: \\"$state_id\\" }) { success } }"}
EOF
  )

  curl -s "$LINEAR_API" \
    -H "Authorization: $LINEAR_API_KEY" \
    -H "Content-Type: application/json" \
    -d "$mutation" > /dev/null
}

# ── Add comment to Linear issue ────────────────────────────────────────
add_issue_comment() {
  local issue_id="$1"
  local body="$2"

  local mutation
  mutation=$(cat <<EOF
{"query":"mutation { commentCreate(input: { issueId: \\"$issue_id\\", body: \\"$body\\" }) { success } }"}
EOF
  )

  curl -s "$LINEAR_API" \
    -H "Authorization: $LINEAR_API_KEY" \
    -H "Content-Type: application/json" \
    -d "$mutation" > /dev/null
}

# ── Process a single issue ─────────────────────────────────────────────
process_issue() {
  local id="$1"
  local identifier="$2"
  local title="$3"
  local description="$4"
  local url="$5"

  local id_lower
  id_lower=$(echo "$identifier" | tr '[:upper:]' '[:lower:]')
  local branch_name="linear/${id_lower}"
  local repo_name
  repo_name=$(basename "$REPO_DIR")
  local worktree_dir="$REPO_DIR/../${repo_name}-${id_lower}"

  log "━━━ Processing: $identifier — $title ━━━"

  # Skip if worktree already exists (issue may be in progress)
  if [[ -d "$worktree_dir" ]]; then
    log "SKIP: Worktree already exists at $worktree_dir (issue may be in progress)"
    return 0
  fi

  # Create worktree from trunk
  log "Creating worktree: $worktree_dir (branch: $branch_name)"
  cd "$REPO_DIR"
  git fetch origin trunk 2>&1 | tee -a "$LOG_FILE"
  git worktree add -b "$branch_name" "$worktree_dir" origin/trunk 2>&1 | tee -a "$LOG_FILE"

  # Move to worktree
  cd "$worktree_dir"

  # Mark issue as "In Progress" in Linear
  update_issue_state "$id" "In Progress" || true

  # Build the prompt for Claude
  local prompt
  prompt=$(cat <<PROMPT
You are working on a fix for Linear issue $identifier.

**Issue title:** $title

**Issue description:**
$description

**Linear URL:** $url

## Instructions

1. Read the issue carefully and understand what needs to be fixed or implemented.
2. Explore the codebase to understand the relevant code. Consult CLAUDE.md for project conventions.
3. Implement the fix or feature as described in the issue.
4. Run relevant tests and linting to verify your changes:
   - For PHP changes: \`composer phpstan\` and \`composer lint\`
   - For client changes: \`cd client && pnpm check\` and \`pnpm test\`
5. Perform a thorough code review on the work and fix any problems.
6. Create a git commit with a conventional commit message referencing the issue:
   - Example: \`fix(scope): description | $identifier\`
7. Push the branch and create a pull request:
   - Use \`proxychains4 -q -f ~/.proxychains.conf gh\` instead of \`gh\` for all GitHub operations (the repo is on github.a8c.com)
   - Target branch: \`trunk\`
   - PR title should reference the Linear issue
   - PR body should include: a summary of changes, the Linear issue link ($url), and a test plan
8. Return the PR URL when done.

IMPORTANT:
- Use \`ghe\` or \`proxychains4 -q -f ~/.proxychains.conf gh\` for ALL GitHub CLI operations
- The base branch is \`trunk\`, not \`main\`
- Follow existing code conventions in CLAUDE.md
- Do NOT add \`Co-Authored-By: Claude\` to commit messages
PROMPT
  )

  log "Running Claude Code headless..."

  local result_file="$LOG_DIR/${identifier}-result.json"

  # Run Claude in headless mode
  if claude -p "$prompt" \
    --output-format json \
    --max-turns "$MAX_TURNS" \
    --allowedTools "Read,Edit,Write,Glob,Grep,Bash(git *),Bash(composer *),Bash(php *),Bash(cd client *),Bash(pnpm *),Bash(proxychains4 *),Bash(ghe *),Bash(cat *),Bash(ls *)" \
    > "$result_file" 2>>"$LOG_FILE"; then

    local pr_url
    pr_url=$(jq -r '.result' "$result_file" | grep -oE 'https://github\.[^/]+/[^ ]+/pull/[0-9]+' | head -1 || true)

    if [[ -n "$pr_url" ]]; then
      log "SUCCESS: PR created — $pr_url"
      add_issue_comment "$id" "Claude Code automation created a PR: $pr_url" || true
    else
      log "DONE: Claude finished but no PR URL detected. Check $result_file"
      add_issue_comment "$id" "Claude Code automation completed work on branch \`$branch_name\` but no PR was detected. Manual review may be needed." || true
    fi
  else
    log "ERROR: Claude Code exited with non-zero status for $identifier"
    add_issue_comment "$id" "Claude Code automation encountered an error processing this issue. Check logs." || true
    # Don't remove the worktree on failure — allows manual inspection
    return 1
  fi

  log "Completed: $identifier"
}

# ── Main ───────────────────────────────────────────────────────────────
main() {
  log "Starting Linear automation (team=$LINEAR_TEAM, assignee=$LINEAR_ASSIGNEE, label=$LINEAR_LABEL)"

  local response
  response=$(fetch_issues)

  # Check for errors
  local errors
  errors=$(echo "$response" | jq -r '.errors[0].message // empty')
  if [[ -n "$errors" ]]; then
    log "ERROR from Linear API: $errors"
    exit 1
  fi

  local issue_count
  issue_count=$(echo "$response" | jq '.data.issues.nodes | length')
  log "Found $issue_count issue(s)"

  if [[ "$issue_count" -eq 0 ]]; then
    log "No issues to process. Done."
    exit 0
  fi

  # List issues
  echo "$response" | jq -r '.data.issues.nodes[] | "  \(.identifier): \(.title) [\(.state.name)]"' | tee -a "$LOG_FILE"

  if [[ "$DRY_RUN" == true ]]; then
    log "Dry run — not processing issues."
    exit 0
  fi

  # Process each issue sequentially
  echo "$response" | jq -c '.data.issues.nodes[]' | while IFS= read -r issue; do
    local id identifier title description url
    id=$(echo "$issue" | jq -r '.id')
    identifier=$(echo "$issue" | jq -r '.identifier')
    title=$(echo "$issue" | jq -r '.title')
    description=$(echo "$issue" | jq -r '.description // "No description provided."')
    url=$(echo "$issue" | jq -r '.url')

    process_issue "$id" "$identifier" "$title" "$description" "$url" || {
      log "Failed to process $identifier, continuing with next issue..."
      continue
    }
  done

  log "Automation complete."
}

main
