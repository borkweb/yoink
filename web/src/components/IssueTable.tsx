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
    <div role="table" aria-label="Issues">
      {/* Column headers */}
      <div
        role="row"
        className="grid text-[10px] text-[var(--text-dimmed)] uppercase tracking-wider border-b border-[var(--border-subtle)] bg-[var(--bg-chrome)] sticky top-0 z-10"
        style={{
          gridTemplateColumns: '28px 80px 1fr 120px 70px 80px',
          padding: '6px 14px',
        }}
      >
        <span role="columnheader">P</span>
        <span role="columnheader">Issue</span>
        <span role="columnheader">Title</span>
        <span role="columnheader">Status</span>
        <span role="columnheader" className="text-right">Time</span>
        <span role="columnheader" className="text-right">Actions</span>
      </div>

      {/* Rows */}
      {issues.map((issue) => (
        <div key={issue.issue.identifier} role="rowgroup">
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
