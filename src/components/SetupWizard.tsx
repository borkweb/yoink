import React, { useState, useRef } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { CONFIG_DIR, CONFIG_PATH } from '../config';

interface ProjectData {
  projectName: string;
  repoDir: string;
  linearTeam: string;
  linearAssignee: string;
  linearLabel: string;
  baseBranch: string;
}

interface WizardData {
  linearApiKey: string;
  claudePlugins: string;
  concurrency: string;
  maxTurns: string;
  pollInterval: string;
  githubCommand: string;
  allowedTools: string;
  projects: ProjectData[];
}

const DEFAULT_ALLOWED_TOOLS =
  'Read,Edit,Write,Glob,Grep,Skill,Task,Bash,Bash(git *),Bash(composer *),Bash(php *),Bash(cd *),Bash(pnpm *),Bash(proxychains4 *),Bash(gh *),Bash(cat *),Bash(ls *)';

type GlobalKey = 'linearApiKey' | 'claudePlugins';
type ProjectKey = keyof ProjectData;
type AdvancedKey = 'concurrency' | 'maxTurns' | 'pollInterval' | 'githubCommand' | 'allowedTools';

interface StepConfig<K extends string = string> {
  key: K;
  label: string;
  required: boolean;
  defaultValue: string;
}

const GLOBAL_STEPS: StepConfig<GlobalKey>[] = [
  { key: 'linearApiKey', label: 'Linear API key', required: true, defaultValue: '' },
  { key: 'claudePlugins', label: 'Claude plugins (comma-separated)', required: false, defaultValue: 'superpowers@claude-plugins-official' },
];

const PROJECT_STEPS: StepConfig<ProjectKey>[] = [
  { key: 'projectName', label: 'Project name (used as config key)', required: true, defaultValue: '' },
  { key: 'repoDir', label: 'Repository directory (absolute path)', required: true, defaultValue: '' },
  { key: 'linearTeam', label: 'Linear team key (e.g. TEAM)', required: true, defaultValue: '' },
  { key: 'linearAssignee', label: 'Linear assignee username', required: true, defaultValue: '' },
  { key: 'linearLabel', label: 'Linear label for issues', required: false, defaultValue: 'AI Automation' },
  { key: 'baseBranch', label: 'Base branch', required: false, defaultValue: 'main' },
];

const ADVANCED_STEPS: StepConfig<AdvancedKey>[] = [
  { key: 'concurrency', label: 'Concurrency (parallel Claude runs)', required: false, defaultValue: '2' },
  { key: 'maxTurns', label: 'Max turns per Claude run', required: false, defaultValue: '100' },
  { key: 'pollInterval', label: 'Poll interval (seconds)', required: false, defaultValue: '30' },
  { key: 'githubCommand', label: 'GitHub CLI command', required: false, defaultValue: 'gh' },
  { key: 'allowedTools', label: 'Allowed Claude tools', required: false, defaultValue: DEFAULT_ALLOWED_TOOLS },
];

type Section = 'global' | 'project' | 'ask-another' | 'ask-advanced' | 'advanced' | 'done';

export interface SetupWizardInitialData {
  linearApiKey?: string;
  claudePlugins?: string;
  concurrency?: string;
  maxTurns?: string;
  pollInterval?: string;
  githubCommand?: string;
  allowedTools?: string;
  projects?: ProjectData[];
}

interface Props {
  onDone?: () => void;
  initialData?: SetupWizardInitialData;
}

function defaultProjectData(index: number, prevProject?: ProjectData): ProjectData {
  if (index === 0) {
    return {
      projectName: path.basename(process.cwd()),
      repoDir: process.cwd(),
      linearTeam: '',
      linearAssignee: '',
      linearLabel: 'AI Automation',
      baseBranch: 'main',
    };
  }
  return {
    projectName: '',
    repoDir: '',
    linearTeam: '',
    linearAssignee: prevProject?.linearAssignee ?? '',
    linearLabel: prevProject?.linearLabel ?? 'AI Automation',
    baseBranch: 'main',
  };
}

