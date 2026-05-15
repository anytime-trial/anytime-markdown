import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_ANALYZE_EXCLUDE_CONTENT } from './defaultContent';

export function seedAnalyzeExclude(workspaceRoot: string): boolean {
  const dir = path.join(workspaceRoot, '.anytime');
  const file = path.join(dir, 'analyze-exclude');
  fs.mkdirSync(dir, { recursive: true });
  try {
    fs.writeFileSync(file, DEFAULT_ANALYZE_EXCLUDE_CONTENT, { flag: 'wx', encoding: 'utf-8' });
    return true;
  } catch (err) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'EEXIST') {
      return false;
    }
    throw err;
  }
}
