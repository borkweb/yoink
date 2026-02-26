import type { TrackedIssue } from '../../../src/types';
import { mapStatus } from '../lib/statusMap';

interface Props {
  issues: TrackedIssue[];
  title: string;
  polling: boolean;
  nextPollAt: number | null;
  isDark: boolean;
  onToggleTheme: () => void;
}

export function TopBar({ issues, title, polling, isDark, onToggleTheme }: Props) {
  const counts = {
    running: issues.filter((i) => mapStatus(i.status) === 'running').length,
    completed: issues.filter((i) => mapStatus(i.status) === 'completed').length,
    failed: issues.filter((i) => mapStatus(i.status) === 'failed' || mapStatus(i.status) === 'stopped').length,
    queued: issues.filter((i) => mapStatus(i.status) === 'queued').length,
  };

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

        {polling && (
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--status-completed)] animate-pulse" aria-hidden="true" />
            <span className="text-[var(--text-faint)]">polling</span>
          </div>
        )}

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
