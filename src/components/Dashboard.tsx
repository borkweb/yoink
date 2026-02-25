import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import type { TrackedIssue } from '../types';
import type { Processor, ProcessorEvent } from '../services/processor';
import { IssueRow } from './IssueRow';
import { LogPanel } from './LogPanel';
import { StatusBar } from './StatusBar';

interface Props {
  processor: Processor;
  title: string;
  dryRun?: boolean;
}

export function Dashboard({ processor, title, dryRun }: Props) {
  const { exit } = useApp();
  const [issues, setIssues] = useState<TrackedIssue[]>(processor.getIssues());
  const [focusIndex, setFocusIndex] = useState(0);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const [nextPollAt, setNextPollAt] = useState<number | null>(null);
  const [startedAt] = useState(Date.now());
  const [, setTick] = useState(0);
  const [autoExpanded, setAutoExpanded] = useState(false);

  useEffect(() => {
    const handler = (event: ProcessorEvent) => {
      if (event.type === 'update') {
        setIssues(event.issues);
      } else if (event.type === 'done') {
        setDone(true);
      } else if (event.type === 'polling') {
        setNextPollAt(event.nextPollAt);
      }
    };
    processor.on(handler);
  }, [processor]);

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

  useInput(
    useCallback(
      (input: string, key: any) => {
        if (input === 'q') {
          processor.gracefulShutdown().then(() => exit());
          return;
        }

        if (input === 'p') {
          if (processor.isPaused()) {
            processor.resume();
          } else {
            processor.pause();
            setNextPollAt(null);
          }
          return;
        }

        if (input === 'r') {
          const selected = issues[focusIndex];
          if (selected?.status === 'failed') {
            processor.retryIssue(selected.issue.identifier);
          }
          return;
        }

        if (input === 'c') {
          const selected = issues[focusIndex];
          if (selected?.status === 'failed') {
            processor.continueIssue(selected.issue.identifier);
          }
          return;
        }

        if (input === 'd') {
          const selected = issues[focusIndex];
          if (selected?.status === 'failed') {
            processor.deleteIssue(selected.issue.identifier);
          }
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
      [focusIndex, issues, processor, exit]
    )
  );

  const historyIssues = issues.filter((i) => i.isHistory);
  const newIssues = issues.filter((i) => !i.isHistory);
  const projects = [...new Set(newIssues.map((i) => i.project))];
  const multiProject = projects.length > 1;

  const renderRow = (tracked: TrackedIssue, globalIdx: number) => (
    <React.Fragment key={tracked.issue.identifier}>
      <IssueRow
        tracked={tracked}
        focused={globalIdx === focusIndex}
        expanded={globalIdx === expandedIndex}
        isHistory={tracked.isHistory}
      />
      {globalIdx === expandedIndex && <LogPanel tracked={tracked} />}
    </React.Fragment>
  );

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box marginBottom={1} justifyContent="space-between">
        <Text bold color="cyan">
          {' '}yoink — {title}
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
            {historyIssues.map((tracked) => renderRow(tracked, issues.indexOf(tracked)))}
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

      {/* Status bar */}
      <StatusBar
        issues={issues}
        paused={processor.isPaused()}
        startedAt={startedAt}
        nextPollAt={nextPollAt}
      />
    </Box>
  );
}
