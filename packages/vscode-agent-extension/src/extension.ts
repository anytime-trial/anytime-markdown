import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { AgentStatusClient } from '@anytime-markdown/agent-core';
import {
  ClaudeStatusWatcher,
  ClaudeUsageClient,
  ClaudeUsageCoordinator,
  CodexSessionScanner,
  setupClaudeHooks,
} from '@anytime-markdown/vscode-common';
import * as vscode from 'vscode';

import { registerHandoffSessionCommand } from './commands/handoffSession';
import { SessionTreeItem } from './providers/AgentMappingItem';
import { AgentMappingProvider } from './providers/AgentMappingProvider';
import { AiNoteItem, AiNoteProvider } from './providers/AiNoteProvider';
import { OllamaProvider } from './providers/OllamaProvider';
import { installClaudeMdGuidance } from './skills/claudeMdGuidance';
import { installWorkspaceSkills } from './skills/installWorkspaceSkills';
import { AgentLogger } from './utils/AgentLogger';
import {
  AgentStatusWorkerHost,
  resolveWorkerScriptPath,
} from './worker/AgentStatusWorkerHost';

let ollamaProvider: OllamaProvider | undefined;
let agentStatusWorkerHost: AgentStatusWorkerHost | undefined;

const SEEN_GIT_ACTIVITY_KEY = 'anytimeAgent.lastWarnedGitActivityId';
const GIT_ACTIVITY_POLL_INTERVAL_MS = 3000;

