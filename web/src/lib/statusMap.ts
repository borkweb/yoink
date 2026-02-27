export type DisplayStatus =
  | 'queued'
  | 'creating-worktree'
  | 'running-claude'
  | 'pushing'
  | 'pr-created'
  | 'reviewing'
  | 'review-posted'
  | 'failed'
  | 'stopped'
  | 'abandoned';

export function mapStatus(engineStatus: string): DisplayStatus {
  if (engineStatus in STATUS_CONFIG) return engineStatus as DisplayStatus;
  return 'queued';
}

export const STATUS_CONFIG: Record<DisplayStatus, { label: string; color: string; bg: string; pulse: boolean }> = {
  'queued':            { label: 'Queued',       color: 'var(--status-queued)',    bg: 'var(--status-queued-bg)',     pulse: false },
  'creating-worktree': { label: 'Worktree...',  color: 'var(--status-stopped)',   bg: 'var(--status-stopped-bg)',   pulse: true },
  'running-claude':    { label: 'Running...',   color: 'var(--status-running)',   bg: 'var(--status-running-bg)',   pulse: true },
  'pushing':           { label: 'Pushing...',   color: 'var(--status-stopped)',   bg: 'var(--status-stopped-bg)',   pulse: true },
  'pr-created':        { label: 'PR created',   color: 'var(--status-completed)', bg: 'var(--status-completed-bg)', pulse: false },
  'reviewing':         { label: 'Reviewing...', color: 'var(--status-queued)',    bg: 'var(--status-queued-bg)',     pulse: true },
  'review-posted':     { label: 'Reviewed',     color: 'var(--status-queued)',    bg: 'var(--status-queued-bg)',     pulse: false },
  'failed':            { label: 'Failed',       color: 'var(--status-failed)',    bg: 'var(--status-failed-bg)',    pulse: false },
  'stopped':           { label: 'Stopped',      color: 'var(--status-stopped)',   bg: 'var(--status-stopped-bg)',   pulse: false },
  'abandoned':         { label: 'Deleted',      color: 'var(--status-queued)',    bg: 'var(--status-queued-bg)',     pulse: false },
};

export const PRIORITY_CONFIG: Record<number, { label: string; color: string; icon: string }> = {
  0: { label: 'None', color: '#4B5563', icon: '' },
  1: { label: 'Urgent', color: '#EF4444', icon: '!!!' },
  2: { label: 'High', color: '#F97316', icon: '!!' },
  3: { label: 'Normal', color: '#6B7280', icon: '!' },
  4: { label: 'Low', color: '#4B5563', icon: '~' },
};
