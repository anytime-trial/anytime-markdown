import * as path from 'node:path';
import * as vscode from 'vscode';
import { ClaudeStatusWatcher } from '@anytime-markdown/vscode-common';
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

  const claudeStatusDirSetting = vscode.workspace
    .getConfiguration('anytimeAgent')
    .get<string>('claudeStatus.directory', '');

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
  vscode.window.createTreeView('anytimeAgent.ollama', {
    treeDataProvider: ollamaProvider,
  });
  context.subscriptions.push(
    ollamaProvider,
    vscode.commands.registerCommand('anytime-agent.startOllama', () =>
      ollamaProvider!.startOllama(),
    ),
  );

  // touch path import to avoid unused warning under transpile-only ts-loader
  void path.resolve;
}

export function deactivate(): void {
  AgentLogger.dispose();
}
