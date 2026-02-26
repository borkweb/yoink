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

  return (
    <div
      onClick={onClick}
      className="grid items-center cursor-pointer transition-all duration-150 border-b border-[#1A1A1A]"
      style={{
        gridTemplateColumns: '28px 80px 1fr 80px 70px 80px',
        padding: '10px 14px',
        background: isSelected ? '#141414' : 'transparent',
        borderLeft: isSelected ? `2px solid ${PRIORITY_CONFIG[issue.issue.priority]?.color ?? '#525252'}` : '2px solid transparent',
      }}
      onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = '#0D0D0D'; }}
      onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = isSelected ? '#141414' : 'transparent'; }}
    >
      <span className="text-[11px] font-extrabold" style={{ color: pri.color }}>
        {pri.icon}
      </span>
      <span className="text-[#737373] text-xs">{issue.issue.identifier}</span>
      <span className="text-[#E5E5E5] text-[12.5px] whitespace-nowrap overflow-hidden text-ellipsis pr-3">
        {issue.issue.title}
      </span>
      <StatusPill status={issue.status} />
      <span className="text-[#525252] text-[11px] text-right">
        {formatElapsed(issue.startedAt, issue.completedAt)}
      </span>
      <div className="flex justify-end gap-1">
        {display === 'running' && (
          <button
            onClick={(e) => { e.stopPropagation(); onAction('stopIssue', issue.issue.identifier); }}
            className="px-2 py-0.5 text-[10px] rounded cursor-pointer bg-[#7F1D1D] border border-[#991B1B] text-[#FCA5A5]"
          >
            stop
          </button>
        )}
        {(display === 'failed' || display === 'stopped') && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); onAction('retryIssue', issue.issue.identifier); }}
              className="px-2 py-0.5 text-[10px] rounded cursor-pointer bg-[#1C1917] border border-[#44403C] text-[#A8A29E]"
            >
              retry
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onAction('continueIssue', issue.issue.identifier); }}
              className="px-2 py-0.5 text-[10px] rounded cursor-pointer bg-[#1C1917] border border-[#44403C] text-[#A8A29E]"
            >
              cont
            </button>
          </>
        )}
      </div>
    </div>
  );
}