export function SetupWizard({ onDone, initialData }: Props) {
  const { exit } = useApp();
  const [section, setSection] = useState<Section>('global');
  const [stepIndex, setStepIndex] = useState(0);
  const [currentProjectIndex, setCurrentProjectIndex] = useState(0);
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState('');

  const initialProjects = initialData?.projects ?? [];

  const dataRef = useRef<WizardData>({
    linearApiKey: initialData?.linearApiKey ?? '',
    claudePlugins: initialData?.claudePlugins ?? 'superpowers@claude-plugins-official',
    concurrency: initialData?.concurrency ?? '2',
    maxTurns: initialData?.maxTurns ?? '100',
    pollInterval: initialData?.pollInterval ?? '30',
    githubCommand: initialData?.githubCommand ?? 'gh',
    allowedTools: initialData?.allowedTools ?? DEFAULT_ALLOWED_TOOLS,
    projects: initialProjects.length > 0
      ? [...initialProjects]
      : [defaultProjectData(0)],
  });

  function getCurrentProjectDefaults(): ProjectData {
    const projects = dataRef.current.projects;
    const existing = projects[currentProjectIndex];
    if (existing) return existing;
    const prev = projects[currentProjectIndex - 1];
    return defaultProjectData(currentProjectIndex, prev);
  }

  function getGlobalDefault(key: GlobalKey): string {
    const val = dataRef.current[key];
    if (val) return val;
    return GLOBAL_STEPS.find(s => s.key === key)?.defaultValue ?? '';
  }

  function getProjectDefault(key: ProjectKey): string {
    const defaults = getCurrentProjectDefaults();
    const val = defaults[key];
    if (val) return val;
    return PROJECT_STEPS.find(s => s.key === key)?.defaultValue ?? '';
  }

  function getAdvancedDefault(key: AdvancedKey): string {
    const val = dataRef.current[key];
    if (val) return val;
    return ADVANCED_STEPS.find(s => s.key === key)?.defaultValue ?? '';
  }

  function getCurrentStep(): StepConfig | null {
    if (section === 'global') return GLOBAL_STEPS[stepIndex] ?? null;
    if (section === 'project') return PROJECT_STEPS[stepIndex] ?? null;
    if (section === 'advanced') return ADVANCED_STEPS[stepIndex] ?? null;
    return null;
  }

  function getCurrentDefault(): string {
    const step = getCurrentStep();
    if (!step) return '';
    if (section === 'global') return getGlobalDefault(step.key as GlobalKey);
    if (section === 'project') return getProjectDefault(step.key as ProjectKey);
    if (section === 'advanced') return getAdvancedDefault(step.key as AdvancedKey);
    return '';
  }

  function maskApiKey(val: string): string {
    if (!val) return '';
    return val.slice(0, 4) + '*'.repeat(Math.max(0, val.length - 4));
  }

  const currentStep = getCurrentStep();
  const currentDefault = getCurrentDefault();
  const currentDefaultDisplay =
    currentStep?.key === 'linearApiKey' && currentDefault
      ? maskApiKey(currentDefault)
      : currentDefault;

  useInput((input, key) => {
    if (section === 'ask-another') {
      if (input === 'y' || input === 'Y') {
        const prev = dataRef.current.projects[currentProjectIndex];
        const nextIdx = currentProjectIndex + 1;
        // Ensure the projects array has an entry for the new project
        if (!dataRef.current.projects[nextIdx]) {
          dataRef.current.projects[nextIdx] = defaultProjectData(nextIdx, prev);
        }
        setCurrentProjectIndex(nextIdx);
        setStepIndex(0);
        setSection('project');
        setInputValue('');
        setError('');
      } else if (input === 'n' || input === 'N' || key.return) {
        setSection('ask-advanced');
        setError('');
      }
    } else if (section === 'ask-advanced') {
      if (input === 'y' || input === 'Y') {
        setStepIndex(0);
        setSection('advanced');
        setInputValue('');
        setError('');
      } else if (input === 'n' || input === 'N' || key.return) {
        writeConfig(dataRef.current);
        setSection('done');
      }
    }
  });

  function handleSubmit(value: string) {
    const step = getCurrentStep();
    if (!step) return;

    const finalValue = value.trim() || getCurrentDefault();

    if (step.required && !finalValue) {
      setError('This field is required');
      return;
    }

    setError('');

    // Store the value
    if (section === 'global') {
      (dataRef.current as any)[step.key] = finalValue;
    } else if (section === 'project') {
      // Ensure project entry exists
      if (!dataRef.current.projects[currentProjectIndex]) {
        const prev = currentProjectIndex > 0 ? dataRef.current.projects[currentProjectIndex - 1] : undefined;
        dataRef.current.projects[currentProjectIndex] = defaultProjectData(currentProjectIndex, prev);
      }
      (dataRef.current.projects[currentProjectIndex] as any)[step.key] = finalValue;
    } else if (section === 'advanced') {
      (dataRef.current as any)[step.key] = finalValue;
    }

    // Check for duplicate project name
    if (section === 'project' && step.key === 'projectName') {
      const name = finalValue;
      const isDuplicate = dataRef.current.projects.some(
        (p, i) => i !== currentProjectIndex && p.projectName === name
      );
      if (isDuplicate) {
        setError(`Project name "${name}" is already used by another project`);
        return;
      }
    }

    // Advance
    const stepsForSection =
      section === 'global' ? GLOBAL_STEPS :
      section === 'project' ? PROJECT_STEPS :
      ADVANCED_STEPS;

    const nextIndex = stepIndex + 1;

    if (nextIndex >= stepsForSection.length) {
      // Section complete
      if (section === 'global') {
        setCurrentProjectIndex(0);
        setStepIndex(0);
        setSection('project');
        setInputValue('');
      } else if (section === 'project') {
        setSection('ask-another');
      } else if (section === 'advanced') {
        writeConfig(dataRef.current);
        setSection('done');
      }
    } else {
      setStepIndex(nextIndex);
      setInputValue('');
    }
  }

  function writeConfig(data: WizardData) {
    mkdirSync(CONFIG_DIR, { recursive: true });

    const pluginsArray = data.claudePlugins
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .map(s => `"${s}"`)
      .join(', ');

    let toml = `[defaults]
concurrency = ${data.concurrency}
max_turns = ${data.maxTurns}
poll_interval = ${data.pollInterval}
claude_plugins = [${pluginsArray}]

[linear]
api_key = "${data.linearApiKey}"
`;

    for (const project of data.projects) {
      if (!project.projectName) continue;
      toml += `
[projects.${project.projectName}]
repo_dir = "${project.repoDir}"
base_branch = "${project.baseBranch}"
linear_team = "${project.linearTeam}"
linear_assignee = "${project.linearAssignee}"
linear_label = "${project.linearLabel}"
github_command = "${data.githubCommand}"
allowed_tools = "${data.allowedTools}"
`;
    }

    writeFileSync(CONFIG_PATH, toml, 'utf-8');
  }

  if (section === 'done') {
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
        <Text dimColor>
          {dataRef.current.projects.length} project{dataRef.current.projects.length !== 1 ? 's' : ''} configured. Run yoink again to start processing issues.
        </Text>
      </Box>
    );
  }

  // Build completed steps for display
  const completedElements: React.ReactNode[] = [];

  // Global steps completed
  if (section !== 'global') {
    for (const step of GLOBAL_STEPS) {
      const val = (dataRef.current as any)[step.key] as string;
      const display = step.key === 'linearApiKey' ? maskApiKey(val) : val;
      completedElements.push(
        <Box key={`global-${step.key}`}>
          <Text dimColor>{step.label}: {display}</Text>
        </Box>
      );
    }
  } else {
    // Show completed global steps up to current index
    for (let i = 0; i < stepIndex; i++) {
      const step = GLOBAL_STEPS[i];
      const val = (dataRef.current as any)[step.key] as string;
      const display = step.key === 'linearApiKey' ? maskApiKey(val) : val;
      completedElements.push(
        <Box key={`global-${step.key}`}>
          <Text dimColor>{step.label}: {display}</Text>
        </Box>
      );
    }
  }

  // Completed projects
  const completedProjectCount =
    section === 'project' ? currentProjectIndex :
    section === 'global' ? 0 :
    dataRef.current.projects.length;

  for (let pi = 0; pi < completedProjectCount; pi++) {
    const proj = dataRef.current.projects[pi];
    if (!proj?.projectName) continue;
    completedElements.push(
      <Box key={`proj-header-${pi}`} marginTop={pi === 0 ? 1 : 0}>
        <Text dimColor bold>--- Project: {proj.projectName} ---</Text>
      </Box>
    );
    for (const step of PROJECT_STEPS) {
      if (step.key === 'projectName') continue;
      const val = (proj as any)[step.key] as string;
      completedElements.push(
        <Box key={`proj-${pi}-${step.key}`}>
          <Text dimColor>  {step.label}: {val}</Text>
        </Box>
      );
    }
  }

  // Current project completed steps (within the project section)
  if (section === 'project' && stepIndex > 0) {
    const proj = dataRef.current.projects[currentProjectIndex];
    if (proj) {
      const projName = proj.projectName || `Project ${currentProjectIndex + 1}`;
      completedElements.push(
        <Box key={`proj-header-${currentProjectIndex}`} marginTop={currentProjectIndex === 0 && completedProjectCount === 0 ? 1 : 0}>
          <Text dimColor bold>--- Project: {projName} ---</Text>
        </Box>
      );
      for (let i = 0; i < stepIndex; i++) {
        const step = PROJECT_STEPS[i];
        if (step.key === 'projectName') continue;
        const val = (proj as any)[step.key] as string;
        completedElements.push(
          <Box key={`proj-${currentProjectIndex}-${step.key}`}>
            <Text dimColor>  {step.label}: {val}</Text>
          </Box>
        );
      }
    }
  }

  // Advanced completed steps
  if (section === 'advanced' && stepIndex > 0) {
    completedElements.push(
      <Box key="adv-header" marginTop={1}>
        <Text dimColor bold>--- Advanced ---</Text>
      </Box>
    );
    for (let i = 0; i < stepIndex; i++) {
      const step = ADVANCED_STEPS[i];
      const val = (dataRef.current as any)[step.key] as string;
      completedElements.push(
        <Box key={`adv-${step.key}`}>
          <Text dimColor>  {step.label}: {val}</Text>
        </Box>
      );
    }
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold color="cyan">
        yoink setup
      </Text>
      <Text dimColor>Let's configure yoink. Press Enter to accept defaults shown in brackets.</Text>
      <Box marginTop={1} />

      {completedElements}

      {section === 'ask-another' && (
        <Box marginTop={1} flexDirection="column">
          <Text>
            Add another project?{' '}
          </Text>
          <Text>
            <Text color="yellow">y/n</Text>
            <Text dimColor> [n]</Text>
          </Text>
        </Box>
      )}

      {section === 'ask-advanced' && (
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

      {(section === 'global' || section === 'project' || section === 'advanced') && currentStep && (
        <Box flexDirection="column">
          {section === 'project' && stepIndex === 0 && (
            <Box marginTop={1}>
              <Text bold color="blue">Project {currentProjectIndex + 1}</Text>
            </Box>
          )}
          <Box>
            <Text>
              {currentStep.label}
              {currentDefaultDisplay ? (
                <Text dimColor> [{currentDefaultDisplay}]</Text>
              ) : null}
              :{' '}
            </Text>
            <TextInput
              value={inputValue}
              onChange={setInputValue}
              onSubmit={handleSubmit}
              {...(currentStep.key === 'linearApiKey' ? { mask: '*' } : {})}
            />
          </Box>
          {error && (
            <Text color="red">{error}</Text>
          )}
        </Box>
      )}
    </Box>
  );
}
