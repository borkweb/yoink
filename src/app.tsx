import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { loadConfig } from './config';
import { Processor } from './services/processor';
import { Dashboard } from './components/Dashboard';

interface Props {
  projectName?: string;
  singleIssue?: string;
  all?: boolean;
  dryRun?: boolean;
  concurrency?: number;
}

export function App({ projectName, singleIssue, all, dryRun, concurrency }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [processor, setProcessor] = useState<Processor | null>(null);
  const [title, setTitle] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const config = loadConfig();
        const conc = concurrency ?? config.defaults.concurrency;
        const pollMs = (singleIssue || dryRun) ? 0 : config.defaults.pollInterval * 1000;
        const proc = new Processor(config, conc, pollMs);

        if (all) {
          setTitle('all projects');
          await proc.loadAllProjects();
          for (const name of Object.keys(config.projects)) {
            const history = proc.getHistoryIssues(name);
            if (history.length > 0) proc.mergeHistory(history);
          }
        } else if (projectName) {
          setTitle(`${projectName} \u2014 ${config.projects[projectName].repoDir}`);
          await proc.loadIssues(projectName, singleIssue);
          const history = proc.getHistoryIssues(projectName);
          if (history.length > 0) proc.mergeHistory(history);
        } else {
          const names = Object.keys(config.projects);
          if (names.length === 1) {
            setTitle(`${names[0]} \u2014 ${config.projects[names[0]].repoDir}`);
            await proc.loadIssues(names[0], singleIssue);
            const history = proc.getHistoryIssues(names[0]);
            if (history.length > 0) proc.mergeHistory(history);
          } else {
            setError(
              `Multiple projects configured. Specify one: ${names.join(', ')}\nOr use --all`
            );
            return;
          }
        }

        setProcessor(proc);
        setLoading(false);

        // Kill child Claude processes when yoink is terminated, so they
        // don't become orphans with broken stdio pipes.
        const onTerminate = () => proc.killActiveProcesses();
        process.on('SIGTERM', onTerminate);
        process.on('SIGINT', onTerminate);

        if (!dryRun) {
          await proc.start();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, []);

  if (error) {
    return (
      <Box>
        <Text color="red">Error: {error}</Text>
      </Box>
    );
  }

  if (loading || !processor) {
    return (
      <Box>
        <Text dimColor>Loading issues...</Text>
      </Box>
    );
  }

  return <Dashboard processor={processor} title={title} dryRun={dryRun} />;
}
