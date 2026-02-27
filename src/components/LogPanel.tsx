import React from 'react';
import { Box, Text } from 'ink';
import { existsSync } from 'fs';
import { homedir } from 'os';
import type { TrackedIssue } from '../types';

interface Props {
  tracked: TrackedIssue;
  maxLines?: number;
}

function tildify(path: string): string {
  const home = homedir();
  return path.startsWith(home) ? '~' + path.slice(home.length) : path;
}

function resumeCommand(tracked: TrackedIssue): string {
  const resume = `claude --resume ${tracked.sessionId}`;
  if (!tracked.worktreeDir) return resume;

  const wtPath = tildify(tracked.worktreeDir);

  if (existsSync(tracked.worktreeDir)) {
    return `cd ${wtPath} && ${resume}`;
  }

  const branch = `linear/${tracked.issue.identifier.toLowerCase()}`;
  const repoPath = tracked.repoDir ? tildify(tracked.repoDir) : '';
  const cdToRepo = repoPath ? `cd ${repoPath} && ` : '';
  return `${cdToRepo}git worktree add ${wtPath} ${branch} && cd ${wtPath} && ${resume}`;
}

export function LogPanel({ tracked, maxLines = 10 }: Props) {
  const { issue, logs, error, status } = tracked;
  const visibleLogs = logs.slice(-maxLines);

  return (
    <Box flexDirection="column" marginLeft={3} marginBottom={1}>
      {visibleLogs.map((line, i) => (
        <Box key={i}>
          <Text dimColor>
            {'\u2503'} {line}
          </Text>
        </Box>
      ))}
      {error && (
        <Box>
          <Text color="red">
            {'\u2503'} Error: {error}
          </Text>
        </Box>
      )}
      {(status === 'failed' || status === 'stopped') && (
        <Box marginTop={0}>
          <Text>
            {'\u2503'}{'  '}
            <Text color="yellow" bold>[r]</Text>
            <Text> Retry  </Text>
            <Text color="cyan" bold>[c]</Text>
            <Text> Continue  </Text>
            <Text color="red" bold>[d]</Text>
            <Text> Delete</Text>
          </Text>
        </Box>
      )}
      {tracked.prUrl && (
        <Box>
          <Text color="green">
            {'\u2503'} {tracked.prUrl}
          </Text>
        </Box>
      )}
      {['pr-created', 'review-posted', 'failed', 'stopped', 'abandoned'].includes(status) && tracked.sessionId && (
        <Box>
          <Text dimColor>
            {'\u2503'} Resume: {resumeCommand(tracked)}
          </Text>
        </Box>
      )}
      {logs.length === 0 && !error && !tracked.prUrl && (
        <Box>
          <Text dimColor>{'\u2503'} Waiting for output...</Text>
        </Box>
      )}
    </Box>
  );
}
