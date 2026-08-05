import * as path from 'node:path';
import {
  parseOddRegistry,
  type OddRegistry,
  type OddResolution,
  type RestrictedEntry,
} from '@anytime-markdown/trail-core';

export interface OddConfigInput {
  /** ワークスペースルート（対象リポジトリ） */
  readonly workspacePath: string;
  /** ユーザーのホームディレクトリ（永続データ領域の解決基準） */
  readonly homeDir: string;
  /** ファイル読取（不在は null）。テスト隔離のため注入する */
  readonly readFile: (path: string) => string | null;
}

/** docsRoot の単一の正はプロジェクト CLAUDE.md の `- docsRoot:` 行（preflight と同じ解決） */
const DOCS_ROOT_PATTERN = /^- docsRoot:\s*(\S+)\s*$/m;

/** ODD Policy Registry の配置。Trail の他の資産（`.anytime/trail/db/`）と同じ階層 */
const REGISTRY_RELATIVE_PATH = path.join('.anytime', 'trail', 'odd.json');

/**
 * レジストリ不在時の導出既定。**Phase 7-A 導入前と同一**で、広がりも狭まりも
 * しない。レジストリ未導入のワークスペースで既存の判定を壊さないため。
 */
function deriveRegistry(input: OddConfigInput): OddRegistry {
  const roots = [input.workspacePath];
  const claudeMd = input.readFile(path.join(input.workspacePath, 'CLAUDE.md'));
  const docsRoot = claudeMd === null ? null : DOCS_ROOT_PATTERN.exec(claudeMd);
  if (docsRoot !== null) {
    roots.push(docsRoot[1]);
  }
  const restricted: RestrictedEntry[] = [
    { kind: 'prefix', value: path.join(input.homeDir, '.claude'), note: 'ユーザー永続データ領域' },
    { kind: 'prefix', value: path.join(input.homeDir, '.config') },
    { kind: 'prefix', value: path.join(input.homeDir, '.local', 'share') },
    // ODD 内（ワークスペース配下）にありながら代行対象外の領域。ホーム基準の
    // prefix では捕まらないため、パス断片で列挙する
    { kind: 'pattern', value: '/.github/', note: 'CI 定義' },
    { kind: 'pattern', value: '/.env', note: 'シークレット' },
    { kind: 'pattern', value: '/package.json', note: '依存マニフェスト' },
    { kind: 'pattern', value: '/package-lock.json' },
    { kind: 'pattern', value: '/.mcp.json', note: 'MCP サーバ定義' },
    { kind: 'pattern', value: '/.claude/settings', note: 'フック・権限設定' },
    { kind: 'pattern', value: '/.git/', note: 'git 内部' },
  ];
  return {
    version: 1,
    roots,
    restricted,
    languages: null,
    operations: {},
    narrowing: 'normal',
    godNodePercentile: 5,
  };
}

/**
 * ODD 境界（全体要件 §3.2）を解決する（Phase 7-A: ODD Policy Registry）。
 *
 * **「ファイルが無い」と「ファイルが壊れている」を同じに扱わない。**
 *
 * | 状態 | 結果 |
 * | --- | --- |
 * | レジストリ不在 | `derived`（Phase 7-A 導入前と同一の導出既定） |
 * | レジストリが妥当 | `registry` |
 * | レジストリが壊れている | `invalid`（既定へ戻さない） |
 *
 * 3 行目が要点である。読み込み失敗を握り潰して既定へ戻すと、**保護を足そうと
 * した変更が保護を消す**方向に働く。
 */
export function resolveOddConfig(input: OddConfigInput): OddResolution {
  const content = input.readFile(path.join(input.workspacePath, REGISTRY_RELATIVE_PATH));
  if (content === null) {
    return { kind: 'derived', registry: deriveRegistry(input) };
  }
  const parsed = parseOddRegistry(content);
  if (parsed.kind === 'error') {
    return { kind: 'invalid', reason: parsed.reason };
  }
  return { kind: 'registry', registry: parsed.registry };
}
