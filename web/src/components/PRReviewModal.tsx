import { useState, useEffect, useRef } from 'react';

interface Props {
  onSubmit: (prNumber: number, repoSlug: string | null) => void;
  onClose: () => void;
}

export function PRReviewModal({ onSubmit, onClose }: Props) {
  const [url, setUrl] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!url.trim()) return;

    // Try to parse as a PR URL: https://github.com/org/repo/pull/123
    const urlMatch = url.match(/github[^/]*\/([^/]+\/[^/]+)\/pull\/(\d+)/);
    if (urlMatch) {
      onSubmit(Number(urlMatch[2]), urlMatch[1]);
      return;
    }

    // Try as a plain number
    const num = Number(url.trim());
    if (!isNaN(num) && num > 0) {
      onSubmit(num, null);
      return;
    }
  }

  return (
    <div
      className="fixed inset-0 bg-[var(--bg-overlay)] flex items-center justify-center z-50 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pr-modal-title"
        className="bg-[var(--bg-inset)] border border-[var(--border-secondary)] rounded-lg p-6 w-[480px]"
      >
        <h2 id="pr-modal-title" className="text-[15px] font-bold text-[var(--text-secondary)] mb-4">
          Review a Pull Request
        </h2>
        <form onSubmit={handleSubmit}>
          <label htmlFor="pr-url-input" className="sr-only">PR URL or number</label>
          <input
            ref={inputRef}
            id="pr-url-input"
            type="text"
            placeholder="PR URL or number"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="w-full px-3 py-2.5 bg-[var(--bg-surface)] border border-[var(--border-secondary)] rounded text-[13px] text-[var(--text-secondary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
          />
          <div className="flex justify-end gap-2 mt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-transparent border border-[var(--border-secondary)] rounded text-xs text-[var(--text-subtle)] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-[var(--accent-bg)] border border-[var(--accent-border)] rounded text-xs text-[var(--accent)] font-semibold cursor-pointer"
            >
              Start Review
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
