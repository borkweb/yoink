import { mapStatus, STATUS_CONFIG } from '../lib/statusMap';

export function StatusPill({ status }: { status: string }) {
  const display = mapStatus(status);
  const cfg = STATUS_CONFIG[display];

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-semibold tracking-wide"
      style={{ background: cfg.bg, border: `1px solid ${cfg.color}33`, color: cfg.color }}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${cfg.pulse ? 'animate-pulse' : ''}`}
        style={{ background: cfg.color }}
      />
      {cfg.label}
    </span>
  );
}
