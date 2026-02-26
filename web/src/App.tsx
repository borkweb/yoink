import { useYoinkState } from './hooks/useYoinkState';

export function App() {
  const { state, connected } = useYoinkState();

  if (!state) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="text-[#525252] text-sm">
          {connected ? 'Loading...' : 'Connecting to yoink...'}
        </span>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <pre className="p-4 text-xs text-[#525252]">
        {JSON.stringify(state, null, 2)}
      </pre>
    </div>
  );
}
