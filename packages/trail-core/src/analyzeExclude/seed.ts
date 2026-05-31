import fs from 'node:fs';
import { DEFAULT_ANALYZE_EXCLUDE_CONTENT } from './defaultContent';
import { analyzeExcludeDir, analyzeExcludeFilePath } from './paths';

export function seedAnalyzeExclude(workspaceRoot: string): boolean {
  const dir = analyzeExcludeDir(workspaceRoot);
  const file = analyzeExcludeFilePath(workspaceRoot);
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
