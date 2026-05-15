import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export function resolveDbPath(opts: { dbPath?: string; workspacePath?: string }): string {
  const workspace = opts.workspacePath ?? process.cwd();

  const candidates: string[] = [
    opts.dbPath ?? '',
    process.env.TRAIL_DB_PATH ?? '',
    path.join(workspace, '.anytime', 'trail.db'),
    path.join(os.homedir(), '.claude', 'trail', 'trail.db'),
    path.join(
      os.homedir(),
      '.vscode-server',
      'data',
      'User',
      'globalStorage',
      'anytime-trial.anytime-trail',
      'trail.db',
    ),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(`trail.db not found at any known location: [${candidates.join(', ')}]`);
}
