// package.json の exports から jest の moduleNameMapper を生成する。
//
// なぜ必要か: worktree ではワークスペースの symlink が main チェックアウト側へ解決されるため
// （メモリ worktree-node-modules-workspace-resolution）、jest には兄弟ソースへの明示マップが要る。
// これを `^@scope/pkg/(.*)$` → `src/$1` のワイルドカードで手書きすると、package.json の
// exports が「subpath ＝ src 以下のパス」という規約から外れた瞬間に解決できなくなる。
// 実際 trail-core の `./c4/services` は simple-icons を barrel から隔離する目的で
// `./src/c4/services/catalog.ts`（index.ts を作らない）を指しており、ワイルドカードは
// ディレクトリに着地して trail-viewer の 3 スイートが起動できなくなっていた。
//
// exports を単一の正として mapper を導出すれば、規約から外れた subpath が増えても
// jest の解決が自動で追従する。
//
// 使い方（各パッケージの jest.config.js）:
//   const { buildModuleNameMapperFromExports } = require('../../scripts/jest-exports-mapper.cjs');
//   moduleNameMapper: {
//     ...buildModuleNameMapperFromExports(
//       '@anytime-markdown/trail-core',
//       require('../trail-core/package.json').exports,
//       '<rootDir>/../trail-core',
//     ),
//   }

/** 正規表現のメタ文字を打ち消す。 */
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 条件付きエクスポート（{ browser, default, ... }）から 1 つのターゲットを選ぶ。
 * jest は testEnvironment が jsdom でも browser 条件を自動適用しないため default を優先する。
 */
function pickTarget(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    if (typeof value.default === 'string') return value.default;
    const first = Object.values(value).find((v) => typeof v === 'string');
    if (first) return first;
  }
  return null;
}

/** exports のキー `.` / `./x` / `./*` を、パッケージ名からの相対 subpath へ正規化する。 */
function toSubpath(key) {
  if (key === '.') return '';
  return key.replace(/^\.\//, '');
}

/**
 * package.json の exports から jest の moduleNameMapper を生成する（純粋関数）。
 *
 * @param {string} packageName 例 '@anytime-markdown/trail-core'
 * @param {Record<string, unknown> | undefined} exportsField 対象パッケージの exports
 * @param {string} rootToken 置換先の起点。例 '<rootDir>/../trail-core'
 * @returns {Record<string, string>} moduleNameMapper（宣言順に意味がある）
 */
function buildModuleNameMapperFromExports(packageName, exportsField, rootToken) {
  if (!exportsField || typeof exportsField !== 'object') return {};

  const entries = [];
  for (const [key, value] of Object.entries(exportsField)) {
    const target = pickTarget(value);
    if (!target) continue;
    const subpath = toSubpath(key);
    const hasWildcard = subpath.includes('*');
    const literalPrefix = hasWildcard ? subpath.slice(0, subpath.indexOf('*')) : subpath;

    const pattern = hasWildcard
      ? `^${escapeRegExp(packageName)}/${escapeRegExp(literalPrefix)}(.*)$`
      : `^${escapeRegExp(packageName)}${subpath ? `/${escapeRegExp(subpath)}` : ''}$`;
    const replacement = `${rootToken}/${target.replace(/^\.\//, '').replace('*', hasWildcard ? '$1' : '*')}`;

    entries.push({ pattern, replacement, hasWildcard, literalPrefix });
  }

  // jest は宣言順に評価して最初の一致を使う。緩いワイルドカードを先に置くと
  // 具体的なエントリが到達不能になるため、完全一致 → 前置きの長いワイルドカードの順に並べる。
  entries.sort((a, b) => {
    if (a.hasWildcard !== b.hasWildcard) return a.hasWildcard ? 1 : -1;
    if (a.hasWildcard) return b.literalPrefix.length - a.literalPrefix.length;
    return a.literalPrefix.localeCompare(b.literalPrefix);
  });

  const mapper = {};
  for (const e of entries) mapper[e.pattern] = e.replacement;
  return mapper;
}

/**
 * exports が指す実ファイル参照を列挙する（ワイルドカードは実体を特定できないため除く）。
 * dangling export（ソース削除後に exports エントリだけ残る）の検知に使う。
 *
 * @param {Record<string, unknown> | undefined} exportsField
 * @returns {string[]} パッケージ相対のターゲット（例 './src/index.ts'）
 */
function listExportTargets(exportsField) {
  if (!exportsField || typeof exportsField !== 'object') return [];
  const targets = [];
  for (const value of Object.values(exportsField)) {
    const candidates = typeof value === 'string' ? [value] : Object.values(value ?? {});
    for (const c of candidates) {
      if (typeof c === 'string' && !c.includes('*')) targets.push(c);
    }
  }
  return targets;
}

module.exports = { buildModuleNameMapperFromExports, listExportTargets };
