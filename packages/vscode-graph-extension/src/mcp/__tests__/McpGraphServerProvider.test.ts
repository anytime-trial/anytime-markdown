import * as path from 'node:path';

import * as vscode from 'vscode';

import { McpGraphServerProvider } from '../McpGraphServerProvider';

const mockVscode = vscode as unknown as {
	workspace: { workspaceFolders: Array<{ uri: { fsPath: string } }> | undefined };
};

const DIST = '/ext/dist';
const token = {} as vscode.CancellationToken;

/** provideMcpServerDefinitions の戻りは stdio / http の union。stdio 側だけを検査する。 */
interface StdioDefinition {
	label: string;
	command: string;
	args: string[];
	env: Record<string, string | number | null>;
	version?: string;
}

function stdioDefinitions(provider: McpGraphServerProvider): StdioDefinition[] {
	return provider.provideMcpServerDefinitions(token) as unknown as StdioDefinition[];
}

describe('McpGraphServerProvider', () => {
	afterEach(() => {
		mockVscode.workspace.workspaceFolders = undefined;
	});

	test('同梱バンドル (dist/mcp-graph-server.js) を node で起動する定義を返す', () => {
		mockVscode.workspace.workspaceFolders = [{ uri: { fsPath: '/ws/project' } }];
		const provider = new McpGraphServerProvider(DIST, '9.9.9');
		const [definition] = stdioDefinitions(provider);
		expect(definition.label).toBe('mcp-graph');
		expect(definition.command).toBe(process.execPath);
		expect(definition.args).toEqual([path.join(DIST, 'mcp-graph-server.js')]);
		provider.dispose();
	});

	test('ワークスペースを ANYTIME_GRAPH_ROOT で渡す（渡さないと cwd が拡張ホストになる）', () => {
		mockVscode.workspace.workspaceFolders = [{ uri: { fsPath: '/ws/project' } }];
		const provider = new McpGraphServerProvider(DIST, '9.9.9');
		const [definition] = stdioDefinitions(provider);
		expect(definition.env).toEqual({ ANYTIME_GRAPH_ROOT: '/ws/project' });
		provider.dispose();
	});

	test('version は呼び出し側から受け取る（package.json との二重管理を避ける）', () => {
		mockVscode.workspace.workspaceFolders = [{ uri: { fsPath: '/ws/project' } }];
		const provider = new McpGraphServerProvider(DIST, '9.9.9');
		const [definition] = stdioDefinitions(provider);
		expect(definition.version).toBe('9.9.9');
		provider.dispose();
	});

	// rootDir を渡せないまま起こすと、読み書きの基準が拡張ホストの cwd になる。
	test('ワークスペース未オープン: 定義を返さない', () => {
		const provider = new McpGraphServerProvider(DIST, '9.9.9');
		expect(stdioDefinitions(provider)).toEqual([]);
		provider.dispose();
	});
});
