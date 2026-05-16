import * as path from 'node:path';
import * as vscode from 'vscode';
import { ClaudeStatusWatcher, setupClaudeHooks } from '@anytime-markdown/vscode-common';
import { AgentMappingProvider } from './providers/AgentMappingProvider';
import {
  WorktreeTreeItem,
  SessionTreeItem,
} from './providers/AgentMappingItem';
import { OllamaProvider } from './providers/OllamaProvider';
import { AgentLogger } from './utils/AgentLogger';

let ollamaProvider: OllamaProvider | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  AgentLogger.info('Anytime Agent: activate');

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  const workspacePath = workspaceFolder?.uri.fsPath ?? process.cwd();

  const claudeStatusDirSetting =
    vscode.workspace
      .getConfiguration('anytimeAgent')
      .get<string>('claudeStatus.directory', '.anytime/trail/agent-status') ||
    '.anytime/trail/agent-status';

  // Claude Code hook を ~/.claude/settings.json に自動登録
  // trail サーバ宛 POST (token-budget / message-commits) は trail 拡張側の port 設定を参照する。
  // trail 拡張未インストール時は default port を使い、サーバ未起動なら silent fail する。
  const trailPortForHooks = vscode.workspace
    .getConfiguration('anytimeTrail.viewer')
    .get<number>('port', 19841);
  if (workspaceFolder) {
    const registered = setupClaudeHooks(
      workspacePath,
      claudeStatusDirSetting,
      trailPortForHooks,
    );
    AgentLogger.info(
      `Claude hooks setup: ${registered ? 'registered' : 'skipped (already registered or .claude not found)'}`,
    );
  }

  // Agent Mapping view
  const watcher = new ClaudeStatusWatcher(workspacePath, claudeStatusDirSetting);
  const mappingProvider = new AgentMappingProvider(watcher, workspacePath);
  const mappingTreeView = vscode.window.createTreeView('anytimeAgent.mapping', {
    treeDataProvider: mappingProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(mappingProvider, mappingTreeView);
  void vscode.commands.executeCommand('setContext', 'anytimeAgent.mapping.filterActive', false);

  context.subscriptions.push(
    vscode.commands.registerCommand('anytime-agent.mapping.refresh', () => {
      mappingProvider.refresh();
    }),
    vscode.commands.registerCommand('anytime-agent.mapping.cleanupStale', () => {
      mappingProvider.cleanupStale();
    }),
    vscode.commands.registerCommand('anytime-agent.mapping.toggleStale', () => {
      mappingProvider.toggleStale();
      void vscode.commands.executeCommand(
        'setContext',
        'anytimeAgent.mapping.filterActive',
        !mappingProvider.showStale,
      );
    }),
    vscode.commands.registerCommand('anytime-agent.mapping.openWorktree', (item: WorktreeTreeItem) => {
      void vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(item.mapping.worktreePath), true);
    }),
    vscode.commands.registerCommand('anytime-agent.mapping.copyWorktreePath', (item: WorktreeTreeItem) => {
      void vscode.env.clipboard.writeText(item.mapping.worktreePath);
    }),
    vscode.commands.registerCommand('anytime-agent.mapping.showSessionEdits', (item: SessionTreeItem) => {
      const edits = item.session.sessionEdits.map(e => ({ label: e.file, description: e.timestamp }));
      if (edits.length === 0) {
        void vscode.window.showInformationMessage('No session edits recorded.');
        return;
      }
      void vscode.window.showQuickPick(edits, { title: `Session Edits: ${item.session.sessionId.slice(0, 8)}` });
    }),
    vscode.commands.registerCommand('anytime-agent.mapping.copySessionId', (item: SessionTreeItem) => {
      void vscode.env.clipboard.writeText(item.session.sessionId);
    }),
    vscode.commands.registerCommand('anytime-agent.mapping.deleteStatusFile', (item: SessionTreeItem) => {
      mappingProvider.deleteSessionFile(item.session.sessionId);
    }),
  );

  // Ollama view
  ollamaProvider = new OllamaProvider();
  const ollamaTreeView = vscode.window.createTreeView('anytimeAgent.ollama', {
    treeDataProvider: ollamaProvider,
  });
  context.subscriptions.push(
    ollamaProvider,
    ollamaTreeView,
    vscode.commands.registerCommand('anytime-agent.startOllama', () =>
      ollamaProvider!.startOllama(),
    ),
  );

  void path.resolve;
}

export function deactivate(): void {
  AgentLogger.dispose();
}
