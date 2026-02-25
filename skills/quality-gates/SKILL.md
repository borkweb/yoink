---
name: quality-gates
description: Use before committing or pushing code — a self-review checklist that verifies tests pass, code is clean, and changes are ready for review. Invoke this after implementing changes and before creating commits.
---

# Quality Gates

Before committing, complete every gate. Do not skip any.

## Gate 1: Tests Pass
- Run the project's test suite (check CLAUDE.md for the test command)
- If tests fail, fix them before proceeding
- If no test command is documented, look for common patterns: `npm test`, `bun test`, `composer test`, `phpunit`, `pytest`
- Do not push code with failing tests

## Gate 2: Linting & Static Analysis
- Run the project's linter if one exists (check CLAUDE.md)
- Fix any linting errors — do not disable rules

## Gate 3: Review Your Diff
- Run `git diff` and read every changed line
- Check for:
  - Debug statements (`console.log`, `dd()`, `var_dump`, `print_r`, `debugger`)
  - Commented-out code that should be removed
  - Unintended file changes (e.g., lock files, config files you didn't mean to touch)
  - Hardcoded values that should be configurable
  - Security issues: exposed secrets, SQL injection, XSS

## Gate 4: Scope Check
- Do your changes address the issue and nothing else?
- If you made unrelated improvements, revert them — keep the diff focused
- If the issue requires multiple logical changes, use separate commits

## Gate 5: Commit Message
- Uses conventional commit format: `type(scope): description | ISSUE-ID`
- Type accurately reflects the change (fix, feat, refactor, etc.)
- Description explains what changed, not how
