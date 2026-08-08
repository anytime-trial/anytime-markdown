// domain/engine/taskParser.ts — Merge commit message parsing

export interface ParsedTask {
  readonly branchName: string | null;
  readonly prNumber: number | null;
  readonly baseBranch: string;
}

/**
 * Extract branch name, PR number, and base branch from a merge commit subject.
 */
export function parseTaskFromMergeCommit(subject: string): ParsedTask {
  let branchName: string | null = null;
  let prNumber: number | null = null;
  let baseBranch = '';

  // Pattern 1: "Merge branch 'feature/xxx' into develop"
  const mergeMatch = /^[Mm]erge branch '([^']+)' into (\S+)/.exec(subject);
  if (mergeMatch) {
    branchName = mergeMatch[1];
    baseBranch = mergeMatch[2];
  }

  // Pattern 2: "merge: feature/xxx into develop"
  if (!branchName) {
    const altMatch = /^merge:\s+(\S+)\s+into\s+(\S+)/i.exec(subject);
    if (altMatch) {
      branchName = altMatch[1];
      baseBranch = altMatch[2];
    }
  }

  // Pattern 3: "(#NN)" anywhere in subject
  const prMatch = /\(#(\d+)\)/.exec(subject);
  if (prMatch) {
    prNumber = Number.parseInt(prMatch[1], 10);
  }

  return { branchName, prNumber, baseBranch };
}
