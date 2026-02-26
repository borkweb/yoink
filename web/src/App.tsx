import { useState } from 'react';
import { useYoinkState } from './hooks/useYoinkState';
import { useTheme } from './hooks/useTheme';
import { TopBar } from './components/TopBar';
import { Toolbar } from './components/Toolbar';
import { IssueTable } from './components/IssueTable';
import { Footer } from './components/Footer';
import { PRReviewModal } from './components/PRReviewModal';

export function App() {
  const { state, connected, dispatch } = useYoinkState();
  const [showPRModal, setShowPRModal] = useState(false);
  const { isDark, toggle: toggleTheme } = useTheme();

  if (!state) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="text-[var(--text-faint)] text-sm">
          {connected ? 'Loading...' : 'Connecting to yoink...'}
        </span>
      </div>
    );
  }

  const visibleIssues = state.issues.filter((i) => i.status !== 'abandoned');

  return (
    <div className="min-h-screen pb-8">
      <TopBar
        issues={state.issues}
        title={state.title}
        polling={state.polling}
        nextPollAt={state.nextPollAt}
        isDark={isDark}
        onToggleTheme={toggleTheme}
      />

      <Toolbar
        paused={state.paused}
        onPause={() => dispatch('pause')}
        onResume={() => dispatch('resume')}
        onReviewPR={() => setShowPRModal(true)}
      />

      <IssueTable
        issues={visibleIssues}
        onAction={(action, identifier) => dispatch(action, { identifier })}
      />

      <Footer connected={connected} issueCount={visibleIssues.length} />

      {showPRModal && (
        <PRReviewModal
          onSubmit={(prNumber, repoSlug) => {
            dispatch('reviewPR', { prNumber, repoSlug });
            setShowPRModal(false);
          }}
          onClose={() => setShowPRModal(false)}
        />
      )}
    </div>
  );
}
