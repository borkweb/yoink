import React from 'react';
import { render } from 'ink';
import meow from 'meow';
import { App } from './app';
import { loadConfig, getConfigPath, configExists } from './config';
import { YoinkEngine } from './engine';
import { SetupWizard } from './components/SetupWizard';
import { InitOverwrite } from './components/InitOverwrite';
import { acquireLock, releaseLock } from './lib/pidlock';
import { createServer } from './server/server';
import { join, dirname } from 'path';
import { existsSync } from 'fs';

console.log(`
  __   __  ___   ___  _   _  _  __
  \\ \\ / / / _ \\ |_ _|| \\ | || |/ /
   \\ V / | | | | | | |  \\| || ' /
    | |  | |_| | | | | |\\  || . \\
    |_|   \\___/ |___||_| \\_||_|\\_\\
`);

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
    --dev            Start Vite dev server for web UI with HMR

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
      dev: { type: 'boolean', default: false },
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

// Kill any existing yoink instance and claim the lock
acquireLock();
process.on('exit', releaseLock);

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

let config;
try {
  config = loadConfig();
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
  throw err; // unreachable, helps TypeScript narrow the type
}

const engine = new YoinkEngine(config, {
  projectName,
  singleIssue,
  all: cli.flags.all,
  dryRun: cli.flags.dryRun,
  concurrency: cli.flags.concurrency,
});

// Build web UI if dist doesn't exist (production mode)
const webDir = join(dirname(import.meta.dir), 'web');
const webDistIndex = join(webDir, 'dist', 'index.html');

let viteProc: ReturnType<typeof Bun.spawn> | null = null;

if (cli.flags.dev) {
  // Dev mode: start Vite dev server with HMR
  viteProc = Bun.spawn(['bunx', 'vite'], {
    cwd: webDir,
    stdout: 'inherit',
    stderr: 'inherit',
  });
  console.log(`  Web (dev): http://localhost:5173\n`);
} else {
  if (!existsSync(webDistIndex)) {
    console.log('  Building web UI...');
    const build = Bun.spawn(['bunx', 'vite', 'build'], {
      cwd: webDir,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const exitCode = await build.exited;
    if (exitCode !== 0) {
      const stderr = await new Response(build.stderr).text();
      console.error(`  Web UI build failed: ${stderr}`);
    }
  }
}

const webServer = createServer(engine, config.defaults.webPort);
if (!cli.flags.dev) {
  console.log(`  Web: http://localhost:${webServer.port}\n`);
}

// On termination: kill child processes (Claude, Vite) so they don't become orphans
// with broken stdio pipes, then exit (triggers 'exit' handler for lock release).
const onTerminate = () => {
  if (viteProc) viteProc.kill();
  engine.killActiveProcesses();
  process.exit(0);
};
process.on('SIGTERM', onTerminate);
process.on('SIGINT', onTerminate);

render(<App engine={engine} />);
