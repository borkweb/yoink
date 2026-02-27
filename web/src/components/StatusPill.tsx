import { mapStatus, STATUS_CONFIG } from '../lib/statusMap';

export function StatusPill({ status, prUrl }: { status: string; prUrl?: string }) {
  const display = mapStatus(status);
  const cfg = STATUS_CONFIG[display];

  const pill = (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-semibold tracking-wide whitespace-nowrap"
      style={{
        background: cfg.bg,
        border: `1px solid color-mix(in srgb, ${cfg.color} 20%, transparent)`,
        color: cfg.color,
      }}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${cfg.pulse ? 'animate-pulse' : ''}`}
        style={{ background: cfg.color }}
        aria-hidden="true"
      />
      {cfg.label}
    </span>
  );

  if (prUrl) {
    return (
      <a href={prUrl} target="_blank" rel="noopener noreferrer" className="hover:opacity-80" onClick={(e) => e.stopPropagation()}>
        {pill}
      </a>
    );
  }

  return pill;
}
