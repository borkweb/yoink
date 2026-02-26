interface Props {
  paused: boolean;
  onPause: () => void;
  onResume: () => void;
  onReviewPR: () => void;
}

export function Toolbar({ paused, onPause, onResume, onReviewPR }: Props) {
  return (
    <div className="flex justify-between items-center px-5 py-2 border-b border-[var(--border-primary)] bg-[var(--bg-chrome)]" role="toolbar" aria-label="Issue actions">
      <div className="flex gap-1.5">
        <button
          onClick={paused ? onResume : onPause}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-semibold cursor-pointer"
          style={{
            background: paused ? 'var(--paused-bg)' : 'var(--bg-inset)',
            border: `1px solid ${paused ? 'var(--paused-border)' : 'var(--border-secondary)'}`,
            color: paused ? 'var(--paused-text)' : 'var(--text-muted)',
          }}
        >
          <span aria-hidden="true">{paused ? '▶' : '⏸'}</span> {paused ? 'Resume' : 'Pause'}
        </button>
        <button
          onClick={onReviewPR}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] cursor-pointer bg-[var(--bg-inset)] border border-[var(--border-secondary)] text-[var(--text-muted)]"
        >
          <span className="text-[13px]" aria-hidden="true">⌕</span> Review PR
        </button>
      </div>
      <div role="status" aria-live="polite">
        {paused && (
          <span className="text-[var(--paused-text)] bg-[var(--paused-bg)] px-2 py-0.5 rounded text-[10px] font-bold tracking-widest">
            PAUSED
          </span>
        )}
      </div>
    </div>
  );
}
