interface Props {
  onReviewPR: () => void;
}

export function Toolbar({ onReviewPR }: Props) {
  return (
    <div className="flex items-center px-5 py-2 border-b border-[var(--border-primary)] bg-[var(--bg-chrome)]" role="toolbar" aria-label="Issue actions">
      <button
        onClick={onReviewPR}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] cursor-pointer bg-[var(--bg-inset)] border border-[var(--border-secondary)] text-[var(--text-muted)]"
      >
        <span className="text-[13px]" aria-hidden="true">⌕</span> Review PR
      </button>
    </div>
  );
}
