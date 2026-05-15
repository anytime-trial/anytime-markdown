import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export function resolveDbPath(opts: { dbPath?: string; workspacePath?: string }): string {
  const workspace = opts.workspacePath ?? process.cwd();
  const trailHome = process.env.TRAIL_HOME ?? path.join(workspace, '.anytime', 'trail');

  const candidates: string[] = [
    opts.dbPath ?? '',
    process.env.TRAIL_DB_PATH ?? '',
    // 新既定（anytimeTrail.database.storagePath = .anytime/trail/db = TRAIL_HOME/db）
    path.join(trailHome, 'db', 'trail.db'),
    // VS Code Marketplace 版拡張の globalStorage に置かれる DB（外部システム経路）
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
