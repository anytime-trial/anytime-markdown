import os from 'node:os';
import path from 'node:path';
import { assertNotProductionWriteDuringTests } from '../TrailDatabase.guard';

describe('assertNotProductionWriteDuringTests', () => {
  // The test suite always runs under JEST_WORKER_ID or NODE_ENV=test, so
  // isTest is always true here. We verify both the "protected" and "safe" cases.

  it('throws when targeting ~/.claude in test environment', () => { // test-safety-allow: ガードの検証自体に保護パスが要る
    const protectedPath = path.join(os.homedir(), '.claude', 'trail', 'trail.db'); // test-safety-allow: 同上
    expect(() => assertNotProductionWriteDuringTests(protectedPath)).toThrow(
      /Refusing to write to protected path/,
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
      /Refusing to write to protected path/,
    );
  });

  it('does NOT throw for a tmpdir path', () => {
    const safePath = path.join(os.tmpdir(), 'my-test-db.sqlite');
    expect(() => assertNotProductionWriteDuringTests(safePath)).not.toThrow();
  });

  it('does NOT throw for an arbitrary safe directory', () => {
    const safePath = '/workspaces/project/test.db';
    expect(() => assertNotProductionWriteDuringTests(safePath)).not.toThrow();
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
