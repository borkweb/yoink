import { useState, useRef, useEffect } from 'react';

interface Project {
  name: string;
  repoDir: string;
}

interface Props {
  connected: boolean;
  issueCount: number;
  projects: Project[];
  configPath: string;
  onOpenConfig?: () => void;
}

export function Footer({ connected, issueCount, projects, configPath, onOpenConfig }: Props) {
  const [showProjects, setShowProjects] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close popover on outside click
  useEffect(() => {
    if (!showProjects) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowProjects(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showProjects]);

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
        {configPath && (
          <>
            {' · '}
            <button
              onClick={onOpenConfig}
              className="bg-transparent border-none cursor-pointer p-0 text-[10px] text-[var(--text-dimmed)] hover:text-[var(--text-muted)]"
            >
              {configPath}
            </button>
          </>
        )}
      </span>
      <div className="flex gap-3 items-center">
        <span>{issueCount} issues</span>
        {projects.length > 0 && (
          <div className="relative" ref={popoverRef}>
            <button
              onClick={() => setShowProjects(!showProjects)}
              className="bg-transparent border-none cursor-pointer p-0 text-[10px] text-[var(--text-dimmed)] hover:text-[var(--text-muted)]"
            >
              {projects.length} {projects.length === 1 ? 'project' : 'projects'}
            </button>
            {showProjects && (
              <div className="absolute bottom-6 right-0 bg-[var(--bg-chrome)] border border-[var(--border-secondary)] rounded shadow-lg py-1.5 px-3 min-w-[200px] z-50">
                {projects.map((p) => (
                  <div key={p.name} className="py-1 text-[11px]">
                    <span className="text-[var(--text-secondary)]">{p.name}</span>
                    {p.repoDir && (
                      <span className="text-[var(--text-dimmed)] ml-2">{p.repoDir}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </footer>
  );
}
