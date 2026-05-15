import * as fs from 'fs';
import * as path from 'path';

export function resolveDbPath(opts: { workspacePath?: string }): string {
  const workspace = opts.workspacePath ?? process.cwd();
  const trailHome = process.env.TRAIL_HOME ?? path.join(workspace, '.anytime', 'trail');
  const dbPath = path.join(trailHome, 'db', 'trail.db');

  if (!fs.existsSync(dbPath)) {
    throw new Error(`trail.db not found at ${dbPath}`);
  }
  return dbPath;
}
