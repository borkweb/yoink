import { useEffect, useRef } from 'react';
import AnsiToHtml from 'ansi-to-html';

const converter = new AnsiToHtml({
  fg: '#9CA3AF',
  bg: 'transparent',
  newline: true,
  escapeXML: true,
});

export function LogViewer({ logs }: { logs: string[] }) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs.length]);

  if (logs.length === 0) {
    return <span className="text-[#404040] text-xs">No logs available</span>;
  }

  return (
    <div className="max-h-[220px] overflow-y-auto text-xs leading-relaxed">
      {logs.map((line, i) => (
        <div
          key={i}
          className="text-[#9CA3AF]"
          dangerouslySetInnerHTML={{ __html: converter.toHtml(line) }}
        />
      ))}
      <div ref={endRef} />
    </div>
  );
}
