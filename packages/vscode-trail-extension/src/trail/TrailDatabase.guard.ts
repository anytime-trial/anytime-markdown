import path from 'node:path';
import os from 'node:os';

/**
 * テスト環境で保護領域（ユーザーホーム配下の永続データ）への書き込みが
 * 発行された場合に例外を投げるガード。単一のファイル書き込みミスで
 * 本番 DB を破壊する事故を防ぐ最後の防衛線。
 *
 * 検出条件:
 *   - NODE_ENV === 'test' または JEST_WORKER_ID が定義済み
 *   - 書き込み先パスが PROTECTED_PREFIXES のいずれかで始まる
 */
const PROTECTED_PATH_PREFIXES = [
  path.join(os.homedir(), '.claude'),
  path.join(os.homedir(), '.vscode-server', 'data', 'User', 'globalStorage'),
];

export function assertNotProductionWriteDuringTests(targetPath: string): void {
  const isTest = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;
  if (!isTest) return;
  for (const prefix of PROTECTED_PATH_PREFIXES) {
    if (targetPath.startsWith(prefix)) {
      throw new Error(
        `[TrailDatabase] Refusing to write to protected path during tests: ${targetPath}. ` +
          'Inject an in-memory DB and neutralize save() in the test factory, ' +
          'or pass a test-specific storageDir (under os.tmpdir()) to the constructor.',
      );
    }
  }
}
