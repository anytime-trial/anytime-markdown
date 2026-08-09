import { minimatch } from 'minimatch';

export interface IgnoreRules {
  readonly patterns: readonly string[];
  readonly negations: readonly string[];
}

export interface IgnoreMatch {
  readonly matched: boolean;
  readonly pattern: string;
}

export function parseDeadCodeIgnore(content: string): IgnoreRules {
  const patterns: string[] = [];
  const negations: string[] = [];
  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('!')) negations.push(line.slice(1));
    else patterns.push(line);
  }
  return { patterns, negations };
}

export function matchIgnore(filePath: string, rules: IgnoreRules): IgnoreMatch {
  let matchedPattern = '';
  for (const p of rules.patterns) {
    if (minimatch(filePath, p)) {
      matchedPattern = p;
      break;
    }
  }
  if (!matchedPattern) return { matched: false, pattern: '' };
  for (const n of rules.negations) {
    if (minimatch(filePath, n)) return { matched: false, pattern: '' };
  }
  return { matched: true, pattern: matchedPattern };
}
