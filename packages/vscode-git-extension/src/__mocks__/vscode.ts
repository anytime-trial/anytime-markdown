// VS Code API minimal mock for unit testing

export const Uri = {
  file: (path: string) => ({ scheme: 'file', fsPath: path, path, toString: () => path }),
  parse: (str: string) => ({ scheme: 'file', fsPath: str, path: str, toString: () => str }),
};

export enum TreeItemCollapsibleState {
  None = 0,
  Collapsed = 1,
  Expanded = 2,
}

export class TreeItem {
  label: string;
  collapsibleState?: TreeItemCollapsibleState;
  description?: string;
  tooltip?: string;
  contextValue?: string;
  iconPath?: unknown;
  resourceUri?: unknown;
  command?: unknown;

  constructor(label: string, collapsibleState?: TreeItemCollapsibleState) {
    this.label = label;
    this.collapsibleState = collapsibleState;
  }
}

export const ThemeIcon = class {
  constructor(public id: string) {}
};

export const ThemeColor = class {
  constructor(public id: string) {}
};

export const window = {
  showInformationMessage: jest.fn(),
  showWarningMessage: jest.fn(),
  showErrorMessage: jest.fn(),
  showInputBox: jest.fn(),
  showQuickPick: jest.fn(),
  createOutputChannel: jest.fn(() => ({
    appendLine: jest.fn(),
    dispose: jest.fn(),
  })),
  withProgress: jest.fn(),
  showOpenDialog: jest.fn(),
};

export const workspace = {
  getConfiguration: jest.fn(() => ({
    get: jest.fn(),
    update: jest.fn(),
  })),
  workspaceFolders: [],
  onDidChangeConfiguration: jest.fn(),
  fs: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    stat: jest.fn(),
    readDirectory: jest.fn(),
    delete: jest.fn(),
    rename: jest.fn(),
    copy: jest.fn(),
    createDirectory: jest.fn(),
  },
};

export const commands = {
  registerCommand: jest.fn(),
  executeCommand: jest.fn(),
};

export const EventEmitter = class {
  fire = jest.fn();
  event = jest.fn();
  dispose = jest.fn();
};

export enum ProgressLocation {
  Notification = 15,
  Window = 10,
}

export enum FileType {
  Unknown = 0,
  File = 1,
  Directory = 2,
  SymbolicLink = 64,
}

export const extensions = {
  getExtension: jest.fn(),
};
