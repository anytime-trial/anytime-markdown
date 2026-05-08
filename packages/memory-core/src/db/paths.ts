import * as os from 'os';
import * as path from 'path';

export function getMemoryCoreDbPath(): string {
  return process.env.MEMORY_CORE_DB_PATH ?? path.join(os.homedir(), '.claude', 'memory-core', 'memory-core.db');
}
