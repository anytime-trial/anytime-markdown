/** VS Code Webview API type stub */
interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare global {
  interface Window {
    __vscode?: VsCodeApi;
  }
}

export {};
