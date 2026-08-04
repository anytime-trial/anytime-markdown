// GitStateService.ts — track git HEAD per session to detect new commits after Bash tool use

import { execFileSync } from 'node:child_process';
import { resolveGitExecutable } from '@anytime-markdown/trail-core/gitExecutable';
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
    // git 実行ファイルの解決は try の外で行う。中に入れると「HEAD が取れない」という
    // 正常系の縮退と、git そのものが見つからない環境不備が同じ null に化ける。
    const gitExecutable = resolveGitExecutable();
    try {
      return execFileSync(gitExecutable, ['rev-parse', 'HEAD'], { cwd, timeout: 3000 }).toString().trim();
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
    const gitExecutable = resolveGitExecutable();
    try {
      // execFileSync + 配列引数でシェルを介さず、lastHead/currentHead を git の
      // 単一リビジョン引数として渡す（OS command injection 防止）。不正リビジョンは
      // git がエラー → catch → [] となり挙動は不変。
      const out = execFileSync(gitExecutable, ['log', `${lastHead}..${currentHead}`, '--format=%H'], {
        cwd,
        timeout: 5000,
      }).toString().trim();
      return out ? out.split('\n') : [];
    } catch {
      return [];
    }
  }
}
