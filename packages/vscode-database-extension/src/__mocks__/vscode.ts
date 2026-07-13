// VS Code API minimal mock for unit testing (jest moduleNameMapper 経由で解決される)

export const Uri = {
  file: (fsPath: string) => ({ scheme: 'file', fsPath, path: fsPath, toString: () => fsPath }),
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

export class ThemeIcon {
  constructor(public readonly id: string) {}
}

export class EventEmitter<T> {
  readonly event = (_listener: (e: T) => void): { dispose: () => void } => ({ dispose: () => undefined });
  fire(_data: T): void { /* no-op */ }
  dispose(): void { /* no-op */ }
}

/** 本物の l10n.t と同じく {0} 形式のプレースホルダを置換する。 */
export const l10n = {
  t: (message: string, ...args: unknown[]): string =>
    message.replaceAll(/\{(\d+)\}/g, (match, index: string) => {
      const value = args[Number(index)];
      return value === undefined ? match : String(value);
    }),
};

export const workspace = {
  workspaceFolders: undefined as { uri: { fsPath: string } }[] | undefined,
};
