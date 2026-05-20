import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { GitStateService } from '../GitStateService';

function runGit(args: string[], cwd: string): string {
  return execFileSync('git', args, { cwd, stdio: 'pipe', encoding: 'utf-8' }).trim();
}

function initRepo(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trail-gitstate-test-'));
  runGit(['init'], root);
  runGit(['config', 'user.email', 'codex@example.com'], root);
  runGit(['config', 'user.name', 'Codex'], root);
  return root;
}

describe('GitStateService — command injection regression', () => {
  // 49 行目 getCommitsSince が lastHead/currentHead をシェル文字列へ補間していたため、
  // ファイル改竄経由で渡る lastHead に shell メタ文字が含まれると任意コマンドが実行された。
  it('does not execute shell metacharacters embedded in lastHead/currentHead', () => {
    const root = initRepo();
    const sentinel = path.join(root, 'INJECTED');
    try {
      const service = new GitStateService(path.join(root, '.state'));
      // execSync 経由ならシェルが `touch <sentinel>` を実行してしまう値
      const maliciousLastHead = `HEAD; touch ${sentinel}; echo `;
      service.getCommitsSince(root, maliciousLastHead, 'HEAD');

      expect(fs.existsSync(sentinel)).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('GitStateService — behavior preserved', () => {
  it('getCurrentHead returns the 40-char commit hash', () => {
    const root = initRepo();
    try {
      fs.writeFileSync(path.join(root, 'a.txt'), 'a\n');
      runGit(['add', '.'], root);
      runGit(['commit', '-m', 'first'], root);
      const expected = runGit(['rev-parse', 'HEAD'], root);

      const service = new GitStateService(path.join(root, '.state'));
      expect(service.getCurrentHead(root)).toBe(expected);
      expect(service.getCurrentHead(root)).toMatch(/^[0-9a-f]{40}$/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('getCommitsSince returns commit hashes added between two heads', () => {
    const root = initRepo();
    try {
      fs.writeFileSync(path.join(root, 'a.txt'), 'a\n');
      runGit(['add', '.'], root);
      runGit(['commit', '-m', 'first'], root);
      const firstHead = runGit(['rev-parse', 'HEAD'], root);

      fs.writeFileSync(path.join(root, 'b.txt'), 'b\n');
      runGit(['add', '.'], root);
      runGit(['commit', '-m', 'second'], root);
      const secondHead = runGit(['rev-parse', 'HEAD'], root);

      const service = new GitStateService(path.join(root, '.state'));
      expect(service.getCommitsSince(root, firstHead, secondHead)).toEqual([secondHead]);
      // 同一 head は早期 return で []
      expect(service.getCommitsSince(root, secondHead, secondHead)).toEqual([]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('getCommitsSince returns [] for an invalid revision instead of throwing', () => {
    const root = initRepo();
    try {
      const service = new GitStateService(path.join(root, '.state'));
      expect(service.getCommitsSince(root, 'not-a-real-rev', 'HEAD')).toEqual([]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
