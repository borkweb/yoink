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
    <div className="bg-[#0A0A0A]" style={{ borderTop: `1px solid ${cfg.color}33` }}>
      {/* Header */}
      <div className="flex justify-between items-start px-[18px] pt-3.5 pb-2.5 border-b border-[#1A1A1A]">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <span className="text-[13px] font-bold" style={{ color: cfg.color }}>
              {issue.issue.identifier}
            </span>
            <span className="text-[13px] text-[#D4D4D4]">{issue.issue.title}</span>
          </div>
          <div className="flex gap-4 text-[11px] text-[#525252]">
            {branch && (
              <span>
                <span className="text-[#404040]">branch</span>{' '}
                <span className="text-[#818CF8]">{branch}</span>
              </span>
            )}
            {issue.prNumber && (
              <span>
                <span className="text-[#404040]">pr</span>{' '}
                <a
                  href={issue.prUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#4ADE80] hover:underline"
                >
                  #{issue.prNumber}
                </a>
              </span>
            )}
            <span>
              <span className="text-[#404040]">elapsed</span>{' '}
              <span className="text-[#A3A3A3]">
                {formatElapsed(issue.startedAt, issue.completedAt)}
              </span>
            </span>
            {issue.issue.url && (
              <a
                href={issue.issue.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#404040] hover:text-[#737373]"
              >
                Linear →
              </a>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-[#525252] text-lg cursor-pointer bg-transparent border-none leading-none px-1"
        >
          ×
        </button>
      </div>

      {/* Error banner */}
      {issue.error && (
        <div className="mx-[18px] mt-2.5 px-3 py-2 bg-[#450A0A] border border-[#7F1D1D] rounded text-xs text-[#FCA5A5]">
          {issue.error}
        </div>
      )}

      {/* Resume command */}
      {resumeCmd && (
        <div className="mx-[18px] mt-2 px-3 py-2 bg-[#111111] border border-[#262626] rounded text-[11px] text-[#A3A3A3] flex justify-between items-center">
          <span>
            <span className="text-[#525252]">$</span> {resumeCmd}
          </span>
          <button
            onClick={() => navigator.clipboard.writeText(resumeCmd)}
            className="px-2 py-0.5 text-[10px] rounded cursor-pointer bg-[#1C1917] border border-[#44403C] text-[#A8A29E]"
          >
            copy
          </button>
        </div>
      )}

      {/* Logs */}
      <div className="px-[18px] pt-3 pb-4">
        <LogViewer logs={issue.logs} />
      </div>
    </div>
  );
}
