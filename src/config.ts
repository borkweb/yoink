import { parse } from 'smol-toml';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { Config, ProjectConfig } from './types';

export const CONFIG_DIR = join(homedir(), '.config', 'yoink');
export const CONFIG_PATH = join(CONFIG_DIR, 'config.toml');

export function getConfigPath(): string {
  return CONFIG_PATH;
}

export function configExists(): boolean {
  return existsSync(CONFIG_PATH);
}

export function parseConfig(toml: string): Config {
  const parsed = parse(toml) as Record<string, any>;

  const config: Config = {
    defaults: {
      concurrency: Number(parsed.defaults?.concurrency ?? 2),
      maxTurns: Number(parsed.defaults?.max_turns ?? 100),
      pollInterval: Number(parsed.defaults?.poll_interval ?? 30),
    },
    linear: {
      apiKey: parsed.linear?.api_key ?? '',
    },
    projects: {},
  };

  if (!config.linear.apiKey) {
    throw new Error('Missing linear.api_key in config');
  }

  const projects = parsed.projects as Record<string, any> | undefined;
  if (!projects || Object.keys(projects).length === 0) {
    throw new Error('No projects defined in config');
  }

  for (const [name, p] of Object.entries(projects)) {
    const githubCommand = p.github_command ?? 'gh';
    let allowedTools = p.allowed_tools ?? 'Read,Edit,Write,Glob,Grep,Bash';

    // Auto-add Bash(<githubCommand> *) so PR creation is always approved
    const ghPattern = `Bash(${githubCommand} *)`;
    if (!allowedTools.includes(ghPattern)) {
      allowedTools += `,${ghPattern}`;
    }

    config.projects[name] = {
      name,
      repoDir: p.repo_dir,
      baseBranch: p.base_branch ?? 'main',
      linearTeam: p.linear_team,
      linearAssignee: p.linear_assignee,
      linearLabel: p.linear_label,
      githubCommand,
      allowedTools,
      linearApiKey: p.linear_api_key,
    };
  }

  return config;
}

export function loadConfig(): Config {
  if (!existsSync(CONFIG_PATH)) {
    throw new Error(
      `Config not found at ${CONFIG_PATH}\nCopy config.example.toml there to get started.`
    );
  }

  const raw = readFileSync(CONFIG_PATH, 'utf-8');
  const config = parseConfig(raw);

  // Env var overrides
  if (process.env.YOINK_LINEAR_API_KEY) {
    config.linear.apiKey = process.env.YOINK_LINEAR_API_KEY;
  }
  if (process.env.YOINK_CONCURRENCY) {
    config.defaults.concurrency = Number(process.env.YOINK_CONCURRENCY);
  }
  if (process.env.YOINK_MAX_TURNS) {
    config.defaults.maxTurns = Number(process.env.YOINK_MAX_TURNS);
  }
  if (process.env.YOINK_POLL_INTERVAL) {
    config.defaults.pollInterval = Number(process.env.YOINK_POLL_INTERVAL);
  }

  return config;
}
