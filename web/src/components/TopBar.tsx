import { useState } from 'react';
import type { TrackedIssue } from '../../../src/types';
import { mapStatus } from '../lib/statusMap';

interface Props {
  issues: TrackedIssue[];
  title: string;
  paused: boolean;
  isDark: boolean;
  onToggleTheme: () => void;
  onTogglePause: () => void;
}

export function TopBar({ issues, title, paused, isDark, onToggleTheme, onTogglePause }: Props) {
  const [hovered, setHovered] = useState(false);

  const runningStatuses = ['creating-worktree', 'running-claude', 'pushing', 'reviewing'];
  const doneStatuses = ['pr-created', 'review-posted'];
  const attentionStatuses = ['failed', 'stopped'];
  const counts = {
    running: issues.filter((i) => runningStatuses.includes(mapStatus(i.status))).length,
    completed: issues.filter((i) => doneStatuses.includes(mapStatus(i.status))).length,
    failed: issues.filter((i) => attentionStatuses.includes(mapStatus(i.status))).length,
    queued: issues.filter((i) => mapStatus(i.status) === 'queued').length,
  };

  const label = paused ? (hovered ? 'resume' : 'paused') : (hovered ? 'pause' : 'polling');

  return (
    <header className="flex justify-between items-center px-5 py-2.5 border-b border-[var(--border-primary)] bg-[var(--bg-chrome)]">
      <div className="flex items-baseline gap-3">
        <span className="text-xl font-black text-[var(--text-primary)] tracking-tight">yoink</span>
        {title && <span className="text-[11px] text-[var(--text-dimmed)]">{title}</span>}
      </div>

      <div className="flex items-center gap-5 text-[11px]">
        <div className="flex gap-3.5">
          <span>
            <span className="text-[var(--status-running)]">{counts.running}</span>{' '}
            <span className="text-[var(--text-dimmed)]">running</span>
          </span>
          <span>
            <span className="text-[var(--status-completed)]">{counts.completed}</span>{' '}
            <span className="text-[var(--text-dimmed)]">done</span>
          </span>
          <span>
            <span className="text-[var(--status-failed)]">{counts.failed}</span>{' '}
            <span className="text-[var(--text-dimmed)]">needs attention</span>
          </span>
          <span>
            <span className="text-[var(--status-queued)]">{counts.queued}</span>{' '}
            <span className="text-[var(--text-dimmed)]">queued</span>
          </span>
        </div>

        <div className="w-px h-4 bg-[var(--border-primary)]" aria-hidden="true" />

        <button
          onClick={onTogglePause}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          aria-label={paused ? 'Resume polling' : 'Pause polling'}
          className="flex items-center gap-1.5 bg-transparent border-none cursor-pointer p-0 text-[11px] w-[60px]"
        >
          <span
            className="text-[10px] leading-none"
            style={{ color: paused ? 'var(--text-faint)' : 'var(--status-completed)' }}
            aria-hidden="true"
          >{paused ? '⏸' : '▶'}</span>
          <span className="text-[var(--text-faint)]">{label}</span>
        </button>

        <button
          onClick={onToggleTheme}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer bg-transparent border-none text-sm leading-none p-1 rounded"
        >
          {isDark ? '☀' : '☾'}
        </button>
      </div>
    </header>
  );
}
