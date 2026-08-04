import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assertNotProductionWriteDuringTests } from '../TrailDatabase.guard';

describe('assertNotProductionWriteDuringTests', () => {
  // The test suite always runs under JEST_WORKER_ID or NODE_ENV=test, so
  // isTest is always true here. The guard is an allowlist: only the test
  // sandbox (os.tmpdir()) is writable, everything else throws.

  it('throws when targeting ~/.claude in test environment', () => { // test-safety-allow: ガードの検証自体に保護パスが要る
    const protectedPath = path.join(os.homedir(), '.claude', 'trail', 'trail.db'); // test-safety-allow: 同上
    expect(() => assertNotProductionWriteDuringTests(protectedPath)).toThrow(
      /Refusing to write outside the test sandbox/,
    );
  });

  it('throws when targeting ~/.vscode-server globalStorage in test environment', () => { // test-safety-allow: 同上
    const protectedPath = path.join(
      os.homedir(), // test-safety-allow: 同上
      '.vscode-server',
      'data',
      'User',
      'globalStorage',
      'some-extension',
      'data.db',
    );
    expect(() => assertNotProductionWriteDuringTests(protectedPath)).toThrow(
      /Refusing to write outside the test sandbox/,
    );
  });

  // 回帰: 本番 DB の保存先は拡張設定に依存し、既定ではワークスペース配下の
  // `.anytime/trail/db` に置かれる。deny リスト方式（ホーム配下のみ列挙）では
  // ここが素通りしていた。
  it('throws when targeting the workspace-local production DB directory', () => {
    const productionLike = path.join(process.cwd(), '.anytime', 'trail', 'db', 'trail.db');
    expect(() => assertNotProductionWriteDuringTests(productionLike)).toThrow(
      /Refusing to write outside the test sandbox/,
    );
  });

  it('throws for an arbitrary directory outside the sandbox', () => {
    // 旧実装はここを「安全」として通していた。保存先が列挙外なら黙って
    // 書けてしまうため、allowlist では拒否する。
    expect(() => assertNotProductionWriteDuringTests('/workspaces/project/test.db')).toThrow(
      /Refusing to write outside the test sandbox/,
    );
  });

  it('does NOT throw for a tmpdir path', () => {
    const safePath = path.join(os.tmpdir(), 'my-test-db.sqlite');
    expect(() => assertNotProductionWriteDuringTests(safePath)).not.toThrow();
  });

  it('does NOT throw for a mkdtempSync sandbox under tmpdir', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trail-guard-'));
    try {
      expect(() => assertNotProductionWriteDuringTests(path.join(dir, 'trail.db'))).not.toThrow();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('resolves relative paths before judging (a relative path is not a sandbox path)', () => {
    expect(() => assertNotProductionWriteDuringTests('trail.db')).toThrow(
      /Refusing to write outside the test sandbox/,
    );
  });

  it('does NOT treat a sibling directory sharing the tmpdir prefix as inside the sandbox', () => {
    // `${tmpdir}-evil` は文字列前方一致では tmpdir 配下に見えるが、別ディレクトリである。
    expect(() => assertNotProductionWriteDuringTests(`${os.tmpdir()}-evil/trail.db`)).toThrow(
      /Refusing to write outside the test sandbox/,
    );
  });

  // 回帰: サンドボックスのルートをモジュール初期化時に固定すると、テストが
  // 実行時に tmpdir を差し替えた場合に旧ルートだけを許可し続け、正当な書き込みを
  // 拒否してしまう。呼び出しごとに評価していることを確かめる。
  it('re-evaluates the sandbox root on every call', () => {
    const spy = jest.spyOn(os, 'tmpdir').mockReturnValue('/sandbox-switched-at-runtime');
    try {
      expect(() =>
        assertNotProductionWriteDuringTests('/sandbox-switched-at-runtime/trail.db'),
      ).not.toThrow();
    } finally {
      spy.mockRestore();
    }
  });

  it('does NOT throw when NODE_ENV is not test (simulated via env override)', () => {
    // Temporarily remove both test indicators to simulate a non-test environment.
    // This covers the early-return branch.
    const originalNodeEnv = process.env.NODE_ENV;
    const originalJestWorkerId = process.env.JEST_WORKER_ID;
    try {
      process.env.NODE_ENV = 'production';
      delete process.env.JEST_WORKER_ID;
      const protectedPath = path.join(os.homedir(), '.claude', 'trail', 'trail.db'); // test-safety-allow: 同上
      // Should NOT throw because we are simulating production environment
      expect(() => assertNotProductionWriteDuringTests(protectedPath)).not.toThrow();
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
      if (originalJestWorkerId !== undefined) {
        process.env.JEST_WORKER_ID = originalJestWorkerId;
      }
    }
  });
});
