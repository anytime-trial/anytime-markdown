/**
 * ノート網ビューア関連コマンド。
 *
 * - selectNoteGraphRepository : 対象 git リポジトリを選択（設定更新）
 * - refreshNoteGraph          : 再スキャン
 * - addRelatedDoc             : クイックピックで関連ドキュメントを追記（接続モードの代替導線）
 */

import * as vscode from 'vscode';
import * as fsp from 'fs/promises';
import * as path from 'path';
import type { NoteGraphProvider } from '../providers/NoteGraphProvider';
import { resolveRepositoryRoot, scanRepository, resolveDocPath } from './scan';
import { addRelatedEntry } from './frontmatter';

type Log = (line: string) => void;

const CONFIG_SECTION = 'anytimeMarkdown';
const CONFIG_KEY = 'noteGraph.repositoryPath';

function repositoryRoot(): string | null {
  const configPath = vscode.workspace.getConfiguration(CONFIG_SECTION).get<string>(CONFIG_KEY, '') ?? '';
  const workspaceDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  return resolveRepositoryRoot(configPath, workspaceDir);
}

/** ルート相対の POSIX パスへ正規化。 */
function toPosixRel(root: string, abs: string): string {
  return path.relative(root, abs).split(path.sep).join('/');
}

export function registerNoteGraphCommands(
  context: vscode.ExtensionContext,
  provider: NoteGraphProvider,
  log: Log,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('anytime-markdown.selectNoteGraphRepository', async () => {
      const picked = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: 'ノート網の対象リポジトリを選択',
      });
      if (!picked || picked.length === 0) return;
      await vscode.workspace
        .getConfiguration(CONFIG_SECTION)
        .update(CONFIG_KEY, picked[0].fsPath, vscode.ConfigurationTarget.Workspace);
      await provider.refresh();
    }),

    vscode.commands.registerCommand('anytime-markdown.refreshNoteGraph', async () => {
      await provider.refresh();
    }),

    vscode.commands.registerCommand('anytime-markdown.addRelatedDoc', async () => {
      const root = repositoryRoot();
      if (!root) {
        void vscode.window.showWarningMessage('ノート網の対象リポジトリが見つかりません。');
        return;
      }

      let docs;
      try {
        docs = await scanRepository(root, log);
      } catch (err) {
        log(`[noteGraph] addRelatedDoc scan failed: ${String(err)}`);
        void vscode.window.showErrorMessage('ドキュメントの走査に失敗しました。');
        return;
      }
      if (docs.length < 2) {
        void vscode.window.showInformationMessage('関連付け可能なドキュメントが不足しています。');
        return;
      }

      // 接続元: アクティブな md があればそれ、なければ選択
      const activeUri = vscode.window.activeTextEditor?.document.uri;
      const activeRel = activeUri ? toPosixRel(root, activeUri.fsPath) : undefined;
      let fromRel = docs.find((d) => d.path === activeRel)?.path;
      if (!fromRel) {
        const fromPick = await vscode.window.showQuickPick(
          docs.map((d) => ({ label: d.title, description: d.path })),
          { title: '関連付けの起点ドキュメント' },
        );
        if (!fromPick) return;
        fromRel = fromPick.description;
      }

      const target = await vscode.window.showQuickPick(
        docs.filter((d) => d.path !== fromRel).map((d) => ({ label: d.title, description: d.path })),
        { title: `「${fromRel}」に関連付けるドキュメント` },
      );
      if (!target) return;

      const fromPath = resolveDocPath(root, fromRel);
      try {
        const content = await fsp.readFile(fromPath, 'utf8');
        const next = addRelatedEntry(content, target.description);
        if (next !== content) await fsp.writeFile(fromPath, next, 'utf8');
        await provider.refresh();
        log(`[noteGraph] addRelatedDoc linked ${fromRel} -> ${target.description}`);
      } catch (err) {
        log(`[noteGraph] addRelatedDoc write failed: ${String(err)}`);
        void vscode.window.showErrorMessage('関連付けの書き込みに失敗しました。');
      }
    }),
  );
}
