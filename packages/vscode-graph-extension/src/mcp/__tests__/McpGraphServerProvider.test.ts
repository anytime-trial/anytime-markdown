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
}

function stdioDefinitions(provider: McpGraphServerProvider): StdioDefinition[] {
	return provider.provideMcpServerDefinitions(token) as unknown as StdioDefinition[];
}

describe('McpGraphServerProvider', () => {
	afterEach(() => {
		mockVscode.workspace.workspaceFolders = undefined;
	});

	test('同梱バンドル (dist/mcp-graph-server.js) を node で起動する定義を返す', () => {
		const provider = new McpGraphServerProvider(DIST);
		const [definition] = stdioDefinitions(provider);
		expect(definition.label).toBe('mcp-graph');
		expect(definition.command).toBe(process.execPath);
		expect(definition.args).toEqual([path.join(DIST, 'mcp-graph-server.js')]);
		provider.dispose();
	});

	test('ワークスペースを ANYTIME_GRAPH_ROOT で渡す（渡さないと cwd が拡張ホストになる）', () => {
		mockVscode.workspace.workspaceFolders = [{ uri: { fsPath: '/ws/project' } }];
		const provider = new McpGraphServerProvider(DIST);
		const [definition] = stdioDefinitions(provider);
		expect(definition.env).toEqual({ ANYTIME_GRAPH_ROOT: '/ws/project' });
		provider.dispose();
	});

	test('ワークスペース未オープン: rootDir を渡さない（サーバー側が cwd へフォールバック）', () => {
		const provider = new McpGraphServerProvider(DIST);
		const [definition] = stdioDefinitions(provider);
		expect(definition.env).toEqual({});
		provider.dispose();
	});
});
