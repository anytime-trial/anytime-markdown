import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

function errorDetail(error: unknown): string {
  return error instanceof Error ? (error.stack ?? error.message) : String(error);
}

export function installAirspaceBundle(
  workspaceRoot: string,
  extensionPath: string,
  log: (msg: string) => void,
): boolean {
  let commonDir: string;
  try {
    const raw = execFileSync('git', ['rev-parse', '--git-common-dir'], {
      cwd: workspaceRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    if (raw === '') {
      log(`[airspace] skipped: git common dir is empty for ${workspaceRoot}`);
      return false;
    }
    commonDir = isAbsolute(raw) ? raw : resolve(workspaceRoot, raw);
  } catch (error: unknown) {
    log(`[airspace] skipped: ${workspaceRoot} is not a git repository: ${errorDetail(error)}`);
    return false;
  }

  const targetDir = join(commonDir, 'anytime');
  const source = join(extensionPath, 'dist', 'airspace.js');
  const target = join(targetDir, 'airspace.cjs');
  try {
    mkdirSync(targetDir, { recursive: true });
    copyFileSync(source, target);
    log(`[airspace] installed bundle: ${source} -> ${target}`);
    return true;
  } catch (error: unknown) {
    log(`[airspace] failed to install bundle: source=${source} target=${target}: ${errorDetail(error)}`);
    return false;
  }
}

