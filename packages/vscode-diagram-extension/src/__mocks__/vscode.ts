// 単体テスト用の VS Code API 最小モック。
// vscode-trail-extension/src/__mocks__/vscode.ts と同じ方針で、テストが触る面だけを持つ。

export interface MockUri {
	readonly scheme: string;
	readonly fsPath: string;
	readonly path: string;
	toString(): string;
}

const uri = (path: string): MockUri => ({ scheme: 'file', fsPath: path, path, toString: () => path });

export const Uri = {
	file: uri,
	joinPath: (base: MockUri, ...parts: string[]): MockUri => uri([base.path, ...parts].join('/')),
};

/** 置き換える範囲。カスタムエディタは本文全体を差し替えるので、端の値を持つだけでよい。 */
export class Range {
	public constructor(
		public readonly startLine: number,
		public readonly startCharacter: number,
		public readonly endLine: number,
		public readonly endCharacter: number,
	) {}
}

/** 本文の差し替え要求。テストは「何を書こうとしたか」を読む。 */
export class WorkspaceEdit {
	public readonly edits: { uri: MockUri; range: Range; text: string }[] = [];

	public replace(target: MockUri, range: Range, text: string): void {
		this.edits.push({ uri: target, range, text });
	}
}

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
	applyEdit: jest.fn(async () => true),
	onDidChangeTextDocument: jest.fn(() => ({ dispose: () => undefined })),
	findFiles: jest.fn(),
	asRelativePath: jest.fn(),
	createFileSystemWatcher: jest.fn(),
	onDidChangeWorkspaceFolders: jest.fn(() => ({ dispose: () => undefined })),
};

/** MCP 探索へ渡す stdio 起動定義。テストは args / env を検査する。 */
export class McpStdioServerDefinition {
	public constructor(
		public readonly label: string,
		public readonly command: string,
		public readonly args: string[],
		public readonly env: Record<string, string | number | null>,
		public readonly version?: string,
	) {}
}

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
