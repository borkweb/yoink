import React, { useState, useMemo } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { SetupWizard } from './SetupWizard';
import { CONFIG_PATH, loadConfig } from '../config';

export function InitOverwrite() {
  const existingData = useMemo(() => {
    try {
      const config = loadConfig();
      const [projectName, project] = Object.entries(config.projects)[0] ?? [];
      return {
        linearApiKey: config.linear.apiKey,
        projectName: projectName ?? '',
        repoDir: project?.repoDir ?? '',
        linearTeam: project?.linearTeam ?? '',
        linearAssignee: project?.linearAssignee ?? '',
        linearLabel: project?.linearLabel ?? '',
        baseBranch: project?.baseBranch ?? 'main',
        claudePlugins: config.defaults.claudePlugins.join(', '),
        concurrency: String(config.defaults.concurrency),
        maxTurns: String(config.defaults.maxTurns),
        pollInterval: String(config.defaults.pollInterval),
        githubCommand: project?.githubCommand ?? 'gh',
        allowedTools: project?.allowedTools ?? '',
      };
    } catch {
      return undefined;
    }
  }, []);
  const { exit } = useApp();
  const [confirmed, setConfirmed] = useState<boolean | null>(null);

  useInput((input) => {
    if (confirmed !== null) return;
    if (input === 'y' || input === 'Y') {
      setConfirmed(true);
    } else if (input === 'n' || input === 'N') {
      setConfirmed(false);
    }
  });

  if (confirmed === true) {
    return <SetupWizard initialData={existingData} />;
  }

  if (confirmed === false) {
    setTimeout(() => exit(), 100);
    return (
      <Box>
        <Text dimColor>Aborted. Edit your existing config with: yoink config</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text>
        Config already exists at <Text bold>{CONFIG_PATH}</Text>
      </Text>
      <Text>
        Overwrite? <Text color="yellow">y/n</Text>
      </Text>
    </Box>
  );
}
