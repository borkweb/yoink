import type { TrackedIssue } from '../../../src/types';
import { mapStatus } from '../lib/statusMap';

interface Props {
  issues: TrackedIssue[];
  title: string;
  polling: boolean;
  nextPollAt: number | null;
}

export function TopBar({ issues, title, polling, nextPollAt }: Props) {
  const counts = {
    running: issues.filter((i) => mapStatus(i.status) === 'running').length,
    completed: issues.filter((i) => mapStatus(i.status) === 'completed').length,
    failed: issues.filter((i) => mapStatus(i.status) === 'failed' || mapStatus(i.status) === 'stopped').length,
    queued: issues.filter((i) => mapStatus(i.status) === 'queued').length,
  };

  return (
    <div className="flex justify-between items-center px-5 py-2.5 border-b border-[#1A1A1A] bg-[#080808]">
      <div className="flex items-baseline gap-3">
        <span className="text-xl font-black text-[#F5F5F5] tracking-tight">yoink</span>
        {title && <span className="text-[11px] text-[#404040]">{title}</span>}
      </div>

      <div className="flex items-center gap-5 text-[11px]">
        <div className="flex gap-3.5">
          <span>
            <span className="text-[#22D3EE]">{counts.running}</span>{' '}
            <span className="text-[#404040]">running</span>
          </span>
          <span>
            <span className="text-[#4ADE80]">{counts.completed}</span>{' '}
            <span className="text-[#404040]">done</span>
          </span>
          <span>
            <span className="text-[#F87171]">{counts.failed}</span>{' '}
            <span className="text-[#404040]">needs attention</span>
          </span>
          <span>
            <span className="text-[#818CF8]">{counts.queued}</span>{' '}
            <span className="text-[#404040]">queued</span>
          </span>
        </div>

        <div className="w-px h-4 bg-[#1A1A1A]" />

        {polling && (
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#4ADE80] animate-pulse" />
            <span className="text-[#525252]">polling</span>
          </div>
        )}
      </div>
    </div>
  );
}
