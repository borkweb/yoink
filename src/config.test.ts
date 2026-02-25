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
    expect(p.allowedTools).toBe('Read,Write,Skill,Task,Bash(git *),Bash(gh *)');
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
    expect(config.projects.x.allowedTools).toBe('Read,Edit,Write,Glob,Grep,Skill,Task,Bash,Bash(git *),Bash(gh *)');
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

  it('parses TOML in the format the setup wizard generates', () => {
    const wizardOutput = `[defaults]
concurrency = 2
max_turns = 100
poll_interval = 30

[linear]
api_key = "lin_api_abc123"

[projects.myproject]
repo_dir = "/Users/me/code/myproject"
base_branch = "main"
linear_team = "TEAM"
linear_assignee = "johndoe"
linear_label = "AI Automation"
github_command = "gh"
allowed_tools = "Read,Edit,Write,Glob,Grep,Skill,Task,Bash,Bash(git *),Bash(composer *),Bash(php *),Bash(cd *),Bash(pnpm *),Bash(proxychains4 *),Bash(gh *),Bash(cat *),Bash(ls *)"
`;
    const config = parseConfig(wizardOutput);
    expect(config.linear.apiKey).toBe('lin_api_abc123');
    expect(config.defaults.concurrency).toBe(2);
    expect(config.defaults.maxTurns).toBe(100);
    expect(config.defaults.pollInterval).toBe(30);

    const p = config.projects.myproject;
    expect(p.name).toBe('myproject');
    expect(p.repoDir).toBe('/Users/me/code/myproject');
    expect(p.baseBranch).toBe('main');
    expect(p.linearTeam).toBe('TEAM');
    expect(p.linearAssignee).toBe('johndoe');
    expect(p.linearLabel).toBe('AI Automation');
    expect(p.githubCommand).toBe('gh');
    expect(p.allowedTools).toBe('Read,Edit,Write,Glob,Grep,Skill,Task,Bash,Bash(git *),Bash(composer *),Bash(php *),Bash(cd *),Bash(pnpm *),Bash(proxychains4 *),Bash(gh *),Bash(cat *),Bash(ls *)');
  });
});