async function warnOnDestructiveGitOps(
  client: AgentStatusClient,
  context: vscode.ExtensionContext,
  logger: Pick<typeof AgentLogger, 'warn'>,
): Promise<void> {
  const rows = await client.getGitActivity();
  const lastWarned = context.workspaceState.get<number>(SEEN_GIT_ACTIVITY_KEY) ?? 0;
  const fresh = rows.filter((r) => r.destructive && r.id > lastWarned);
  if (fresh.length === 0) return;

  for (const r of fresh) {
    const who =
      r.attribution === 'claude'
        ? `Claude セッション ${r.sessionId ?? '(不明)'}`
        : r.attribution === 'agent'
          ? `エージェント ${r.agentKind ?? '(不明)'}`
          : '人間（ターミナル / 別 IDE）';
    // push は pre-push フックで記録するため「成否が確定する前」の観測になる（--dry-run や
    // リモート拒否で実際には起きないことがある）。断定せず「試行」と表現する。
    const verb = r.opType === 'push' ? '試行' : '検知';
    const msg = `破壊的な git 操作を${verb}: ${r.opType} - ${r.refName}（実行者: ${who}）`;
    logger.warn(`[git-activity] ${msg} before=${r.beforeSha ?? '-'} after=${r.afterSha ?? '-'}`);
    void vscode.window.showWarningMessage(msg);
  }

  const maxId = Math.max(...fresh.map((r) => r.id), lastWarned);
  await context.workspaceState.update(SEEN_GIT_ACTIVITY_KEY, maxId);
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  AgentLogger.info('Anytime Agent: activate');

  // === AiNote (Agent Note) === //
  // 格納先はワークスペース直下の .anytime/notes/。ワークスペース未開時のみ
  // globalStorage パスにフォールバックする。
  const workspaceRootForNotes = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const noteStorageDir = workspaceRootForNotes
    ? path.join(workspaceRootForNotes, '.anytime', 'notes')
    : context.globalStorageUri.fsPath;

  const aiNoteProvider = new AiNoteProvider(noteStorageDir);
  const aiNoteTreeView = vscode.window.createTreeView('anytimeAgent.aiNote', {
    treeDataProvider: aiNoteProvider,
  });

  const noteWatcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(vscode.Uri.file(noteStorageDir), 'anytime-note-*.md'),
  );
  noteWatcher.onDidCreate(() => aiNoteProvider.refresh());
  noteWatcher.onDidDelete(() => aiNoteProvider.refresh());

  /** ノートファイルをカスタムエディタで開く */
  async function openNoteFile(filePath: string): Promise<void> {
    const uri = vscode.Uri.file(filePath);
    for (const group of vscode.window.tabGroups.all) {
      for (const tab of group.tabs) {
        const input = tab.input as { uri?: vscode.Uri } | undefined;
        if (input?.uri?.fsPath === uri.fsPath) {
          await vscode.window.tabGroups.close(tab, true);
        }
      }
    }
    try {
      await vscode.commands.executeCommand('vscode.openWith', uri, 'anytimeMarkdown');
    } catch {
      void vscode.window.showErrorMessage(`ノートファイルを開けませんでした: ${filePath}`);
    }
  }

  // ワークスペースの .claude/skills/ へ同梱スキルを配置する
  if (workspaceRootForNotes) {
    installWorkspaceSkills({
      workspaceRoot: workspaceRootForNotes,
      extensionPath: context.extensionUri.fsPath,
      noteStorageDir,
    });
    // 開発指示の基本スキルを anytime-dev-cycle にする管理ブロックを CLAUDE.md へ upsert する
    const claudeMdGuidance = vscode.workspace
      .getConfiguration('anytimeAgent')
      .get<boolean>('claudeMdGuidance', true);
    if (claudeMdGuidance) {
      installClaudeMdGuidance({ workspaceRoot: workspaceRootForNotes });
    }
  }

  const openAiNote = vscode.commands.registerCommand(
    'anytime-agent.openAiNote',
    async () => {
      if (!fs.existsSync(noteStorageDir)) {
        fs.mkdirSync(noteStorageDir, { recursive: true });
      }
      const filePath = path.join(noteStorageDir, 'anytime-note-1.md');
      try {
        fs.writeFileSync(filePath, '', { encoding: 'utf-8', flag: 'wx' });
      } catch {
        // EEXIST: 既存ファイルは正常
      }
      aiNoteProvider.refresh();
      await openNoteFile(filePath);
    },
  );

  const openAiNoteSkill = vscode.commands.registerCommand(
    'anytime-agent.openAiNoteSkill',
    async () => {
      const skillPath = path.join(os.homedir(), '.claude', 'skills', 'anytime-note', 'SKILL.md');
      if (!fs.existsSync(skillPath)) {
        void vscode.window.showWarningMessage('スキルファイルが見つかりません。先にノートを作成してください。');
        return;
      }
      await openNoteFile(skillPath);
    },
  );

  const copyAiNotePath = vscode.commands.registerCommand(
    'anytime-agent.copyAiNotePath',
    async () => {
      const filePath = path.join(noteStorageDir, 'anytime-context.md');
      await vscode.env.clipboard.writeText(filePath);
      void vscode.window.showInformationMessage(`Copied: ${filePath}`);
    },
  );

  const clearAiNote = vscode.commands.registerCommand(
    'anytime-agent.clearAiNote',
    async () => {
      const answer = await vscode.window.showWarningMessage(
        'すべてのノートページと画像を削除しますか？',
        { modal: true },
        'Delete',
      );
      if (answer !== 'Delete') return;
      if (fs.existsSync(noteStorageDir)) {
        for (const f of fs.readdirSync(noteStorageDir)) {
          if (f.startsWith('anytime-note') && f.endsWith('.md')) {
            fs.rmSync(path.join(noteStorageDir, f));
          }
        }
        const imagesDir = path.join(noteStorageDir, 'images');
        if (fs.existsSync(imagesDir)) {
          fs.rmSync(imagesDir, { recursive: true, force: true });
        }
      }
      aiNoteProvider.refresh();
      void vscode.window.showInformationMessage('ノートをクリアしました。');
    },
  );

  const addAiNotePage = vscode.commands.registerCommand(
    'anytime-agent.addAiNotePage',
    async () => {
      if (!fs.existsSync(noteStorageDir)) {
        fs.mkdirSync(noteStorageDir, { recursive: true });
      }
      const existing = fs.existsSync(noteStorageDir)
        ? fs.readdirSync(noteStorageDir)
            .filter((f) => /^anytime-note-\d+\.md$/.test(f))
            .map((f) => Number.parseInt(f.replace('anytime-note-', '').replace('.md', ''), 10))
        : [];
      const nextNum = existing.length > 0 ? Math.max(...existing) + 1 : 1;
      const fileName = `anytime-note-${nextNum}.md`;
      const filePath = path.join(noteStorageDir, fileName);
      fs.writeFileSync(filePath, '', { encoding: 'utf-8' });
      aiNoteProvider.refresh();
      await openNoteFile(filePath);
    },
  );

  const deleteAiNotePage = vscode.commands.registerCommand(
    'anytime-agent.deleteAiNotePage',
    async (item: AiNoteItem) => {
      const answer = await vscode.window.showWarningMessage(
        `"${item.label as string}" を削除しますか？`,
        { modal: true },
        'Delete',
      );
      if (answer !== 'Delete') return;
      if (fs.existsSync(item.filePath)) {
        fs.rmSync(item.filePath);
      }
      aiNoteProvider.refresh();
    },
  );

  const openAiNotePage = vscode.commands.registerCommand(
    'anytime-agent.openAiNotePage',
    async (filePath: string) => {
      await openNoteFile(filePath);
    },
  );

  context.subscriptions.push(
    aiNoteTreeView,
    noteWatcher,
    openAiNote,
    openAiNoteSkill,
    copyAiNotePath,
    clearAiNote,
    addAiNotePage,
    deleteAiNotePage,
    openAiNotePage,
  );

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  const workspacePath = workspaceFolder?.uri.fsPath ?? process.cwd();

  // Claude Code hook を ~/.claude/settings.json に自動登録
  // trail サーバ宛 POST (token-budget / message-commits) は trail 拡張側の port 設定を参照する。
  // trail 拡張未インストール時は default port を使い、サーバ未起動なら silent fail する。
  const trailPortForHooks = vscode.workspace
    .getConfiguration('anytimeTrail.viewer')
    .get<number>('port', 19841);
  if (workspaceFolder) {
    const registered = setupClaudeHooks(workspacePath, trailPortForHooks);
    AgentLogger.info(
      `Claude hooks setup: ${registered ? 'registered' : 'skipped (already registered or .claude not found)'}`,
    );
  }

  // セッション保持期間（Claude worker prune と Codex スキャンの recency 絞り込みで共有）。
  const sessionRetentionDays = vscode.workspace
    .getConfiguration('anytimeAgent')
    .get<number>('sessionRetentionDays', 7);
  const gitActivityRetentionDays = vscode.workspace
    .getConfiguration('anytimeAgent')
    .get<number>('gitActivityRetentionDays', 90);

  // agent-status ワーカーを起動（owner は agent 拡張のみ）。既存ワーカーがいれば接続のみ。
  // SQLite を import するのはこのワーカーバンドルだけ。拡張ホストは HTTP クライアント経由で読む。
  if (workspaceFolder) {
    agentStatusWorkerHost = new AgentStatusWorkerHost(
      workspacePath,
      resolveWorkerScriptPath(context.extensionPath),
      AgentLogger,
      sessionRetentionDays,
      gitActivityRetentionDays,
    );
    agentStatusWorkerHost.start();
  }

  // Agent Mapping view
  // watcher のデータ源は agent-status ワーカーの HTTP（agent-status.db）。旧 claude-code-status.json は廃止。
  const agentStatusClient = new AgentStatusClient({ workspaceRoot: workspacePath });
  const gitActivityTimer = setInterval(() => {
    void warnOnDestructiveGitOps(agentStatusClient, context, AgentLogger).catch((err) => {
      AgentLogger.warn(`[git-activity] destructive operation polling failed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
    });
  }, GIT_ACTIVITY_POLL_INTERVAL_MS);
  gitActivityTimer.unref?.();
  context.subscriptions.push({ dispose: () => clearInterval(gitActivityTimer) });

  const watcher = new ClaudeStatusWatcher(agentStatusClient);
  // Codex セッションは rollout .jsonl の読み取り専用スキャン（worker DB 非対象）。保持期間は Claude と共有。
  const codexScanner = new CodexSessionScanner({
    retentionDays: sessionRetentionDays,
    logger: (m) => AgentLogger.warn(m),
  });
  // 使用量 API は共有トークンバケットで厳しくレート制限される。globalStorage の共有キャッシュ・TTL・
  // 指数バックオフで再取得の頻度を抑える（排他ロックは持たないため、複数ウィンドウが同時に TTL 切れを
  // 踏めば同時に fetch し得る。既知の上限は ClaudeUsageCoordinator の SHORTCUT を参照）。
  const usageCoordinator = new ClaudeUsageCoordinator({
    cachePath: vscode.Uri.joinPath(context.globalStorageUri, 'claude-usage-cache.json').fsPath,
    client: new ClaudeUsageClient(),
  });
  const mappingProvider = new AgentMappingProvider(
    watcher,
    workspacePath,
    codexScanner,
    context.extensionUri,
    usageCoordinator,
  );
  const mappingTreeView = vscode.window.createTreeView('anytimeAgent.mapping', {
    treeDataProvider: mappingProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(mappingProvider, mappingTreeView, watcher);
  if (agentStatusWorkerHost) {
    context.subscriptions.push({ dispose: () => agentStatusWorkerHost?.dispose() });
  }
  void vscode.commands.executeCommand('setContext', 'anytimeAgent.mapping.filterActive', false);

  registerHandoffSessionCommand(context);

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
    vscode.commands.registerCommand('anytime-agent.mapping.copySessionId', (item: SessionTreeItem) => {
      void vscode.env.clipboard.writeText(item.session.sessionId);
    }),
    vscode.commands.registerCommand('anytime-agent.mapping.deleteStatusFile', (item: SessionTreeItem) => {
      void mappingProvider.deleteSessionFile(item.session.sessionId);
    }),
  );

  // Ollama view
  const throttleStatusPath = path.join(workspacePath, '.anytime', 'trail', 'db', 'throttle-status.json');
  ollamaProvider = new OllamaProvider(throttleStatusPath);
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
  // context.subscriptions による dispose とは別に、deactivate でも確実にワーカーを止める。
  agentStatusWorkerHost?.dispose();
  agentStatusWorkerHost = undefined;
  AgentLogger.dispose();
}
