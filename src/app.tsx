import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import type { YoinkEngine } from './engine';
import { Dashboard } from './components/Dashboard';

interface Props {
  engine: YoinkEngine;
}

export function App({ engine }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    engine.start().then(() => {
      if (!cancelled) setLoading(false);
    }).catch((err) => {
      if (!cancelled) setError(err instanceof Error ? err.message : String(err));
    });
    return () => { cancelled = true; };
  }, []);

  if (error) {
    return (
      <Box>
        <Text color="red">Error: {error}</Text>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box>
        <Text dimColor>Loading issues...</Text>
      </Box>
    );
  }

  return <Dashboard engine={engine} />;
}
