// commands/handoffSession.ts — ツリーの「新セッションへ引き継ぎ」コマンド。
// 生成ロジックは worker（/api/agent-status/handoff）に委譲し、拡張は (1) worker を呼び
// (2) handoff doc を書き (3) 新セッション起動 or クリップボード fallback を行うだけ。
//
// Claude と Codex で新セッションへの初期入力の渡し方が異なる。
// - Claude: `claude` を対話シェルへ typing し、`HANDOFF_PATH` 環境変数を hook が読んで注入する。
// - Codex: `codex [PROMPT]` の PROMPT に圧縮ステートをそのまま渡す必要がある（resume/fork 不可）。
//   PROMPT は rollout 由来の信頼できない本文であり、シェルへ文字列連結すると `$()` や引用符が
//   再解釈され任意コマンド実行につながる（SEC-03）。そのため `sendText` は使わず、
//   `TerminalOptions.shellPath/shellArgs` で codex プロセスを直接起動する。shellArgs は argv
//   として渡り、シェルを経由しないため本文がどのような文字列でも再解釈されない。
//
// 注意: webpack バンドルは worktree symlink では検証できないため、本コマンドの挙動
// （worker 往復・ターミナル起動・注入 hook 連携）は実機 smoke で確認すること。

import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { AgentSource } from '@anytime-markdown/agent-core';
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

interface HandoffGenerated {
  readonly injection: string;
  /** Codex のみ。rollout の session_meta.cwd。 */
  readonly cwd?: string;
}

/** worker に handoff 生成を依頼する（解決→組成→レンダリング）。失敗時は error に理由文字列。 */
async function requestHandoff(
  conn: { url: string; token: string },
  sessionId: string,
  source: AgentSource,
): Promise<{ ok: true; data: HandoffGenerated } | { ok: false; error: string }> {
  let res: Response;
  try {
    res = await fetch(`${conn.url}/api/agent-status/handoff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${conn.token}` },
      body: JSON.stringify({ sessionId, source }),
    });
  } catch (err) {
    return { ok: false, error: `引き継ぎ生成に失敗しました: ${String(err)}` };
  }
  if (!res.ok) {
    let reason = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) reason = body.error;
    } catch {
      // ボディが JSON でなければ HTTP ステータスのみで報告する
    }
    return { ok: false, error: `引き継ぎ生成に失敗しました（${reason}）。` };
  }
  const data = (await res.json()) as { injection?: string; cwd?: string };
  return { ok: true, data: { injection: data.injection ?? '', cwd: data.cwd } };
}

/** `codex` CLI が起動可能か（PATH 上に存在し実行できるか）を確認する。 */
function isCodexCliAvailable(): boolean {
  const result = spawnSync('codex', ['--version'], { stdio: 'ignore', timeout: 5000 });
  return result.error === undefined && result.status === 0;
}

function launchClaudeTerminal(root: string, handoffPath: string): void {
  const term = vscode.window.createTerminal({
    name: 'claude (handoff)',
    cwd: root,
    env: { HANDOFF_PATH: handoffPath },
  });
  term.show();
  term.sendText('claude');
}

/**
 * codex を新規セッション（新しい session ID）で起動する。`codex fork`/`codex resume` は使わず
 * `codex [PROMPT]` 形式で起動する。shellArgs に injection をそのまま渡す（シェル非経由）。
 */
function launchCodexTerminal(cwd: string, injection: string): void {
  const term = vscode.window.createTerminal({
    name: 'codex (handoff)',
    cwd,
    shellPath: 'codex',
    shellArgs: [injection],
  });
  term.show();
}

async function handoffSession(item?: SessionTreeItem): Promise<void> {
  const sessionId = item?.session?.sessionId;
  const source: AgentSource = item?.session?.source ?? 'claude';
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

  const generated = await requestHandoff(conn, sessionId, source);
  if (!generated.ok) {
    void vscode.window.showErrorMessage(generated.error);
    return;
  }
  const { injection, cwd } = generated.data;

  // Codex は起動ディレクトリが必須（FR-05）。記録済み cwd が無い/実在しなければ起動できない。
  if (source === 'codex' && (!cwd || !fs.existsSync(cwd))) {
    void vscode.window.showErrorMessage('引き継ぎ元セッションの作業ディレクトリが見つかりません。');
    return;
  }

  // handoff doc を書き出す（Claude は注入 hook が読む。Codex は失敗時のパスコピー用）。
  const handoffDir = path.join(root, '.anytime', 'agent', 'handoff');
  const handoffPath = path.join(handoffDir, `${sessionId}.md`);
  try {
    fs.mkdirSync(handoffDir, { recursive: true });
    fs.writeFileSync(handoffPath, injection);
  } catch (err) {
    void vscode.window.showErrorMessage(`handoff doc の書き出しに失敗しました: ${String(err)}`);
    return;
  }

  if (source === 'codex' && !isCodexCliAvailable()) {
    void vscode.window.showErrorMessage(
      'Codex CLI を起動できません（PATH 上に見つからないか実行できません）。パスコピーで手動引き継ぎしてください。',
    );
    return;
  }

  // 新セッション起動 or クリップボード fallback
  const openLabel = source === 'codex' ? '新ターミナルで codex 起動' : '新ターミナルで claude 起動';
  const copy = 'パスをコピー';
  const choice = await vscode.window.showInformationMessage(
    '引き継ぎを生成しました。新しいセッションを開きますか？',
    openLabel,
    copy,
  );
  if (choice === openLabel) {
    if (source === 'codex') {
      // cwd は直前の existsSync チェックで非 undefined が確定している。
      launchCodexTerminal(cwd as string, injection);
    } else {
      launchClaudeTerminal(root, handoffPath);
    }
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
