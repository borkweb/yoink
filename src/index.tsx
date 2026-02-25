import React from 'react';
import { render } from 'ink';
import meow from 'meow';
import { App } from './app';
import { getConfigPath, configExists } from './config';
import { SetupWizard } from './components/SetupWizard';
import { InitOverwrite } from './components/InitOverwrite';

const cli = meow(
  `
  Usage
    $ yoink <project> [issue]     Process issues for a project
    $ yoink --all                 Process all projects
    $ yoink init                  Run the setup wizard
    $ yoink config                Show config file path
    $ yoink projects              List configured projects

  Options
    --dry-run        Fetch and display issues without processing
    --concurrency    Number of parallel Claude runs (default: from config)
    --all            Process all configured projects

  Examples
    $ yoink myproject
    $ yoink myproject TEAM-123
    $ yoink myproject --dry-run
    $ yoink --all --concurrency 3
`,
  {
    importMeta: import.meta,
    flags: {
      dryRun: { type: 'boolean', default: false },
      concurrency: { type: 'number' },
      all: { type: 'boolean', default: false },
    },
  }
);

// Handle "init" subcommand
if (cli.input[0] === 'init') {
  if (configExists()) {
    const { waitUntilExit } = render(<InitOverwrite />);
    await waitUntilExit();
  } else {
    const { waitUntilExit } = render(<SetupWizard />);
    await waitUntilExit();
  }
  process.exit(0);
}

// Auto-detect: no config file exists
if (cli.input[0] !== 'config' && cli.input[0] !== 'projects') {
  if (!configExists()) {
    const { waitUntilExit } = render(<SetupWizard />);
    await waitUntilExit();
    process.exit(0);
  }
}

// Handle "config" subcommand
if (cli.input[0] === 'config') {
  const configPath = getConfigPath();
  const editor = process.env.EDITOR;

  if (editor) {
    const proc = Bun.spawn([editor, configPath], {
      stdin: 'inherit',
      stdout: 'inherit',
      stderr: 'inherit',
    });
    await proc.exited;
  } else {
    console.log(configPath);
  }

  process.exit(0);
}

// Handle "projects" subcommand
if (cli.input[0] === 'projects') {
  try {
    const { loadConfig } = await import('./config');
    const config = loadConfig();
    console.log('Configured projects:');
    for (const [name, project] of Object.entries(config.projects)) {
      console.log(`  ${name} — ${project.linearTeam} (${project.repoDir})`);
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
  }
  process.exit(0);
}

// Determine project and issue from positional args
const [first, second] = cli.input;
let projectName: string | undefined;
let singleIssue: string | undefined;

if (first && !first.startsWith('-')) {
  if (/^[A-Za-z]+-\d+$/.test(first)) {
    singleIssue = first.toUpperCase();
  } else {
    projectName = first;
  }
}

if (second && /^[A-Za-z]+-\d+$/.test(second)) {
  singleIssue = second.toUpperCase();
}

render(
  <App
    projectName={projectName}
    singleIssue={singleIssue}
    all={cli.flags.all}
    dryRun={cli.flags.dryRun}
    concurrency={cli.flags.concurrency}
  />
);
