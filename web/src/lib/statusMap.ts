export type DisplayStatus = 'running' | 'completed' | 'failed' | 'stopped' | 'queued';

const STATUS_MAP: Record<string, DisplayStatus> = {
  'queued': 'queued',
  'creating-worktree': 'running',
  'running-claude': 'running',
  'pushing': 'running',
  'pr-created': 'completed',
  'reviewing': 'running',
  'review-posted': 'completed',
  'failed': 'failed',
  'stopped': 'stopped',
  'abandoned': 'stopped',
};

export function mapStatus(engineStatus: string): DisplayStatus {
  return STATUS_MAP[engineStatus] ?? 'queued';
}

export const STATUS_CONFIG: Record<DisplayStatus, { label: string; color: string; bg: string; pulse: boolean }> = {
  running:   { label: 'Running', color: 'var(--status-running)',   bg: 'var(--status-running-bg)',   pulse: true },
  completed: { label: 'Done',    color: 'var(--status-completed)', bg: 'var(--status-completed-bg)', pulse: false },
  failed:    { label: 'Failed',  color: 'var(--status-failed)',    bg: 'var(--status-failed-bg)',    pulse: false },
  stopped:   { label: 'Stopped', color: 'var(--status-stopped)',   bg: 'var(--status-stopped-bg)',   pulse: false },
  queued:    { label: 'Queued',  color: 'var(--status-queued)',    bg: 'var(--status-queued-bg)',     pulse: false },
};

export const PRIORITY_CONFIG: Record<number, { label: string; color: string; icon: string }> = {
  0: { label: 'None', color: '#4B5563', icon: '' },
  1: { label: 'Urgent', color: '#EF4444', icon: '!!!' },
  2: { label: 'High', color: '#F97316', icon: '!!' },
  3: { label: 'Normal', color: '#6B7280', icon: '!' },
  4: { label: 'Low', color: '#4B5563', icon: '~' },
};
