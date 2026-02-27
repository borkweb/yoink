import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import type { TrackedIssue } from '../types';

interface Props {
  tracked: TrackedIssue;
  focused: boolean;
  expanded: boolean;
  isHistory?: boolean;
}

const STATUS_DISPLAY: Record<
  string,
  { icon: string; color: string; label: string; spinning: boolean }
> = {
  queued: { icon: '\u25CC', color: 'gray', label: 'Queued', spinning: false },
  'creating-worktree': { icon: '', color: 'yellow', label: 'Worktree...', spinning: true },
  'running-claude': { icon: '', color: 'cyan', label: 'Running...', spinning: true },
  pushing: { icon: '', color: 'yellow', label: 'Pushing...', spinning: true },
  reviewing: { icon: '', color: 'magenta', label: 'Reviewing...', spinning: true },
  'review-posted': { icon: '\u2713', color: 'magenta', label: 'Reviewed', spinning: false },
  'pr-created': { icon: '\u2713', color: 'green', label: 'PR created', spinning: false },
  failed: { icon: '\u2717', color: 'red', label: 'Failed', spinning: false },
  stopped: { icon: '\u23F9', color: 'yellow', label: 'Stopped', spinning: false },
  abandoned: { icon: '\u25CC', color: 'gray', label: 'Deleted', spinning: false },
};

function formatElapsed(startedAt?: number, completedAt?: number): string {
  if (!startedAt) return '';
  const end = completedAt ?? Date.now();
  const seconds = Math.floor((end - startedAt) / 1000);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function IssueRow({ tracked, focused, expanded, isHistory }: Props) {
  const { issue, status, startedAt, completedAt, prUrl } = tracked;
  const display = STATUS_DISPLAY[status];
  const dim = isHistory && status !== 'failed';

  const timeDisplay = isHistory && completedAt
    ? formatRelativeTime(completedAt)
    : formatElapsed(startedAt, completedAt);

  return (
    <Box>
      <Text color={focused ? 'cyan' : undefined} dimColor={dim}>
        {focused ? (expanded ? ' \u25BC ' : ' \u25B6 ') : '   '}
      </Text>
      <Box width={12}>
        <Text bold={focused} color={focused ? 'cyan' : undefined} dimColor={dim}>
          {issue.identifier.startsWith('PR-') ? `PR #${issue.identifier.slice(3)}` : issue.identifier}
        </Text>
      </Box>
      <Box flexGrow={1}>
        <Text wrap="truncate" dimColor={!focused || dim}>
          {issue.title}
        </Text>
      </Box>
      <Box width={20} justifyContent="flex-end">
        {display.spinning ? (
          <Text color={display.color}>
            <Spinner type="dots" /> {display.label}
          </Text>
        ) : (
          <Text color={display.color}>
            {display.icon} {prUrl ? 'PR created' : display.label}
          </Text>
        )}
      </Box>
      <Box width={10} justifyContent="flex-end">
        <Text dimColor>{timeDisplay}</Text>
      </Box>
    </Box>
  );
}
