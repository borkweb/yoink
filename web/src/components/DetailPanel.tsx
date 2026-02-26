import type { TrackedIssue } from '../../../src/types';

export function DetailPanel({ issue, onClose }: { issue: TrackedIssue; onClose: () => void }) {
  return (
    <div className="p-4 bg-[#0A0A0A] border-t border-[#1A1A1A]">
      <div className="flex justify-between">
        <span className="text-xs text-[#525252]">Detail panel — {issue.issue.identifier}</span>
        <button onClick={onClose} className="text-[#525252] cursor-pointer">×</button>
      </div>
    </div>
  );
}
