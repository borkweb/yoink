---
name: review
description: Use when reviewing a GitHub PR — dispatches the superpowers code-reviewer subagent, formats the output, and posts it as a PR comment.
---

# PR Review Workflow

You are reviewing a pull request. Follow this workflow precisely — do not skip steps. This is a read-only review — do NOT create commits, branches, or modify code.

## 1. Understand the PR
- Read the PR title and description from your prompt
- Read CLAUDE.md for project conventions
- Browse key changed files to understand the scope

## 2. Get the diff range
- Determine the base and head for the review:
  ```bash
  BASE_SHA=$(git merge-base HEAD origin/<base-branch>)
  HEAD_SHA=$(git rev-parse HEAD)
  ```
  (Replace `<base-branch>` with the base branch from your prompt)

## 3. Dispatch superpowers:code-reviewer subagent
- Use the Task tool with `superpowers:code-reviewer` subagent type
- Fill in the template:
  - `{WHAT_WAS_IMPLEMENTED}`: the PR title
  - `{PLAN_OR_REQUIREMENTS}`: the PR description
  - `{BASE_SHA}` / `{HEAD_SHA}`: from step 2
  - `{DESCRIPTION}`: brief summary of the changes based on the diff

## 4. Post the review as a PR comment
- Take the subagent's review output
- Append this footer on its own line at the end:
  ```
  ---
  🤖 *Automated review by Claude*
  ```
- Post as a comment using the command from your prompt:
  ```bash
  <github-command> pr comment <pr-number> [-R <repo>] --body "<review>"
  ```
- Use a heredoc or temp file for the body to avoid shell escaping issues

## 5. Output confirmation
- Your final message MUST confirm the comment was posted
- Include the PR URL if available
