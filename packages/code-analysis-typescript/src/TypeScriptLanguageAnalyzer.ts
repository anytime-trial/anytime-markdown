import fs from 'node:fs';
import path from 'node:path';
import type { LanguageAnalyzer, LanguageAnalyzeInput, TrailGraph } from '@anytime-markdown/code-analysis-core';
import { analyze } from './analyze';

/** tsconfig.json を起点に既存 analyze() を呼ぶ LanguageAnalyzer SPI 実装。 */
export class TypeScriptLanguageAnalyzer implements LanguageAnalyzer {
  readonly id = 'typescript';

  detect(repoRoot: string): boolean {
    return fs.existsSync(path.join(repoRoot, 'tsconfig.json'));
  }

  analyze(input: LanguageAnalyzeInput): TrailGraph {
    const tsconfigPath = input.configPath ?? path.join(input.projectRoot, 'tsconfig.json');
    return analyze({
      tsconfigPath,
      exclude: input.exclude,
      includeTests: input.includeTests,
      onProgress: input.onProgress,
    });
  }
}
