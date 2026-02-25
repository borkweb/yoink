import { describe, it, expect } from 'bun:test';
import { parsePRInput } from './pr';

describe('parsePRInput', () => {
  it('parses a full GitHub URL', () => {
    const result = parsePRInput('https://github.com/acme/repo/pull/123');
    expect(result).toEqual({ prNumber: 123, repoSlug: 'acme/repo' });
  });

  it('parses a GitHub Enterprise URL with host in repoSlug', () => {
    const result = parsePRInput('https://github.example.com/org/project/pull/456');
    expect(result).toEqual({ prNumber: 456, repoSlug: 'github.example.com/org/project' });
  });

  it('parses a bare number', () => {
    const result = parsePRInput('42');
    expect(result).toEqual({ prNumber: 42, repoSlug: null });
  });

  it('returns null for invalid input', () => {
    expect(parsePRInput('')).toBeNull();
    expect(parsePRInput('not-a-pr')).toBeNull();
    expect(parsePRInput('https://github.com/org/repo')).toBeNull();
  });
});
