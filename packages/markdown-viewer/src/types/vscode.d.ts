export {};

declare global {
  /** VS Code Webview API が受け付けるメッセージ型 */
  type VsCodeMessage =
    | { type: "saveClipboardImage"; dataUrl: string; fileName: string; requestId?: string }
    | { type: "downloadImage"; url: string }
    | { type: "overwriteImage"; path: string; dataUrl: string }
    | { type: "readClipboard" }
    | { type: "readClipboardForCodeBlock" }
    | { type: "writeClipboard"; text: string }
    | { type: "editorError"; message: string; stack: string; componentStack: string }
    | { type: "fetchLinkedMd"; requestId: string; href: string }
    | { type: "openLink"; href: string }
    | {
        type: "saveLinkedMd";
        requestId: string;
        href: string;
        content: string;
        baseToken: { mtimeMs: number; size: number };
      };

  /** VS Code Webview API type stub */
  interface VsCodeApi {
    postMessage(message: VsCodeMessage): void;
    getState(): unknown;
    setState(state: unknown): void;
  }

  interface Window {
    __vscode?: VsCodeApi;
  }
}
