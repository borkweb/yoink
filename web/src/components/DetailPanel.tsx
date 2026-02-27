import type { TrackedIssue } from '../../../src/types';
import { mapStatus, STATUS_CONFIG } from '../lib/statusMap';
import { formatElapsed } from '../lib/formatElapsed';
import { LogViewer } from './LogViewer';

export function DetailPanel({ issue, onClose }: { issue: TrackedIssue; onClose: () => void }) {
  const display = mapStatus(issue.status);
  const cfg = STATUS_CONFIG[display];

  const branch = issue.worktreeDir
    ? issue.worktreeDir.split('/').pop()
    : null;

  const resumeCmd = issue.sessionId ? `claude --resume ${issue.sessionId}` : null;

  return (
    <section
      className="bg-[var(--bg-surface)]"
      style={{ borderTop: `1px solid color-mix(in srgb, ${cfg.color} 20%, transparent)` }}
      aria-label={`Details for ${issue.issue.identifier}`}
    >
      {/* Header */}
      <div className="flex justify-between items-start px-[18px] pt-3.5 pb-2.5 border-b border-[var(--border-primary)]">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <a href={issue.issue.url} target="_blank" rel="noopener noreferrer" className="text-[13px] font-bold hover:underline" style={{ color: cfg.color }}>{issue.issue.identifier}</a>
            <span className="text-[13px] text-[var(--text-tertiary)]">{issue.issue.title}</span>
          </div>
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
        <div role="alert" className="mx-[18px] mt-2.5 px-3 py-2 bg-[var(--error-bg)] border border-[var(--error-border)] rounded text-xs text-[var(--error-text)]">
          {issue.error}
        </div>
      )}

      {/* Resume command */}
      {resumeCmd && (
        <div className="mx-[18px] mt-2 px-3 py-2 bg-[var(--bg-inset)] border border-[var(--border-secondary)] rounded text-[11px] text-[var(--text-muted)] flex justify-between items-center">
          <span>
            <span className="text-[var(--text-faint)]" aria-hidden="true">$</span> <code>{resumeCmd}</code>
          </span>
          <button
            onClick={() => navigator.clipboard.writeText(resumeCmd)}
            aria-label="Copy resume command to clipboard"
            className="px-2 py-0.5 text-[10px] rounded cursor-pointer bg-[var(--btn-secondary-bg)] border border-[var(--btn-secondary-border)] text-[var(--btn-secondary-text)]"
          >
            copy
          </button>
        </div>
      )}

      {/* Logs */}
      <div className="px-[18px] pt-3 pb-4">
        <LogViewer logs={issue.logs} />
      </div>
    </section>
  );
}
