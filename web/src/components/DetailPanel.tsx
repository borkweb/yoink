import type { TrackedIssue } from '../../../src/types';
import { formatElapsed } from '../lib/formatElapsed';
import { LogViewer } from './LogViewer';

function normalizePath(p: string): string {
  const parts = p.split('/');
  const out: string[] = [];
  for (const part of parts) {
    if (part === '..') out.pop();
    else if (part !== '.') out.push(part);
  }
  return out.join('/');
}

function buildResumeCmd(tracked: TrackedIssue): string | null {
  if (!tracked.sessionId) return null;
  const resume = `claude --resume ${tracked.sessionId}`;
  if (!tracked.worktreeDir) return resume;
  return `cd ${normalizePath(tracked.worktreeDir)} && ${resume}`;
}

interface DetailPanelProps {
  issue: TrackedIssue;
  onClose: () => void;
  onOpenTerminal?: (command: string) => void;
}

export function DetailPanel({ issue, onClose, onOpenTerminal }: DetailPanelProps) {
  const branch = issue.worktreeDir
    ? issue.worktreeDir.split('/').pop()
    : null;

  const resumeCmd = buildResumeCmd(issue);

  return (
    <section
      className="bg-[var(--bg-hover)] border-b border-[var(--border-primary)]"
      style={{ borderLeft: '2px solid var(--accent)' }}
      aria-label={`Details for ${issue.issue.identifier}`}
    >
      {/* Metadata bar */}
      <div className="flex justify-between items-center px-5 pt-2.5 pb-2">
        <div className="flex gap-4 text-[11px] text-[var(--text-faint)]">
          {branch && (
            <span>
              <span className="text-[var(--text-dimmed)]">branch</span>{' '}
              <span className="text-[var(--status-queued)]">{branch}</span>
            </span>
          )}
          {issue.prNumber && (
            <span>
              <span className="text-[var(--text-dimmed)]">pr</span>{' '}
              <a
                href={issue.prUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--status-completed)] hover:underline"
              >
                #{issue.prNumber}
              </a>
            </span>
          )}
          <span>
            <span className="text-[var(--text-dimmed)]">elapsed</span>{' '}
            <span className="text-[var(--text-muted)]">
              {formatElapsed(issue.startedAt, issue.completedAt)}
            </span>
          </span>
          {issue.issue.url && (
            <a
              href={issue.issue.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--text-dimmed)] hover:text-[var(--text-subtle)]"
            >
              Linear →
            </a>
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="Close details panel"
          className="text-[var(--text-faint)] text-lg cursor-pointer bg-transparent border-none leading-none px-1 rounded"
        >
          ×
        </button>
      </div>

      {/* Error banner */}
      {issue.error && (
        <div role="alert" className="mx-5 mt-2.5 px-3 py-2 bg-[var(--error-bg)] border border-[var(--error-border)] rounded text-xs text-[var(--error-text)]">
          {issue.error}
        </div>
      )}

      {/* Resume command */}
      {resumeCmd && (
        <div className="mx-5 mt-2 px-3 py-2 bg-[var(--bg-inset)] border border-[var(--border-secondary)] rounded text-[11px] text-[var(--text-muted)] flex justify-between items-center">
          <span>
            <span className="text-[var(--text-faint)]" aria-hidden="true">$</span> <code>{resumeCmd}</code>
          </span>
          <span className="flex gap-1">
            {onOpenTerminal && (
              <button
                onClick={() => onOpenTerminal(resumeCmd)}
                aria-label="Open resume command in terminal"
                className="px-2 py-0.5 text-[10px] rounded cursor-pointer bg-[var(--btn-secondary-bg)] border border-[var(--btn-secondary-border)] text-[var(--btn-secondary-text)]"
              >
                open
              </button>
            )}
            <button
              onClick={() => navigator.clipboard.writeText(resumeCmd)}
              aria-label="Copy resume command to clipboard"
              className="px-2 py-0.5 text-[10px] rounded cursor-pointer bg-[var(--btn-secondary-bg)] border border-[var(--btn-secondary-border)] text-[var(--btn-secondary-text)]"
            >
              copy
            </button>
          </span>
        </div>
      )}

      {/* Logs */}
      <div className="px-5 pt-3 pb-4">
        <LogViewer logs={issue.logs} />
      </div>
    </section>
  );
}
