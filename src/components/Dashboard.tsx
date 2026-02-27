import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import TextInput from 'ink-text-input';
import type { TrackedIssue } from '../types';
import type { YoinkEngine, YoinkState } from '../engine';
import { parsePRInput } from '../lib/pr';
import { IssueRow } from './IssueRow';
import { LogPanel } from './LogPanel';
import { StatusBar } from './StatusBar';

interface Props {
  engine: YoinkEngine;
}

export function Dashboard({ engine }: Props) {
  const { exit } = useApp();
  const [state, setState] = useState<YoinkState>(engine.getState());
  const [focusIndex, setFocusIndex] = useState(0);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [startedAt] = useState(Date.now());
  const [, setTick] = useState(0);
  const [autoExpanded, setAutoExpanded] = useState(false);
  const [reviewMode, setReviewMode] = useState(false);
  const [reviewInput, setReviewInput] = useState('');
  const [reviewError, setReviewError] = useState<string | null>(null);

  const { paused, done, title, dryRun, nextPollAt } = state;
  const issues = state.issues.filter((i) => i.status !== 'abandoned');

  useEffect(() => {
    const handler = (newState: YoinkState) => setState(newState);
    engine.on('state:changed', handler);
    return () => { engine.off('state:changed', handler); };
  }, [engine]);

  // Tick for elapsed time updates
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  // Auto-expand first failed history issue on startup
  useEffect(() => {
    if (!autoExpanded && issues.length > 0) {
      const firstFailed = issues.findIndex((i) => i.isHistory && i.status === 'failed');
      if (firstFailed >= 0) {
        setFocusIndex(firstFailed);
        setExpandedIndex(firstFailed);
      }
      setAutoExpanded(true);
    }
  }, [issues, autoExpanded]);

  const handleReviewSubmit = useCallback(
    (value: string) => {
      const parsed = parsePRInput(value);
      if (!parsed) {
        setReviewError('Invalid input — enter a PR URL or number');
        return;
      }

      setReviewMode(false);
      setReviewInput('');
      setReviewError(null);

      engine.reviewPR({
        prNumber: parsed.prNumber,
        repoSlug: parsed.repoSlug,
      }).catch((err: Error) => {
        setReviewError(err.message);
        setTimeout(() => setReviewError(null), 5000);
      });
    },
    [engine]
  );

  useInput(
    useCallback(
      (input: string, key: any) => {
        if (input === 'q') {
          engine.killActiveProcesses();
          exit();
          return;
        }

        if (reviewMode) {
          if (key.escape) {
            setReviewMode(false);
            setReviewInput('');
            setReviewError(null);
          }
          return;
        }

        if (input === 'p') {
          if (paused) {
            engine.resume();
          } else {
            engine.pause();
          }
          return;
        }

        if (input === 's') {
          const selected = issues[focusIndex];
          if (selected && ['running-claude', 'creating-worktree', 'pushing'].includes(selected.status)) {
            engine.stopIssue(selected.issue.identifier, selected.startedAt);
          }
          return;
        }

        if (input === 'r') {
          const selected = issues[focusIndex];
          if (selected?.status === 'failed' || selected?.status === 'stopped') {
            engine.retryIssue(selected.issue.identifier, selected.startedAt);
          }
          return;
        }

        if (input === 'c') {
          const selected = issues[focusIndex];
          if (selected?.status === 'failed' || selected?.status === 'stopped') {
            engine.continueIssue(selected.issue.identifier, selected.startedAt);
          }
          return;
        }

        if (input === 'd') {
          const selected = issues[focusIndex];
          if (selected?.status === 'failed' || selected?.status === 'stopped') {
            engine.deleteIssue(selected.issue.identifier, selected.startedAt);
          }
          return;
        }

        if (input === 'v') {
          setReviewMode(true);
          setReviewInput('');
          setReviewError(null);
          return;
        }

        if (input === 'j' || key.downArrow) {
          setFocusIndex((i) => Math.min(i + 1, issues.length - 1));
        }

        if (input === 'k' || key.upArrow) {
          setFocusIndex((i) => Math.max(i - 1, 0));
        }

        if (key.return) {
          setExpandedIndex((current) => (current === focusIndex ? null : focusIndex));
        }
      },
      [focusIndex, issues, paused, engine, exit, reviewMode]
    )
  );

  const terminalStatuses = ['pr-created', 'review-posted', 'failed', 'stopped'];
  const historyIssues = issues.filter((i) => i.isHistory || terminalStatuses.includes(i.status));
  const newIssues = issues.filter((i) => !i.isHistory && !terminalStatuses.includes(i.status));
  const projects = [...new Set(newIssues.map((i) => i.project))];
  const multiProject = projects.length > 1;

  const renderRow = (tracked: TrackedIssue, globalIdx: number, asHistory?: boolean) => (
    <React.Fragment key={`${tracked.issue.identifier}:${tracked.startedAt ?? 0}`}>
      <IssueRow
        tracked={tracked}
        focused={globalIdx === focusIndex}
        expanded={globalIdx === expandedIndex}
        isHistory={asHistory ?? tracked.isHistory}
      />
      {globalIdx === expandedIndex && <LogPanel tracked={tracked} />}
    </React.Fragment>
  );

  return (
    <Box flexDirection="column" paddingX={2}>
      {/* Header */}
      <Box marginBottom={1} justifyContent="space-between">
        <Text bold color="cyan">
          {title}
        </Text>
        {done && <Text color="green" bold>Complete</Text>}
        {dryRun && <Text color="yellow" bold>DRY RUN</Text>}
      </Box>

      {/* Issue table */}
      <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingLeft={1} paddingRight={1}>
        {/* History section */}
        {historyIssues.length > 0 && (
          <Box flexDirection="column">
            <Box>
              <Text dimColor bold>Recent (last 24h)</Text>
            </Box>
            {historyIssues.map((tracked) => renderRow(tracked, issues.indexOf(tracked), true))}
          </Box>
        )}

        {/* Separator between sections */}
        {historyIssues.length > 0 && newIssues.length > 0 && (
          <Box>
            <Text dimColor>{'\u2500'.repeat(40)}</Text>
          </Box>
        )}

        {/* New issues section */}
        {multiProject
          ? projects.map((proj) => {
              const projIssues = newIssues.filter((i) => i.project === proj);

              return (
                <Box key={proj} flexDirection="column">
                  <Box>
                    <Text dimColor bold>{proj}</Text>
                  </Box>
                  {projIssues.map((tracked) => {
                    const globalIdx = issues.indexOf(tracked);
                    return renderRow(tracked, globalIdx);
                  })}
                </Box>
              );
            })
          : newIssues.map((tracked) => {
              const globalIdx = issues.indexOf(tracked);
              return renderRow(tracked, globalIdx);
            })}
      </Box>

      {/* Review input */}
      {reviewMode && (
        <Box marginTop={1}>
          <Text bold color="magenta">Review PR: </Text>
          <TextInput
            value={reviewInput}
            onChange={setReviewInput}
            onSubmit={handleReviewSubmit}
            placeholder="PR URL or number (Esc to cancel)"
          />
        </Box>
      )}
      {reviewError && (
        <Box>
          <Text color="red">{reviewError}</Text>
        </Box>
      )}

      {/* Status bar */}
      <StatusBar
        issues={issues}
        paused={paused}
        startedAt={startedAt}
        nextPollAt={nextPollAt}
      />
    </Box>
  );
}
