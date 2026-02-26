import { useState } from 'react';

interface Props {
  onSubmit: (prNumber: number, repoSlug: string | null) => void;
  onClose: () => void;
}

export function PRReviewModal({ onSubmit, onClose }: Props) {
  const [url, setUrl] = useState('');

  function handleSubmit() {
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
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[#111111] border border-[#262626] rounded-lg p-6 w-[480px]"
      >
        <h3 className="text-[15px] font-bold text-[#E5E5E5] mb-4">
          Review a Pull Request
        </h3>
        <input
          type="text"
          placeholder="PR URL or number"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
          className="w-full px-3 py-2.5 bg-[#0A0A0A] border border-[#333] rounded text-[13px] text-[#E5E5E5] outline-none"
          autoFocus
        />
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-transparent border border-[#333] rounded text-xs text-[#737373] cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 bg-[#22D3EE15] border border-[#22D3EE44] rounded text-xs text-[#22D3EE] font-semibold cursor-pointer"
          >
            Start Review
          </button>
        </div>
      </div>
    </div>
  );
}
