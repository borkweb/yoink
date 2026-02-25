import React from 'react';
import { Box, Text } from 'ink';
import type { TrackedIssue } from '../types';

interface Props {
  issues: TrackedIssue[];
  paused: boolean;
  startedAt: number;
  nextPollAt: number | null;
}

export function StatusBar({ issues, paused, startedAt, nextPollAt }: Props) {
  const done = issues.filter((i) => i.status === 'pr-created').length;
  const running = issues.filter(
    (i) => i.status === 'running-claude' || i.status === 'creating-worktree' || i.status === 'pushing'
  ).length;
  const failed = issues.filter((i) => i.status === 'failed').length;
  const queued = issues.filter((i) => i.status === 'queued').length;
  const abandoned = issues.filter((i) => i.status === 'abandoned').length;

  const elapsed = Math.floor((Date.now() - startedAt) / 1000);
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const time = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

  const pollCountdown = nextPollAt ? Math.max(0, Math.ceil((nextPollAt - Date.now()) / 1000)) : null;

  return (
    <Box marginTop={1} justifyContent="space-between">
      <Box gap={2}>
        <Text color="green" bold>{done} done</Text>
        <Text color="cyan">{running} running</Text>
        {queued > 0 && <Text dimColor>{queued} queued</Text>}
        {failed > 0 && <Text color="red">{failed} failed</Text>}
        {abandoned > 0 && <Text dimColor>{abandoned} deleted</Text>}
        {paused && <Text color="yellow" bold> PAUSED</Text>}
        {!paused && pollCountdown !== null && running === 0 && queued === 0 && (
          <Text dimColor>poll in {pollCountdown}s</Text>
        )}
      </Box>
      <Box gap={2}>
        <Text dimColor>{time}</Text>
        <Text dimColor>[j/k] nav  [enter] expand  [r/c/d] actions  [p] pause  [q] quit</Text>
      </Box>
    </Box>
  );
}
