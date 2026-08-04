import path from 'node:path';
import os from 'node:os';

/**
 * テスト環境で保護領域への書き込みが発行された場合に例外を投げるガード。
 * 単一のファイル書き込みミスで本番 DB を破壊する事故を防ぐ最後の防衛線。
 *
 * 判定は **allowlist**（テスト用サンドボックス配下だけを許可）で行う。
 * 保護領域を列挙する deny 方式は、列挙外のパスを黙って通す fail-open であり、
 * 実際に穴が空いていた: 本番 DB の保存先は拡張設定に依存し、既定ではワークスペース
 * 配下の `.anytime/trail/db` に置かれるため、ホーム配下だけを列挙していた旧実装では
 * 現行の本番 DB がまったく保護されていなかった。保存先は今後も変わりうるので、
 * 列挙を追従させる方式は採らない。
 *
 * 境界チェックであり fail-open が危険なため、**意図的に fail-closed** とする
 * （doctrine `conventions.ja.md`「ゲート・状態機構は fail-open を既定とし、失敗は
 * 文脈付き警告ログで残す」の但し書き）。判断が付かないパスは拒否する。
 *
 * 検出条件:
 *   - NODE_ENV === 'test' または JEST_WORKER_ID が定義済み
 *   - 書き込み先が ALLOWED_TEST_WRITE_ROOTS のいずれの配下でもない
 */
const ALLOWED_TEST_WRITE_ROOTS: readonly string[] = [os.tmpdir()];

/**
 * `target` が `root` の配下かを判定する。
 * 文字列の前方一致は使わない（`/tmp-evil` が `/tmp` 配下に見えてしまうため）。
 */
function isUnder(target: string, root: string): boolean {
  const rel = path.relative(root, target);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

export function assertNotProductionWriteDuringTests(targetPath: string): void {
  const isTest = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;
  if (!isTest) return;
  // 相対パスは cwd 基準で解決してから判定する（未解決のまま比べると
  // サンドボックス外を通しうる）。
  const resolved = path.resolve(targetPath);
  if (ALLOWED_TEST_WRITE_ROOTS.some((root) => isUnder(resolved, path.resolve(root)))) {
    return;
  }
  throw new Error(
    `[TrailDatabase] Refusing to write outside the test sandbox: ${resolved}. ` +
      'Tests must write under os.tmpdir() (e.g. fs.mkdtempSync(path.join(os.tmpdir(), "trail-"))). ' +
      'Inject an in-memory DB and neutralize save() in the test factory, ' +
      'or pass a test-specific storageDir (under os.tmpdir()) to the constructor.',
  );
}
