---
name: standards
description: Use when implementing code changes — engineering principles for writing clean, focused, production-quality code. Invoke this when starting implementation work.
---

# Engineering Standards

These principles apply to all code you write, regardless of project or language.

## Small, Focused Changes
- Change the minimum amount of code needed to address the issue
- Do not refactor surrounding code unless the issue specifically asks for it
- Do not add features, helpers, or abstractions beyond what was requested
- Three similar lines of code is better than a premature abstraction

## Follow Existing Patterns
- Match the style of the codebase — naming, formatting, structure
- If the project uses tabs, use tabs. If it uses 2-space indent, use 2-space indent
- Use the same error handling patterns as surrounding code
- Import from the same locations as existing code does

## No Drive-By Improvements
- Do not add type annotations to code you didn't change
- Do not add docstrings or comments to existing functions
- Do not rename variables for "clarity" outside the scope of your change
- Do not update dependencies unless the issue requires it

## Defensive at Boundaries, Trusting Internally
- Validate user input, API responses, and external data
- Trust internal function contracts — don't add redundant null checks
- Don't add error handling for scenarios that can't happen

## No Leftover Artifacts
- Do not leave TODO comments for future work
- Do not add backwards-compatibility shims
- Do not leave commented-out code "for reference"
- If you remove something, remove it completely
