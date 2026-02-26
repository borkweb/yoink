import { useState } from 'react';
import type { TrackedIssue } from '../../../src/types';
import { IssueRow } from './IssueRow';
import { DetailPanel } from './DetailPanel';

interface Props {
  issues: TrackedIssue[];
  onAction: (action: string, identifier: string) => void;
}

export function IssueTable({ issues, onAction }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <div>
      {/* Column headers */}
      <div
        className="grid text-[10px] text-[#404040] uppercase tracking-wider border-b border-[#141414] bg-[#080808] sticky top-0 z-10"
        style={{
          gridTemplateColumns: '28px 80px 1fr 80px 70px 80px',
          padding: '6px 14px',
        }}
      >
        <span>P</span>
        <span>Issue</span>
        <span>Title</span>
        <span>Status</span>
        <span className="text-right">Time</span>
        <span className="text-right">Actions</span>
      </div>

      {/* Rows */}
      {issues.map((issue) => (
        <div key={issue.issue.identifier}>
          <IssueRow
            issue={issue}
            isSelected={selectedId === issue.issue.identifier}
            onClick={() => setSelectedId(
              selectedId === issue.issue.identifier ? null : issue.issue.identifier
            )}
            onAction={onAction}
          />
          {selectedId === issue.issue.identifier && (
            <DetailPanel issue={issue} onClose={() => setSelectedId(null)} />
          )}
        </div>
      ))}
    </div>
  );
}
