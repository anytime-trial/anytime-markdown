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
//     ...buildModuleNameMapperFromExports({
//       packageName: '@anytime-markdown/trail-core',
//       exports: require('../trail-core/package.json').exports,
//       rootToken: '<rootDir>/../trail-core',
//       conditions: ['browser', 'default'], // testEnvironment に合わせる（下記）
//     }),
//   }
//
// conditions の選び方: jest の testEnvironment が既定で適用する条件に合わせる。
//   jsdom → ['browser'] （@jest/environment-jsdom-abstract の customExportConditions）
//   node  → ['node', 'node-addons'] （jest-environment-node の customExportConditions）
// ここを環境と食い違わせると、テストだけが本番と別のモジュールグラフを踏む。

/** 実行時ターゲットとして選んではいけない条件（型宣言のみで実体を持たない）。 */
const NON_RUNTIME_CONDITIONS = new Set(['types']);

/** 正規表現のメタ文字を打ち消す。 */
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 条件付きエクスポート（{ browser, default, ... }）から実行時ターゲットを選ぶ。
 * conditions の順に探し、入れ子の条件オブジェクトは再帰的に解決する。
 * 解決できないときは null を返す（呼び出し側が投げる）。
 */
function pickTarget(value, conditions) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  for (const condition of conditions) {
    if (NON_RUNTIME_CONDITIONS.has(condition)) continue;
    if (!(condition in value)) continue;
    const resolved = pickTarget(value[condition], conditions);
    if (resolved) return resolved;
  }
  return null;
}

/** exports のキー `.` / `./x` / `./*` を、パッケージ名からの相対 subpath へ正規化する。 */
function toSubpath(key) {
  return key === '.' ? '' : key.replace(/^\.\//, '');
}

/** `*` を 1 個だけ含むことを保証し、前後に分割する。 */
function splitWildcard(text, label) {
  const first = text.indexOf('*');
  if (first === -1) return null;
  if (text.indexOf('*', first + 1) !== -1) {
    throw new Error(`[jest-exports-mapper] "*" は 1 つまでしか扱えない: ${label} (${text})`);
  }
  return { prefix: text.slice(0, first), suffix: text.slice(first + 1) };
}

/**
 * package.json の exports から jest の moduleNameMapper を生成する（純粋関数）。
 *
 * 解決できない宣言は握りつぶさず投げる。マップが欠けると jest は node_modules の
 * symlink 経由（＝worktree では main チェックアウト側のソース）へ静かに縮退し、
 * 誤った green や原因不明の赤を生むため。
 *
 * @param {object} options
 * @param {string} options.packageName 例 '@anytime-markdown/trail-core'
 * @param {unknown} options.exports 対象パッケージの exports フィールド
 * @param {string} options.rootToken 置換先の起点。例 '<rootDir>/../trail-core'
 * @param {readonly string[]} [options.conditions] 条件付きエクスポートの優先順。既定 ['default']
 * @returns {Record<string, string>} moduleNameMapper（宣言順に意味がある）
 */
function buildModuleNameMapperFromExports({ packageName, exports, rootToken, conditions = ['default'] }) {
  if (!exports || typeof exports !== 'object' || Array.isArray(exports)) {
    throw new Error(`[jest-exports-mapper] ${packageName} の exports がサブパスマップではない`);
  }

  const entries = [];
  for (const [key, value] of Object.entries(exports)) {
    const target = pickTarget(value, conditions);
    if (!target) {
      throw new Error(
        `[jest-exports-mapper] ${packageName} の "${key}" を conditions [${conditions.join(', ')}] で解決できない`,
      );
    }

    const subpath = toSubpath(key);
    const targetPath = target.replace(/^\.\//, '');
    const keyParts = splitWildcard(subpath, `${packageName} "${key}"`);
    const targetParts = splitWildcard(targetPath, `${packageName} "${key}" のターゲット`);
    if (Boolean(keyParts) !== Boolean(targetParts)) {
      throw new Error(`[jest-exports-mapper] ${packageName} の "${key}" はキーとターゲットで "*" の有無が食い違う`);
    }

    if (keyParts) {
      entries.push({
        pattern: `^${escapeRegExp(packageName)}/${escapeRegExp(keyParts.prefix)}(.*)${escapeRegExp(keyParts.suffix)}$`,
        replacement: `${rootToken}/${targetParts.prefix}$1${targetParts.suffix}`,
        hasWildcard: true,
        sortKey: keyParts.prefix,
      });
    } else {
      entries.push({
        pattern: `^${escapeRegExp(packageName)}${subpath ? `/${escapeRegExp(subpath)}` : ''}$`,
        replacement: `${rootToken}/${targetPath}`,
        hasWildcard: false,
        sortKey: subpath,
      });
    }
  }

  // jest は宣言順に評価して最初の一致を使う。緩いワイルドカードを先に置くと
  // 具体的なエントリが到達不能になるため、完全一致 → 前置きの長いワイルドカードの順に並べる。
  entries.sort((a, b) => {
    if (a.hasWildcard !== b.hasWildcard) return a.hasWildcard ? 1 : -1;
    if (a.hasWildcard) return b.sortKey.length - a.sortKey.length;
    return a.sortKey.localeCompare(b.sortKey);
  });

  const mapper = {};
  for (const e of entries) mapper[e.pattern] = e.replacement;
  return mapper;
}

/**
 * exports が指す実ファイル参照を条件によらず列挙する（ワイルドカードは実体を特定できないため除く）。
 * dangling export（ソース削除後に exports エントリだけ残る）の検知に使う。
 * 全パッケージを走査する用途のため、exports を持たないパッケージは空配列で受け流す。
 *
 * @param {unknown} exportsField
 * @returns {string[]} パッケージ相対のターゲット（例 './src/index.ts'）
 */
function listExportTargets(exportsField) {
  if (!exportsField || typeof exportsField !== 'object' || Array.isArray(exportsField)) return [];
  const targets = [];
  const visit = (value) => {
    if (typeof value === 'string') {
      if (!value.includes('*')) targets.push(value);
      return;
    }
    if (value && typeof value === 'object') for (const v of Object.values(value)) visit(v);
  };
  visit(exportsField);
  return targets;
}

module.exports = { buildModuleNameMapperFromExports, listExportTargets };
