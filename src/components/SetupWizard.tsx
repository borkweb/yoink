import React, { useState, useRef } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { mkdirSync, writeFileSync } from 'fs';
import { CONFIG_DIR, CONFIG_PATH } from '../config';

interface WizardData {
  linearApiKey: string;
  projectName: string;
  repoDir: string;
  linearTeam: string;
  linearAssignee: string;
  linearLabel: string;
  baseBranch: string;
  concurrency: string;
  maxTurns: string;
  pollInterval: string;
  githubCommand: string;
  allowedTools: string;
}

const DEFAULT_ALLOWED_TOOLS =
  'Read,Edit,Write,Glob,Grep,Bash,Bash(git *),Bash(composer *),Bash(php *),Bash(cd *),Bash(pnpm *),Bash(proxychains4 *),Bash(gh *),Bash(cat *),Bash(ls *)';

interface StepConfig {
  key: keyof WizardData;
  label: string;
  required: boolean;
  defaultValue: string;
  advanced: boolean;
}

const STEPS: StepConfig[] = [
  { key: 'linearApiKey', label: 'Linear API key', required: true, defaultValue: '', advanced: false },
  { key: 'projectName', label: 'Project name (used as config key)', required: true, defaultValue: '', advanced: false },
  { key: 'repoDir', label: 'Repository directory (absolute path)', required: true, defaultValue: '', advanced: false },
  { key: 'linearTeam', label: 'Linear team key (e.g. TEAM)', required: true, defaultValue: '', advanced: false },
  { key: 'linearAssignee', label: 'Linear assignee username', required: true, defaultValue: '', advanced: false },
  { key: 'linearLabel', label: 'Linear label for issues', required: false, defaultValue: 'AI Automation', advanced: false },
  { key: 'baseBranch', label: 'Base branch', required: false, defaultValue: 'main', advanced: false },
  // Advanced steps
  { key: 'concurrency', label: 'Concurrency (parallel Claude runs)', required: false, defaultValue: '2', advanced: true },
  { key: 'maxTurns', label: 'Max turns per Claude run', required: false, defaultValue: '100', advanced: true },
  { key: 'pollInterval', label: 'Poll interval (seconds)', required: false, defaultValue: '30', advanced: true },
  { key: 'githubCommand', label: 'GitHub CLI command', required: false, defaultValue: 'gh', advanced: true },
  { key: 'allowedTools', label: 'Allowed Claude tools', required: false, defaultValue: DEFAULT_ALLOWED_TOOLS, advanced: true },
];

type Phase = 'input' | 'ask-advanced' | 'done';

interface Props {
  onDone?: () => void;
}

export function SetupWizard({ onDone }: Props) {
  const { exit } = useApp();
  const [stepIndex, setStepIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('input');
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const dataRef = useRef<WizardData>({
    linearApiKey: '',
    projectName: '',
    repoDir: '',
    linearTeam: '',
    linearAssignee: '',
    linearLabel: 'AI Automation',
    baseBranch: 'main',
    concurrency: '2',
    maxTurns: '100',
    pollInterval: '30',
    githubCommand: 'gh',
    allowedTools: DEFAULT_ALLOWED_TOOLS,
  });

  const visibleSteps = STEPS.filter((s) => !s.advanced);
  const advancedSteps = STEPS.filter((s) => s.advanced);
  const allActiveSteps = showAdvanced ? [...visibleSteps, ...advancedSteps] : visibleSteps;

  const currentStep = allActiveSteps[stepIndex];

  useInput((input, key) => {
    if (phase === 'ask-advanced') {
      if (input === 'y' || input === 'Y') {
        setShowAdvanced(true);
        setStepIndex(visibleSteps.length);
        setPhase('input');
        setInputValue('');
      } else if (input === 'n' || input === 'N' || key.return) {
        writeConfig(dataRef.current);
        setPhase('done');
      }
    }
  });

  function handleSubmit(value: string) {
    const step = currentStep;
    const finalValue = value.trim() || step.defaultValue;

    if (step.required && !finalValue) {
      setError('This field is required');
      return;
    }

    setError('');
    dataRef.current[step.key] = finalValue;

    const nextIndex = stepIndex + 1;

    if (!showAdvanced && nextIndex >= visibleSteps.length) {
      setPhase('ask-advanced');
    } else if (nextIndex >= allActiveSteps.length) {
      writeConfig(dataRef.current);
      setPhase('done');
    } else {
      setStepIndex(nextIndex);
      setInputValue('');
    }
  }

  function writeConfig(data: WizardData) {
    mkdirSync(CONFIG_DIR, { recursive: true });

    const toml = `[defaults]
concurrency = ${data.concurrency}
max_turns = ${data.maxTurns}
poll_interval = ${data.pollInterval}

[linear]
api_key = "${data.linearApiKey}"

[projects.${data.projectName}]
repo_dir = "${data.repoDir}"
base_branch = "${data.baseBranch}"
linear_team = "${data.linearTeam}"
linear_assignee = "${data.linearAssignee}"
linear_label = "${data.linearLabel}"
github_command = "${data.githubCommand}"
allowed_tools = "${data.allowedTools}"
`;

    writeFileSync(CONFIG_PATH, toml, 'utf-8');
  }

  if (phase === 'done') {
    setTimeout(() => {
      if (onDone) {
        onDone();
      } else {
        exit();
      }
    }, 100);

    return (
      <Box flexDirection="column" marginTop={1}>
        <Text color="green" bold>
          Config written to {CONFIG_PATH}
        </Text>
        <Text dimColor>Run yoink again to start processing issues.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold color="cyan">
        yoink setup
      </Text>
      <Text dimColor>Let's configure yoink. Press Enter to accept defaults shown in brackets.</Text>
      <Box marginTop={1} />

      {/* Show completed steps */}
      {allActiveSteps.slice(0, stepIndex).map((step) => (
        <Box key={step.key}>
          <Text dimColor>
            {step.label}: {dataRef.current[step.key]}
          </Text>
        </Box>
      ))}

      {phase === 'ask-advanced' && (
        <Box marginTop={1} flexDirection="column">
          <Text>
            Customize advanced settings?{' '}
            <Text dimColor>(concurrency, max turns, poll interval, GitHub command, allowed tools)</Text>
          </Text>
          <Text>
            <Text color="yellow">y/n</Text>
            <Text dimColor> [n]</Text>
          </Text>
        </Box>
      )}

      {phase === 'input' && currentStep && (
        <Box flexDirection="column">
          <Box>
            <Text>
              {currentStep.label}
              {currentStep.defaultValue ? (
                <Text dimColor> [{currentStep.defaultValue}]</Text>
              ) : null}
              :{' '}
            </Text>
            <TextInput value={inputValue} onChange={setInputValue} onSubmit={handleSubmit} />
          </Box>
          {error && (
            <Text color="red">{error}</Text>
          )}
        </Box>
      )}
    </Box>
  );
}
