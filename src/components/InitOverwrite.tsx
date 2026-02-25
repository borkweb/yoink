import React, { useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { SetupWizard } from './SetupWizard';
import { CONFIG_PATH } from '../config';

export function InitOverwrite() {
  const { exit } = useApp();
  const [confirmed, setConfirmed] = useState<boolean | null>(null);

  useInput((input) => {
    if (confirmed !== null) return;
    if (input === 'y' || input === 'Y') {
      setConfirmed(true);
    } else if (input === 'n' || input === 'N') {
      setConfirmed(false);
    }
  });

  if (confirmed === true) {
    return <SetupWizard />;
  }

  if (confirmed === false) {
    setTimeout(() => exit(), 100);
    return (
      <Box>
        <Text dimColor>Aborted. Edit your existing config with: yoink config</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text>
        Config already exists at <Text bold>{CONFIG_PATH}</Text>
      </Text>
      <Text>
        Overwrite? <Text color="yellow">y/n</Text>
      </Text>
    </Box>
  );
}
