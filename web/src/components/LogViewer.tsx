import { useEffect, useRef } from 'react';
import AnsiToHtml from 'ansi-to-html';

const converter = new AnsiToHtml({
  fg: 'currentColor',
  bg: 'transparent',
  newline: true,
  escapeXML: true,
});

export function LogViewer({ logs }: { logs: string[] }) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs.length]);

  if (logs.length === 0) return null;

  return (
    <div
      className="max-h-[220px] overflow-y-auto text-xs leading-relaxed"
      role="log"
      aria-label="Process output"
      aria-live="polite"
    >
      {logs.map((line, i) => (
        <div
          key={i}
          className="text-[var(--log-text)]"
          dangerouslySetInnerHTML={{ __html: converter.toHtml(line) }}
        />
      ))}
      <div ref={endRef} />
    </div>
  );
}
