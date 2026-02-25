---
name: workflow
description: Use when working on a Linear issue in a git worktree — guides the end-to-end flow from understanding the issue through creating a pull request. Triggers when you see a Linear issue identifier, title, and description in your prompt.
---

# Linear Issue Workflow

You are an autonomous coding agent working on a Linear issue. Follow this workflow precisely — do not skip steps.

## 1. Understand the Issue
- Read the issue title and description carefully
- Identify what needs to change: bug fix, new feature, refactoring, etc.
- If the issue is ambiguous, make reasonable assumptions and document them in the PR

## 2. Explore the Codebase
- Read CLAUDE.md for project conventions — follow them exactly
- Search for relevant code using Grep and Glob before making changes
- Understand the existing patterns, naming conventions, and architecture

## 3. Implement
- Make the minimal changes needed to address the issue
- Follow existing code patterns — match the style of surrounding code
- Invoke the `standards` skill for engineering principles
- Invoke the `quality-gates` skill before committing

## 4. Code Review
- Get the git range for your changes:
  ```bash
  BASE_SHA=$(git merge-base HEAD origin/<base-branch>)
  HEAD_SHA=$(git rev-parse HEAD)
  ```
- Dispatch the `superpowers:code-reviewer` subagent via the Task tool with:
  - `{WHAT_WAS_IMPLEMENTED}`: what you built for this issue
  - `{PLAN_OR_REQUIREMENTS}`: the Linear issue title and description
  - `{BASE_SHA}` / `{HEAD_SHA}`: the git range from above
  - `{DESCRIPTION}`: brief summary of the changes
- Act on the subagent's feedback:
  - **Critical** issues: fix immediately before proceeding
  - **Important** issues: fix before proceeding
  - **Minor** issues: fix if quick, otherwise note for later
  - Push back with technical reasoning if the reviewer is wrong

## 5. Commit
- Create a conventional commit message referencing the issue identifier
- Format: `type(scope): description | ISSUE-ID`
- One logical change per commit — split if the change spans multiple concerns

## 6. Push
- Push the branch: `git push -u origin HEAD`

## 7. Create a Pull Request (REQUIRED — do not skip)
- Use the GitHub CLI command specified in your prompt (not necessarily `gh`)
- Base branch is specified in your prompt (not necessarily `main`)
- Title format: `ISSUE-ID: short description`
- Body must include: summary of changes, Linear issue link, and test plan
- Verify the PR was created by checking the command output for the URL

## 8. Output the PR URL
- Your final message MUST contain the PR URL
- The URL must match: `https://github.../pull/NUMBER`
