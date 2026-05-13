import * as path from 'node:path';
import type initSqlJsFn from 'sql.js';
import {
  setSqlJsLoader,
  MemoryCoreService,
  type MemoryCoreServiceOptions,
} from '@anytime-markdown/memory-core';

// VS Code 拡張は webpack バンドル後の VSIX に node_modules を同梱しないため、
// `import 'sql.js'` を webpack に解決させると UMD wrapper が壊れて activate に
// 失敗する。dist/sql-wasm.js を __non_webpack_require__ で runtime 直接ロードして
// 回避する (trail-db init() と同じパターン)。
declare const __non_webpack_require__: ((id: string) => unknown) | undefined;

let sqlJsLoaderInstalled = false;
/**
 * memory-core の sql.js loader を `__non_webpack_require__` 経由のものに
 * 差し替える。webpack で sql.js を bundle すると UMD wrapper が壊れて
 * `Cannot set properties of undefined (setting 'exports')` で fail するため
 * 拡張側で必ず override する必要がある。
 *
 * memoryCoreRunner だけでなく MemoryApiHandler / chatBridge など sql.js を
 * 触る他コンシューマでも使えるように export している。複数回呼んでも初回のみ
 * 設定する (idempotent)。
 */
export function installSqlJsLoaderOnce(distPath: string): void {
  if (sqlJsLoaderInstalled) return;
  sqlJsLoaderInstalled = true;
  setSqlJsLoader(async () => {
    const sqlWasmPath = path.join(distPath, 'sql-wasm.js');
    if (typeof __non_webpack_require__ !== 'function') {
      // webpack バンドル外で呼ばれた場合 (一部テストなど) のフォールバック。
      // 通常 require は webpack 経由でも動くが、sql.js の module.exports 代入が
      // 壊れるため拡張環境では発生しない想定。
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const initSqlJs = require('sql.js') as typeof initSqlJsFn;
      return await initSqlJs({ locateFile: (file: string) => path.join(distPath, file) });
    }
    const initSqlJs = __non_webpack_require__(sqlWasmPath) as typeof initSqlJsFn;
    return await initSqlJs({ locateFile: (file: string) => path.join(distPath, file) });
  });
}

export interface MemoryCoreRunner {
  runAfterImport(): Promise<void>;
}

/**
 * ホスト (VS Code 拡張 / CLI) が提供する出力チャネルの最小インタフェース。
 * vscode.OutputChannel と同一形状のサブセット。
 */
export interface MemoryCoreOutputChannel {
  append(msg: string): void;
  appendLine(msg: string): void;
}

/**
 * @deprecated `MemoryCoreService` を直接使ってください。この factory は
 * 既存呼び出し元の互換維持のための薄い proxy で、すべての callers が
 * `MemoryCoreService` に移行した後に削除されます。
 *
 * `runAfterImport()` は内部的に `service.runOnce('import')` を呼びます。
 * pause 中でも import 契機は user-initiated として扱われ実行されます。
 */
export function createMemoryCoreRunner(opts: {
  outputChannel: MemoryCoreOutputChannel;
  trailDbPath: string;
  dbPath?: string;
  /**
   * sql.js (sql-wasm.js / sql-wasm.wasm) が CopyPlugin で配置されている dist
   * ディレクトリ。指定された場合のみ memory-core の sql.js loader を
   * `__non_webpack_require__` 経由で inject する (extension 起動時に必要)。
   */
  distPath?: string;
  /**
   * better-sqlite3 native binding (.node) への絶対パス。
   * webpack バンドル後の拡張では `bindings` パッケージが native binary を
   * 自動探索できず `getFileName(...).indexOf` で fail するため、絶対パスを
   * 明示する必要がある (chatBridge / rebuildScheduler と同じ事情)。
   */
  nativeBinding?: string;
  /**
   * Git working tree のルートパス。
   * 拡張では vscode.workspace.workspaceFolders[0].uri.fsPath を渡す。
   * CLI では --git-roots の先頭要素を渡す。省略時は process.cwd() にフォールバック。
   */
  gitRoot?: string;
}): MemoryCoreRunner {
  if (opts.distPath) installSqlJsLoaderOnce(opts.distPath);

  // service の生成を遅延する: 状態ファイル読み込みは事実上同期 IO だが、
  // 起動時に呼ばれない経路 (テスト) もあるため lazy 化しておく。
  let service: MemoryCoreService | null = null;
  const getService = (): MemoryCoreService => {
    if (!service) {
      const svcOpts: MemoryCoreServiceOptions = {
        logSink: opts.outputChannel,
        trailDbPath: opts.trailDbPath,
        dbPath: opts.dbPath,
        distPath: opts.distPath,
        nativeBinding: opts.nativeBinding,
        gitRoot: opts.gitRoot,
      };
      service = new MemoryCoreService(svcOpts);
    }
    return service;
  };

  return {
    async runAfterImport(): Promise<void> {
      await getService().runOnce('import');
    },
  };
}
