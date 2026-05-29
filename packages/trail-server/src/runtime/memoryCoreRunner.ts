import { MemoryCoreService } from '@anytime-markdown/memory-core/pipeline';
import type { MemoryCoreServiceOptions } from '@anytime-markdown/memory-core';

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
  // service の生成を遅延する: 状態ファイル読み込みは事実上同期 IO だが、
  // 起動時に呼ばれない経路 (テスト) もあるため lazy 化しておく。
  let service: MemoryCoreService | null = null;
  const getService = (): MemoryCoreService => {
    if (!service) {
      const svcOpts: MemoryCoreServiceOptions = {
        logSink: opts.outputChannel,
        trailDbPath: opts.trailDbPath,
        dbPath: opts.dbPath,
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
