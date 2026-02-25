import { homedir } from 'os';

/** Split a command string into args for Bun.spawn, expanding ~ to the home directory. */
export function splitCommand(command: string): string[] {
  const home = homedir();
  return command.split(/\s+/).map((part) => part.replace(/^~\//, `${home}/`));
}
