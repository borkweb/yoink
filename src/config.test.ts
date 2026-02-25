import { describe, it, expect } from 'bun:test';
import { parseConfig } from './config';

const VALID_TOML = `
[defaults]
concurrency = 3
max_turns = 50

[linear]
api_key = "lin_api_test123"

[projects.myapp]
repo_dir = "/tmp/myapp"
base_branch = "main"
linear_team = "APP"
linear_assignee = "tester"
linear_label = "Automate"
github_command = "gh"
allowed_tools = "Read,Write"
`;

describe('parseConfig', () => {
  it('parses valid TOML into Config', () => {
    const config = parseConfig(VALID_TOML);

    expect(config.defaults.concurrency).toBe(3);
    expect(config.defaults.maxTurns).toBe(50);
    expect(config.linear.apiKey).toBe('lin_api_test123');
    expect(Object.keys(config.projects)).toEqual(['myapp']);

    const p = config.projects.myapp;
    expect(p.name).toBe('myapp');
    expect(p.repoDir).toBe('/tmp/myapp');
    expect(p.baseBranch).toBe('main');
    expect(p.linearTeam).toBe('APP');
    expect(p.githubCommand).toBe('gh');
    expect(p.allowedTools).toBe('Read,Write');
  });

  it('applies defaults when optional fields missing', () => {
    const minimal = `
[linear]
api_key = "lin_api_test"

[projects.x]
repo_dir = "/tmp/x"
linear_team = "X"
linear_assignee = "me"
linear_label = "Auto"
`;
    const config = parseConfig(minimal);
    expect(config.defaults.concurrency).toBe(2);
    expect(config.defaults.maxTurns).toBe(100);
    expect(config.projects.x.baseBranch).toBe('main');
    expect(config.projects.x.githubCommand).toBe('gh');
  });

  it('throws on missing api_key', () => {
    const bad = `
[projects.x]
repo_dir = "/tmp/x"
linear_team = "X"
linear_assignee = "me"
linear_label = "Auto"
`;
    expect(() => parseConfig(bad)).toThrow(/api_key/i);
  });

  it('throws on missing projects', () => {
    const bad = `
[linear]
api_key = "lin_api_test"
`;
    expect(() => parseConfig(bad)).toThrow(/project/i);
  });
});
