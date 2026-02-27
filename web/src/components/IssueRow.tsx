import type { TrackedIssue } from '../../../src/types';
import { StatusPill } from './StatusPill';
import { mapStatus } from '../lib/statusMap';
import { formatElapsed } from '../lib/formatElapsed';

interface Props {
  issue: TrackedIssue;
  isSelected: boolean;
  onClick: () => void;
  onAction: (action: string, identifier: string, startedAt?: number) => void;
}

export function IssueRow({ issue, isSelected, onClick, onAction }: Props) {
  const display = mapStatus(issue.status);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <div
      role="row"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      aria-expanded={isSelected}
      aria-label={`${issue.issue.identifier}: ${issue.issue.title}, ${display}`}
      className="grid items-start cursor-pointer transition-all duration-150 border-b border-[var(--border-primary)] rounded-sm"
      style={{
        gridTemplateColumns: '80px 1fr 120px 70px',
        padding: '10px 14px',
        background: isSelected ? 'var(--bg-hover)' : 'transparent',
        borderLeft: isSelected ? '2px solid var(--accent)' : '2px solid transparent',
      }}
      onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-hover)'; }}
      onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = isSelected ? 'var(--bg-hover)' : 'transparent'; }}
    >
      <span role="cell" className="text-xs">
        {issue.issue.identifier.startsWith('PR-')
          ? issue.prUrl
            ? <a href={issue.prUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--text-subtle)] hover:text-[var(--accent)] hover:underline" onClick={(e) => e.stopPropagation()}>PR #{issue.issue.identifier.slice(3)}</a>
            : <span className="text-[var(--text-subtle)]">PR #{issue.issue.identifier.slice(3)}</span>
          : issue.issue.url
            ? <a href={issue.issue.url} target="_blank" rel="noopener noreferrer" className="text-[var(--text-subtle)] hover:text-[var(--accent)] hover:underline" onClick={(e) => e.stopPropagation()}>{issue.issue.identifier}</a>
            : <span className="text-[var(--text-subtle)]">{issue.issue.identifier}</span>
        }
      </span>
      <span role="cell" className="pr-3 min-w-0">
        <span className="text-[var(--text-secondary)] text-[12.5px] whitespace-nowrap overflow-hidden text-ellipsis block">
          {issue.issue.title}
        </span>
        {display === 'running' && (
          <span className="flex gap-1 mt-1">
            <button
              onClick={(e) => { e.stopPropagation(); onAction('stopIssue', issue.issue.identifier, issue.startedAt); }}
              aria-label={`Stop ${issue.issue.identifier}`}
              className="px-2 py-0.5 text-[10px] rounded cursor-pointer bg-[var(--btn-danger-bg)] border border-[var(--btn-danger-border)] text-[var(--btn-danger-text)]"
            >
              stop
            </button>
          </span>
        )}
        {(display === 'failed' || display === 'stopped') && (
          <span className="flex gap-1 mt-1">
            <button
              onClick={(e) => { e.stopPropagation(); onAction('retryIssue', issue.issue.identifier, issue.startedAt); }}
              aria-label={`Retry ${issue.issue.identifier}`}
              className="px-2 py-0.5 text-[10px] rounded cursor-pointer bg-[var(--btn-secondary-bg)] border border-[var(--btn-secondary-border)] text-[var(--btn-secondary-text)]"
            >
              retry
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onAction('continueIssue', issue.issue.identifier, issue.startedAt); }}
              aria-label={`Continue ${issue.issue.identifier}`}
              className="px-2 py-0.5 text-[10px] rounded cursor-pointer bg-[var(--btn-secondary-bg)] border border-[var(--btn-secondary-border)] text-[var(--btn-secondary-text)]"
            >
              cont
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onAction('deleteIssue', issue.issue.identifier, issue.startedAt); }}
              aria-label={`Delete ${issue.issue.identifier}`}
              className="px-2 py-0.5 text-[10px] rounded cursor-pointer bg-[var(--btn-danger-bg)] border border-[var(--btn-danger-border)] text-[var(--btn-danger-text)]"
            >
              delete
            </button>
          </span>
        )}
      </span>
      <span role="cell">
        <StatusPill status={issue.status} prUrl={issue.prUrl} />
      </span>
      <span role="cell" className="text-[var(--text-faint)] text-[11px] text-right">
        {formatElapsed(issue.startedAt, issue.completedAt)}
      </span>
    </div>
  );
}
