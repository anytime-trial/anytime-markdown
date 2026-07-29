export const window = {
  createOutputChannel: jest.fn(() => ({
    appendLine: jest.fn(),
    dispose: jest.fn(),
    show: jest.fn(),
  })),
  showErrorMessage: jest.fn(),
  showInformationMessage: jest.fn(),
  showInputBox: jest.fn(),
  showQuickPick: jest.fn(),
  createWebviewPanel: jest.fn(),
};

export const workspace = {
  getConfiguration: jest.fn(() => ({ get: jest.fn(() => ''), update: jest.fn() })),
  workspaceFolders: undefined as unknown,
};

export const commands = { registerCommand: jest.fn(), executeCommand: jest.fn() };

export const authentication = { getSession: jest.fn() };

export const env = { language: 'ja' };

export const ConfigurationTarget = { Global: 1, Workspace: 2, WorkspaceFolder: 3 };

export const Uri = {
  file: (p: string) => ({ fsPath: p, toString: () => p }),
  joinPath: (base: { fsPath: string }, ...parts: string[]) => ({
    fsPath: [base.fsPath, ...parts].join('/'),
    toString: () => [base.fsPath, ...parts].join('/'),
  }),
};

export const ViewColumn = { One: 1, Active: -1, Beside: -2 };

export class EventEmitter<T> {
  private readonly listeners: ((e: T) => void)[] = [];
  readonly event = (listener: (e: T) => void) => {
    this.listeners.push(listener);
    return { dispose: () => {} };
  };
  fire(value: T): void {
    this.listeners.forEach((l) => l(value));
  }
  dispose(): void {}
}
