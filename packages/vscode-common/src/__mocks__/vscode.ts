// 単体テスト用の VS Code API 最小モック。
// vscode-graph-extension / vscode-trail-extension の同名モックと同じ方針で、
// テストが触る面だけを持つ。テスト側から配列・関数を差し替えて使う。

export interface MockWorkspaceFolder {
  uri: { fsPath: string };
}

export const workspace = {
  workspaceFolders: undefined as MockWorkspaceFolder[] | undefined,
  openTextDocument: jest.fn(async (path: string) => ({ path })),
};

export const window = {
  showInformationMessage: jest.fn(async (_message: string, ..._items: string[]) => undefined),
  showWarningMessage: jest.fn(async (_message: string) => undefined),
  showErrorMessage: jest.fn(async (_message: string) => undefined),
  showTextDocument: jest.fn(async (_doc: unknown, _options?: unknown) => undefined),
};

export const commands = {
  registerCommand: jest.fn((_id: string, _handler: () => unknown) => ({ dispose: () => {} })),
};

/** テスト間で状態を持ち越さないためのリセット。 */
export function __resetVscodeMock(): void {
  workspace.workspaceFolders = undefined;
  workspace.openTextDocument.mockClear();
  window.showInformationMessage.mockClear();
  window.showWarningMessage.mockClear();
  window.showErrorMessage.mockClear();
  window.showTextDocument.mockClear();
  commands.registerCommand.mockClear();
}
