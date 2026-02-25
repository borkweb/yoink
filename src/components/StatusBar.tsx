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
    (i) => i.status === 'running-claude' || i.status === 'creating-worktree' || i.status === 'pushing' || i.status === 'reviewing'
  ).length;
  const failed = issues.filter((i) => i.status === 'failed').length;
  const stopped = issues.filter((i) => i.status === 'stopped').length;
  const queued = issues.filter((i) => i.status === 'queued').length;
  const abandoned = issues.filter((i) => i.status === 'abandoned').length;
  const reviewing = issues.filter((i) => i.status === 'reviewing').length;
  const reviewed = issues.filter((i) => i.status === 'review-posted').length;

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
        {stopped > 0 && <Text color="yellow">{stopped} stopped</Text>}
        {abandoned > 0 && <Text dimColor>{abandoned} deleted</Text>}
        {reviewing > 0 && <Text color="magenta">{reviewing} reviewing</Text>}
        {reviewed > 0 && <Text color="magenta">{reviewed} reviewed</Text>}
        {paused && <Text color="yellow" bold> PAUSED</Text>}
        {!paused && pollCountdown !== null && running === 0 && queued === 0 && (
          <Text dimColor>poll in {pollCountdown}s</Text>
        )}
      </Box>
      <Box gap={2}>
        <Text dimColor>{time}</Text>
        <Text dimColor>[j/k] nav  [enter] expand  [s] stop  [r/c/d] actions  [v] review  [p] pause  [q] quit</Text>
      </Box>
    </Box>
  );
}
