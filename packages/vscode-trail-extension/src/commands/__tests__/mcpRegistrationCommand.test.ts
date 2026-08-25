import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import * as vscode from 'vscode';

import { reconcileMcpServerRegistration } from '../mcpRegistrationCommand';

const mockVscode = vscode as unknown as {
    workspace: {
        workspaceFolders: Array<{ uri: { fsPath: string } }> | undefined;
        getConfiguration: jest.Mock;
    };
};

const DIST = '/ext/dist';

function setPort(port: number | undefined): void {
    mockVscode.workspace.getConfiguration.mockReturnValue({
        get: (_key: string, fallback: number) => port ?? fallback,
        update: jest.fn(),
    });
}

describe('trail mcpRegistrationCommand: reconcileMcpServerRegistration', () => {
    let dir: string;
    const mcpJson = () => path.join(dir, '.mcp.json');

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trail-mcp-'));
        mockVscode.workspace.workspaceFolders = [{ uri: { fsPath: dir } }];
        setPort(undefined);
    });

    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
        jest.clearAllMocks();
    });

    test('ファイル不在: 既定ポートの mcp-trail エントリを作成する', () => {
        reconcileMcpServerRegistration(DIST);
        const parsed = JSON.parse(fs.readFileSync(mcpJson(), 'utf-8'));
        expect(parsed.mcpServers['mcp-trail']).toEqual({
            command: process.execPath,
            args: [path.join(DIST, 'mcp-trail-server.js')],
            env: {
                TRAIL_SERVER_URL: 'http://localhost:19841',
                TRAIL_WORKSPACE_PATH: dir,
            },
        });
    });

    test('viewer ポート設定をエントリへ反映する', () => {
        setPort(20000);
        reconcileMcpServerRegistration(DIST);
        const parsed = JSON.parse(fs.readFileSync(mcpJson(), 'utf-8'));
        expect(parsed.mcpServers['mcp-trail'].env.TRAIL_SERVER_URL).toBe('http://localhost:20000');
    });

    test('既存エントリ: ポートを手で変えた構成を上書きしない', () => {
        const custom = JSON.stringify(
            {
                mcpServers: {
                    'mcp-trail': {
                        command: 'node',
                        args: ['tsx', 'src/server.ts'],
                        env: {
                            TRAIL_SERVER_URL: 'http://localhost:30000',
                            TRAIL_WORKSPACE_PATH: dir,
                        },
                    },
                },
            },
            null,
            2,
        );
        fs.writeFileSync(mcpJson(), custom);
        reconcileMcpServerRegistration(DIST);
        expect(fs.readFileSync(mcpJson(), 'utf-8')).toBe(custom);
    });

    test('パース不能 JSON: 書き換えない・退避もしない', () => {
        fs.writeFileSync(mcpJson(), 'not json');
        reconcileMcpServerRegistration(DIST);
        expect(fs.readFileSync(mcpJson(), 'utf-8')).toBe('not json');
        expect(fs.readdirSync(dir)).toEqual(['.mcp.json']);
    });

    test('自動経路は UI 通知を出さない', () => {
        reconcileMcpServerRegistration(DIST);
        expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
        expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
        expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
    });
});
