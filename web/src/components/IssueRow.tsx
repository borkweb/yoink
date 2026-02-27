import type { TrackedIssue } from '../../../src/types';
import { StatusPill } from './StatusPill';
import { PRIORITY_CONFIG, mapStatus } from '../lib/statusMap';
import { formatElapsed } from '../lib/formatElapsed';

interface Props {
  issue: TrackedIssue;
  isSelected: boolean;
  onClick: () => void;
  onAction: (action: string, identifier: string) => void;
}

export function IssueRow({ issue, isSelected, onClick, onAction }: Props) {
  const pri = PRIORITY_CONFIG[issue.issue.priority] ?? PRIORITY_CONFIG[0];
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
      className="grid items-center cursor-pointer transition-all duration-150 border-b border-[var(--border-primary)] rounded-sm"
      style={{
        gridTemplateColumns: '28px 80px 1fr 120px 70px 80px',
        padding: '10px 14px',
        background: isSelected ? 'var(--bg-hover)' : 'transparent',
        borderLeft: isSelected ? `2px solid ${PRIORITY_CONFIG[issue.issue.priority]?.color ?? 'var(--text-faint)'}` : '2px solid transparent',
      }}
      onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-hover)'; }}
      onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = isSelected ? 'var(--bg-hover)' : 'transparent'; }}
    >
      <span role="cell" className="text-[11px] font-extrabold" style={{ color: pri.color }}>
        {pri.icon}
      </span>
      <span role="cell" className="text-[var(--text-subtle)] text-xs">{issue.issue.identifier}</span>
      <span role="cell" className="text-[var(--text-secondary)] text-[12.5px] whitespace-nowrap overflow-hidden text-ellipsis pr-3">
        {issue.issue.title}
      </span>
      <span role="cell">
        <StatusPill status={issue.status} />
      </span>
      <span role="cell" className="text-[var(--text-faint)] text-[11px] text-right">
        {formatElapsed(issue.startedAt, issue.completedAt)}
      </span>
      <div role="cell" className="flex justify-end gap-1">
        {display === 'running' && (
          <button
            onClick={(e) => { e.stopPropagation(); onAction('stopIssue', issue.issue.identifier); }}
            aria-label={`Stop ${issue.issue.identifier}`}
            className="px-2 py-0.5 text-[10px] rounded cursor-pointer bg-[var(--btn-danger-bg)] border border-[var(--btn-danger-border)] text-[var(--btn-danger-text)]"
          >
            stop
          </button>
        )}
        {(display === 'failed' || display === 'stopped') && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); onAction('retryIssue', issue.issue.identifier); }}
              aria-label={`Retry ${issue.issue.identifier}`}
              className="px-2 py-0.5 text-[10px] rounded cursor-pointer bg-[var(--btn-secondary-bg)] border border-[var(--btn-secondary-border)] text-[var(--btn-secondary-text)]"
            >
              retry
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onAction('continueIssue', issue.issue.identifier); }}
              aria-label={`Continue ${issue.issue.identifier}`}
              className="px-2 py-0.5 text-[10px] rounded cursor-pointer bg-[var(--btn-secondary-bg)] border border-[var(--btn-secondary-border)] text-[var(--btn-secondary-text)]"
            >
              cont
            </button>
          </>
        )}
      </div>
    </div>
  );
}
