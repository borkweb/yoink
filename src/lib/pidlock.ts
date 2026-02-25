import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { CONFIG_DIR } from '../config';

const PID_PATH = join(CONFIG_DIR, 'yoink.pid');

function isYoinkProcess(pid: number): boolean {
  try {
    // Try /proc (Linux) first, fall back to ps (macOS)
    const procPath = `/proc/${pid}/cmdline`;
    if (existsSync(procPath)) {
      const cmdline = readFileSync(procPath, 'utf-8');
      return cmdline.includes('yoink');
    }

    const proc = Bun.spawnSync(['ps', '-p', String(pid), '-o', 'args='], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const output = new TextDecoder().decode(proc.stdout).trim();
    return output.includes('yoink');
  } catch {
    return false;
  }
}

/** Kill any existing yoink process and write our PID. */
export function acquireLock(): void {
  mkdirSync(CONFIG_DIR, { recursive: true });

  if (existsSync(PID_PATH)) {
    try {
      const oldPid = parseInt(readFileSync(PID_PATH, 'utf-8').trim(), 10);
      if (oldPid && oldPid !== process.pid && isYoinkProcess(oldPid)) {
        process.kill(oldPid, 'SIGTERM');
      }
    } catch {
      // Process already gone — that's fine
    }
  }

  writeFileSync(PID_PATH, String(process.pid));
}

/** Remove PID file on exit. */
export function releaseLock(): void {
  try {
    if (existsSync(PID_PATH)) {
      const storedPid = parseInt(readFileSync(PID_PATH, 'utf-8').trim(), 10);
      if (storedPid === process.pid) {
        unlinkSync(PID_PATH);
      }
    }
  } catch {
    // Best-effort cleanup
  }
}
