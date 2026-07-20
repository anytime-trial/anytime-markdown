// 単体テスト用の VS Code API 最小モック。
// vscode-trail-extension/src/__mocks__/vscode.ts と同じ方針で、テストが触る面だけを持つ。

export interface MockUri {
	readonly scheme: string;
	readonly fsPath: string;
	readonly path: string;
	toString(): string;
}

export const Uri = {
	file: (path: string): MockUri => ({ scheme: 'file', fsPath: path, path, toString: () => path }),
};

export enum TreeItemCollapsibleState {
	None = 0,
	Collapsed = 1,
	Expanded = 2,
}

export class TreeItem {
	public description?: string;
	public tooltip?: string;
	public contextValue?: string;
	public iconPath?: unknown;
	public resourceUri?: unknown;
	public command?: { command: string; title: string; arguments?: unknown[] };

	public constructor(
		public readonly label: string,
		public readonly collapsibleState?: TreeItemCollapsibleState,
	) {}
}

export class ThemeIcon {
	public constructor(public readonly id: string) {}
}

export class EventEmitter<T> {
	private readonly listeners: ((value: T) => void)[] = [];

	public readonly event = (listener: (value: T) => void) => {
		this.listeners.push(listener);
		return { dispose: () => undefined };
	};

	public fire(value: T): void {
		for (const listener of this.listeners) listener(value);
	}

	public dispose(): void {
		this.listeners.length = 0;
	}
}

export const workspace = {
	workspaceFolders: undefined as unknown[] | undefined,
	findFiles: jest.fn(),
	asRelativePath: jest.fn(),
	createFileSystemWatcher: jest.fn(),
};

export const window = {
	createOutputChannel: jest.fn(() => ({ appendLine: jest.fn(), dispose: jest.fn() })),
	createTreeView: jest.fn(),
	registerCustomEditorProvider: jest.fn(),
	showErrorMessage: jest.fn(),
	showInputBox: jest.fn(),
	showWarningMessage: jest.fn(),
};

export const commands = {
	registerCommand: jest.fn(),
	executeCommand: jest.fn(),
};

export const env = { language: 'en' };
