import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { assertValidWorkspaceRoot } from '../src/status/agentStatusWorkerMain';

describe('assertValidWorkspaceRoot', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-ws-root-'));

  it('存在する絶対パスのディレクトリを受け入れる', () => {
    expect(() => assertValidWorkspaceRoot(dir)).not.toThrow();
  });

  it('相対パスを拒否する', () => {
    expect(() => assertValidWorkspaceRoot('../..')).toThrow(/absolute path/);
  });

  it('NUL を含むパスを拒否する', () => {
    expect(() => assertValidWorkspaceRoot(`${dir}\0/etc`)).toThrow(/absolute path/);
  });

  it('存在しないパスを拒否する', () => {
    expect(() => assertValidWorkspaceRoot(join(dir, 'missing'))).toThrow(/not an existing directory/);
  });

  it('ファイルを指すパスを拒否する', () => {
    const file = join(dir, 'a.txt');
    writeFileSync(file, 'x');
    expect(() => assertValidWorkspaceRoot(file)).toThrow(/not an existing directory/);
  });
});
