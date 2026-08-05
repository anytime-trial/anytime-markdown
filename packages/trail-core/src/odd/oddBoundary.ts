import * as path from 'node:path';

import type { OddRegistry } from './types';

export type OddBoundaryReason = 'odd_unknown' | 'restricted_area' | 'odd_out';

/**
 * レジストリの設定にかかわらず常に制限領域として扱うパス断片（**上書き不能な床**）。
 *
 * レジストリは `restricted` を丸ごと置き換えるため、作者が既定の一覧を再掲し
 * なければ保護が静かに消える。「不在」「壊れている」に加えて **「妥当だが保護が
 * 抜けている」** という 3 つ目の状態があり、これは検証では検出できない
 * （構文としては妥当なため）。したがって最低限の保護は判定側が固定で持つ。
 *
 * **最重要は ODD レジストリ自身**である。承認境界を決める制御プレーンなので、
 * これを代行で書き換えられると以降のあらゆる制限を自分で外せてしまう。
 *
 * SHORTCUT: 境界判定を path.resolve の正規化だけで行う.
 * ceiling: 純粋層のため realpath を取れず、ODD 内に置かれたシンボリックリンク
 * 経由の外部書き込みは ODD 内と判定される.
 * upgrade: I/O を持つ呼び出し側で realpath 解決を前段に入れたら本注記を外す.
 */
export const ALWAYS_RESTRICTED_PATTERNS: readonly string[] = [
  '/.anytime/trail/odd.json', // ODD レジストリ自身（承認境界の制御プレーン）
  '/CLAUDE.md', // ODD ルートの導出元・運用規約
  '/.claude/settings', // フック・権限設定
  '/.mcp.json', // MCP サーバ定義
  '/.git/', // git 内部（config・hooks）
  '/.github/', // CI 定義
  '/package.json', // 依存マニフェスト
  '/package-lock.json',
  '/.env', // シークレット
];

function isWithin(target: string, root: string): boolean {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/**
 * ODD 境界の判定（全体要件 §3.2 / DCT-12）。制限領域は ODD 内であっても対象外の
 * ため、対象リポジトリ内かどうかより先に判定する。
 *
 * カバレッジゲート（代行可否）と承認ルールエンジン（操作可否）の両方が本関数を
 * 使う。境界の解釈が 2 箇所に分かれると、片方だけ緩い経路ができる。
 */
export function evaluateOddBoundary(
  registry: OddRegistry,
  targetPaths: readonly string[] | undefined,
): OddBoundaryReason | null {
  // 空文字列は path.resolve が cwd（＝ワークスペース内）へ解決し境界をすり抜ける
  // ため、申告の欠落として扱う
  if (
    targetPaths === undefined ||
    targetPaths.length === 0 ||
    targetPaths.some((target) => target.trim() === '')
  ) {
    return 'odd_unknown';
  }
  // 前方一致の前に正規化する。`..` を含むパスをそのまま比較すると境界をすり抜ける
  const normalized = targetPaths.map((target) => path.resolve(target));
  const restricted = normalized.some(
    (target) =>
      ALWAYS_RESTRICTED_PATTERNS.some((pattern) => target.includes(pattern)) ||
      registry.restricted.some((entry) =>
        entry.kind === 'prefix' ? isWithin(target, entry.value) : target.includes(entry.value),
      ),
  );
  if (restricted) {
    return 'restricted_area';
  }
  if (normalized.some((target) => !registry.roots.some((root) => isWithin(target, root)))) {
    return 'odd_out';
  }
  return null;
}
