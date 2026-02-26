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
  running: { label: 'Running', color: '#22D3EE', bg: '#083344', pulse: true },
  completed: { label: 'Done', color: '#4ADE80', bg: '#052E16', pulse: false },
  failed: { label: 'Failed', color: '#F87171', bg: '#450A0A', pulse: false },
  stopped: { label: 'Stopped', color: '#FBBF24', bg: '#422006', pulse: false },
  queued: { label: 'Queued', color: '#818CF8', bg: '#1E1B4B', pulse: false },
};

export const PRIORITY_CONFIG: Record<number, { label: string; color: string; icon: string }> = {
  0: { label: 'None', color: '#4B5563', icon: '' },
  1: { label: 'Urgent', color: '#EF4444', icon: '!!!' },
  2: { label: 'High', color: '#F97316', icon: '!!' },
  3: { label: 'Normal', color: '#6B7280', icon: '!' },
  4: { label: 'Low', color: '#4B5563', icon: '~' },
};
