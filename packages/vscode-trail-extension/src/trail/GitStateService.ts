// GitStateService.ts — track git HEAD per session to detect new commits after Bash tool use

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export interface GitStateFile {
  sessionId: string;
  lastHead: string;
  updatedAt: string;
}

export class GitStateService {
  constructor(private readonly stateDir: string) {}

  private filePath(sessionId: string): string {
    return path.join(this.stateDir, `claude-code-git-state-${sessionId}.json`);
  }

  getCurrentHead(cwd: string): string | null {
    try {
      return execSync('git rev-parse HEAD', { cwd, timeout: 3000 }).toString().trim();
    } catch {
      return null;
    }
  }

  readState(sessionId: string): GitStateFile | null {
    try {
      const content = fs.readFileSync(this.filePath(sessionId), 'utf-8');
      return JSON.parse(content) as GitStateFile;
    } catch {
      return null;
    }
  }

  writeState(sessionId: string, head: string): void {
    fs.mkdirSync(this.stateDir, { recursive: true });
    fs.writeFileSync(this.filePath(sessionId), JSON.stringify({
      sessionId,
      lastHead: head,
      updatedAt: new Date().toISOString(),
    }, null, 2));
  }

  getCommitsSince(cwd: string, lastHead: string, currentHead: string): readonly string[] {
    if (lastHead === currentHead) return [];
    try {
      const out = execSync(`git log ${lastHead}..${currentHead} --format=%H`, {
        cwd,
        timeout: 5000,
      }).toString().trim();
      return out ? out.split('\n') : [];
    } catch {
      return [];
    }
  }
}
