interface Props {
  connected: boolean;
  issueCount: number;
}

export function Footer({ connected, issueCount }: Props) {
  return (
    <div className="fixed bottom-0 left-0 right-0 px-5 py-1.5 bg-[#080808] border-t border-[#1A1A1A] flex justify-between text-[10px] text-[#333]">
      <span>
        ws://localhost:7890{' '}
        <span className={connected ? 'text-[#4ADE80]' : 'text-[#F87171]'}>
          {connected ? 'connected' : 'disconnected'}
        </span>
      </span>
      <span>{issueCount} issues</span>
    </div>
  );
}
