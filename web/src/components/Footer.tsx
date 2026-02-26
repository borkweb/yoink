interface Props {
  connected: boolean;
  issueCount: number;
}

export function Footer({ connected, issueCount }: Props) {
  return (
    <footer className="fixed bottom-0 left-0 right-0 px-5 py-1.5 bg-[var(--bg-chrome)] border-t border-[var(--border-primary)] flex justify-between text-[10px] text-[var(--text-dimmed)]">
      <span>
        ws://localhost:7890{' '}
        <span
          className={connected ? 'text-[var(--status-completed)]' : 'text-[var(--status-failed)]'}
          role="status"
          aria-live="polite"
        >
          {connected ? 'connected' : 'disconnected'}
        </span>
      </span>
      <span>{issueCount} issues</span>
    </footer>
  );
}
