// commands/handoffSession.ts — ツリーの「新セッションへ引き継ぎ」コマンド。
// 生成ロジックは worker（/api/agent-status/handoff）に委譲し、拡張は (1) worker を呼び
// (2) handoff doc を書き (3) 新セッション起動 or クリップボード fallback を行うだけ。
//
// 注意: webpack バンドルは worktree symlink では検証できないため、本コマンドの挙動
// （worker 往復・ターミナル起動・注入 hook 連携）は実機 smoke で確認すること。

import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SessionTreeItem } from '../providers/AgentMappingItem';

const COMMAND_ID = 'anytime-agent.mapping.handoffSession';

function workspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

/** agent-worker.json から接続先 url と Bearer token を読む（未起動・破損なら null）。 */
function readWorkerConnection(root: string): { url: string; token: string } | null {
  try {
    const jsonPath = path.join(root, '.anytime', 'agent', 'agent-worker.json');
    const info = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as { url?: string; token?: string };
    if (!info.url) return null;
    return { url: info.url, token: info.token ?? '' };
  } catch {
    return null;
  }
}

async function handoffSession(item?: SessionTreeItem): Promise<void> {
  const sessionId = item?.session?.sessionId;
  if (!sessionId) {
    void vscode.window.showErrorMessage('引き継ぎ元セッションを特定できません。');
    return;
  }
  const root = workspaceRoot();
  if (!root) {
    void vscode.window.showErrorMessage('ワークスペースが見つかりません。');
    return;
  }

  const conn = readWorkerConnection(root);
  if (!conn) {
    void vscode.window.showErrorMessage('agent-status ワーカーが起動していません（引き継ぎを生成できません）。');
    return;
  }

  // worker に handoff 生成を依頼（解決→組成→summary 保存→レンダリング）
  let injection: string;
  try {
    const res = await fetch(`${conn.url}/api/agent-status/handoff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${conn.token}` },
      body: JSON.stringify({ sessionId }),
    });
    if (!res.ok) {
      void vscode.window.showErrorMessage(`引き継ぎ生成に失敗しました（HTTP ${res.status}）。`);
      return;
    }
    const data = (await res.json()) as { injection?: string };
    injection = data.injection ?? '';
  } catch (err) {
    void vscode.window.showErrorMessage(`引き継ぎ生成に失敗しました: ${String(err)}`);
    return;
  }

  // handoff doc を書き出す（注入 hook がこれを読んで新セッションへ注入する）
  const handoffDir = path.join(root, '.anytime', 'agent', 'handoff');
  const handoffPath = path.join(handoffDir, `${sessionId}.md`);
  try {
    fs.mkdirSync(handoffDir, { recursive: true });
    fs.writeFileSync(handoffPath, injection);
  } catch (err) {
    void vscode.window.showErrorMessage(`handoff doc の書き出しに失敗しました: ${String(err)}`);
    return;
  }

  // 新セッション起動 or クリップボード fallback
  const open = '新ターミナルで claude 起動';
  const copy = 'パスをコピー';
  const choice = await vscode.window.showInformationMessage(
    '引き継ぎを生成しました。新しいセッションを開きますか？',
    open,
    copy,
  );
  if (choice === open) {
    const term = vscode.window.createTerminal({
      name: 'claude (handoff)',
      cwd: root,
      env: { HANDOFF_PATH: handoffPath },
    });
    term.show();
    term.sendText('claude');
  } else if (choice === copy) {
    await vscode.env.clipboard.writeText(handoffPath);
    void vscode.window.showInformationMessage(
      'handoff doc のパスをコピーしました。新セッションの冒頭に貼り付けてください。',
    );
  }
}

export function registerHandoffSessionCommand(context: vscode.ExtensionContext): void {
  context.subscriptions.push(vscode.commands.registerCommand(COMMAND_ID, handoffSession));
}
