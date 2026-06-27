/**
 * linkedMdProvider.ts — linked Markdown バニラモジュールレジストリ。
 *
 * consumer（web-app / vscode webview）が起動時に注入する。
 * 未設定時はリンク先 Markdown の取得・保存を行わない。
 *
 * React Context 非依存の module-level singleton。
 * 設定方法: `setLinkedMdProvider(provider)` を起動時に 1 回呼ぶ。
 */

export interface LinkedMdToken {
  mtimeMs: number;
  size: number;
}

export interface LinkedMdContent {
  content: string;
  resolvedPath: string;
  token: LinkedMdToken;
}

export interface LinkedMdSaveResult {
  token: LinkedMdToken | null;
  conflict: boolean;
  error?: string;
}

export interface LinkedMdProvider {
  fetch(href: string): Promise<LinkedMdContent>;
  save(
    href: string,
    content: string,
    baseToken: LinkedMdToken,
  ): Promise<LinkedMdSaveResult>;
}

let _provider: LinkedMdProvider | null = null;

/**
 * LinkedMdProvider を注入する。
 * consumer（web-app / vscode webview）が初期化フェーズで 1 回呼ぶ。
 * null を渡すと「リンク先 Markdown provider 未設定」状態にリセットされる。
 */
export function setLinkedMdProvider(provider: LinkedMdProvider | null): void {
  _provider = provider;
}

/**
 * 現在の LinkedMdProvider を取得する。
 * 未設定（null）の場合はリンク先 Markdown の取得・保存を行わない。
 */
export function getLinkedMdProvider(): LinkedMdProvider | null {
  return _provider;
}
