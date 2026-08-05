import * as path from 'node:path';
import {
  parseOddRegistry,
  type OddRegistry,
  type OddResolution,
  type RestrictedEntry,
} from '@anytime-markdown/trail-core';

/**
 * ファイル読取の結果。**「不在」と「読めなかった」を分ける。**
 * 両者を `null` にまとめると、権限エラーで読めなかったレジストリが「レジストリ
 * 未導入」として既定へ縮退し、保護を消す方向へ倒れる。
 */
export type FileRead =
  | { readonly kind: 'missing' }
  | { readonly kind: 'ok'; readonly content: string }
  | { readonly kind: 'error'; readonly reason: string };

export interface OddConfigInput {
  /** ワークスペースルート（対象リポジトリ） */
  readonly workspacePath: string;
  /** ユーザーのホームディレクトリ（永続データ領域の解決基準） */
  readonly homeDir: string;
  /** ファイル読取。テスト隔離のため注入する */
  readonly readFile: (path: string) => FileRead;
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
  // CLAUDE.md が読めない場合は docsRoot を足さない。ルートが減る方向なので
  // ODD は狭まる側へ倒れる（レジストリ本体と違い fail-closed の必要はない）
  const docsRoot = claudeMd.kind === 'ok' ? DOCS_ROOT_PATTERN.exec(claudeMd.content) : null;
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
 * **「ファイルが無い」と「ファイルが読めない・壊れている」を同じに扱わない。**
 *
 * | 状態 | 結果 |
 * | --- | --- |
 * | レジストリ不在 | `derived`（Phase 7-A 導入前と同一の導出既定） |
 * | レジストリが妥当 | `registry` |
 * | レジストリが読めない・壊れている | `invalid`（既定へ戻さない） |
 *
 * 3 行目が要点である。読み込み失敗を握り潰して既定へ戻すと、**保護を足そうと
 * した変更が保護を消す**方向に働く。
 */
export function resolveOddConfig(input: OddConfigInput): OddResolution {
  const read = input.readFile(path.join(input.workspacePath, REGISTRY_RELATIVE_PATH));
  if (read.kind === 'missing') {
    return { kind: 'derived', registry: deriveRegistry(input) };
  }
  if (read.kind === 'error') {
    return { kind: 'invalid', reason: `registry unreadable: ${read.reason}` };
  }
  const parsed = parseOddRegistry(read.content);
  if (parsed.kind === 'error') {
    return { kind: 'invalid', reason: parsed.reason };
  }
  return { kind: 'registry', registry: parsed.registry };
}
