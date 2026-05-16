import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { ExecFileGitService } from '../ExecFileGitService';

function runGit(args: string[], cwd: string): void {
  execFileSync('git', args, { cwd, stdio: 'pipe' });
}

describe('ExecFileGitService.getSnapshotLineCount', () => {
  it('counts code files in the release snapshot and ignores non-code files', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trail-git-snapshot-test-'));
    try {
      runGit(['init'], root);
      runGit(['config', 'user.email', 'codex@example.com'], root);
      runGit(['config', 'user.name', 'Codex'], root);

      fs.mkdirSync(path.join(root, 'src'), { recursive: true });
      fs.writeFileSync(path.join(root, 'src', 'index.ts'), 'const a = 1;\nconst b = 2;\nconst c = 3;\n');
      fs.writeFileSync(path.join(root, 'README.md'), '# Title\nBody\n');

      runGit(['add', '.'], root);
      runGit(['commit', '-m', 'feat: initial snapshot'], root);
      runGit(['tag', 'v0.0.1'], root);

      const service = new ExecFileGitService(root);
      expect(service.getSnapshotLineCount('v0.0.1')).toBe(3);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
