export function formatElapsed(startedAt?: number, completedAt?: number): string {
  if (!startedAt) return '—';
  const end = completedAt ?? Date.now() / 1000;
  const seconds = Math.floor(end - startedAt);
  if (seconds < 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
