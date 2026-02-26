interface Props {
  paused: boolean;
  onPause: () => void;
  onResume: () => void;
  onReviewPR: () => void;
}

export function Toolbar({ paused, onPause, onResume, onReviewPR }: Props) {
  return (
    <div className="flex justify-between items-center px-5 py-2 border-b border-[#1A1A1A] bg-[#080808]">
      <div className="flex gap-1.5">
        <button
          onClick={paused ? onResume : onPause}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-semibold cursor-pointer"
          style={{
            background: paused ? '#422006' : '#111111',
            border: `1px solid ${paused ? '#92400E' : '#262626'}`,
            color: paused ? '#FBBF24' : '#A3A3A3',
          }}
        >
          {paused ? '▶ Resume' : '⏸ Pause'}
        </button>
        <button
          onClick={onReviewPR}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] cursor-pointer bg-[#111111] border border-[#262626] text-[#A3A3A3]"
        >
          <span className="text-[13px]">⌕</span> Review PR
        </button>
      </div>
      <div>
        {paused && (
          <span className="text-[#FBBF24] bg-[#422006] px-2 py-0.5 rounded text-[10px] font-bold tracking-widest">
            PAUSED
          </span>
        )}
      </div>
    </div>
  );
}
