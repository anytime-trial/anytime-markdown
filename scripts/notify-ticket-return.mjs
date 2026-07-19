//
// チケット返却通知（要件 AL-7 / UR-11）。
//
// チケットリポジトリの post-commit hook（scripts/ticket-hooks/post-commit）から起動され、
// 直前のコミットで .tickets/*.md の assignee が user へ遷移したチケットを
// NotificationChannel（設定ファイルで切替。初期実装は LINE Messaging API push）へ通知する。
//
// best-effort（AL-7）: 設定不在・送信失敗・タイムアウトのいずれでも exit 0 とし、
// コミット・実行ループを止めない。失敗は時刻付きで stderr へログする。
//
// 設定: <ticketRepo>/.git/anytime/notify.json（git-common-dir 基点 = worktree 安全・コミット対象外）
//   { "channel": "line",
//     "line": { "channelAccessToken": "...", "to": "<userId>", "apiUrl": "(省略時 LINE 本番)" },
//     "ticketsBoardUrl": "https://<web-app>/tickets" }
//
// 通知本文はチケット id・タイトル・コミット件名・ボードリンクのみ（AL-7 本文上限。
// 外部サービスへの送信内容は先方インフラに保存され得るため、チケット本文は載せない）。
//
// SHORTCUT: hook 配線は各ローカルクローンへの core.hooksPath 手動設定のみ.
// ceiling: 配線したクローンでの返却コミットしか通知されない（別クローン・新規クローンは無通知）.
// upgrade: 別クローン運用での通知漏れが実害になったら tickets-core の CLI ラッパ経由へ統一する.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const LINE_PUSH_API_URL = 'https://api.line.me/v2/bot/message/push';
const SEND_TIMEOUT_MS = 5000;

/** stderr へ時刻付き 1 行ログを出す（hook 実行のため出力先は stderr のみ）。 */
function log(level, message) {
  process.stderr.write(`[${new Date().toISOString()}] [${level}] ${message}\n`);
}

/** フロントマターから id / title / assignee を取り出す。フロントマターが無ければ null。 */
export function parseTicketFields(content) {
  if (typeof content !== 'string') return null;
  const block = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!block) return null;
  const fields = {};
  for (const key of ['id', 'title', 'assignee']) {
    const m = block[1].match(new RegExp(`^${key}:[ \\t]*(.+?)[ \\t]*$`, 'm'));
    if (m) fields[key] = m[1].replace(/^(["'])(.*)\1$/, '$2');
  }
  return fields;
}

/** 通知対象パスか（.tickets/ 配下の md のみ。archive/ は要件 AL-2 と同じく対象外）。 */
export function isNotifiableTicketPath(path) {
  return (
    path.startsWith('.tickets/') && path.endsWith('.md') && !path.startsWith('.tickets/archive/')
  );
}

/**
 * 変更一覧から「assignee が user へ遷移した」チケットを抽出する。
 * 新規作成（旧なし）で assignee: user も返却として扱う。削除（新なし）は対象外。
 *
 * @param {Array<{path: string, oldContent: string | null, newContent: string | null}>} changes
 */
export function detectReturns(changes) {
  const returns = [];
  for (const { path, oldContent, newContent } of changes) {
    if (!isNotifiableTicketPath(path) || newContent == null) continue;
    const next = parseTicketFields(newContent);
    if (!next || next.assignee !== 'user') continue;
    const prev = oldContent == null ? null : parseTicketFields(oldContent);
    if (prev?.assignee === 'user') continue;
    returns.push({ path, id: next.id ?? path, title: next.title ?? '' });
  }
  return returns;
}

/** 通知本文を組み立てる。チケット本文は含めない（AL-7 本文上限）。 */
export function buildMessage({ id, title, subject, boardUrl }) {
  const lines = [`チケット返却: ${id} ${title}`.trim(), subject, boardUrl];
  return lines.filter(Boolean).join('\n');
}

/** LINE Messaging API push で 1 通送る。非 2xx は throw（呼び出し側でログ）。 */
export async function sendLine(lineConfig, text, fetchImpl = fetch) {
  const res = await fetchImpl(lineConfig.apiUrl ?? LINE_PUSH_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${lineConfig.channelAccessToken}`,
    },
    body: JSON.stringify({ to: lineConfig.to, messages: [{ type: 'text', text }] }),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`LINE push failed: HTTP ${res.status}`);
  }
}

// timeout: git がハング（ロック競合等）しても hook がコミットをブロックし続けないため（AL-7）
const GIT_TIMEOUT_MS = 5000;

function git(args, options = {}) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    timeout: GIT_TIMEOUT_MS,
    ...options,
  }).replace(/\n$/, '');
}

/** 失敗を WARN ログ付きで null に落とす git 呼び出し（best-effort のため中断せず続行する）。 */
function gitOrWarn(args) {
  try {
    return git(args);
  } catch (err) {
    log('WARN', `git ${args.join(' ')} failed: ${err?.message ?? err}`);
    return null;
  }
}

/**
 * `--name-status -z` 出力（STATUS NUL path [NUL path2]）を解析する。
 * R/C は旧パスを oldPath に保持し、A は oldPath なし、D は対象外として除く。
 *
 * @returns {Array<{status: string, oldPath: string | null, path: string}>}
 */
export function parseNameStatus(raw) {
  const parts = raw.split('\0').filter((s) => s.length > 0);
  const entries = [];
  let i = 0;
  while (i < parts.length) {
    const status = parts[i][0];
    if (status === 'R' || status === 'C') {
      entries.push({ status, oldPath: parts[i + 1], path: parts[i + 2] });
      i += 3;
    } else {
      entries.push({ status, oldPath: status === 'A' ? null : parts[i + 1], path: parts[i + 1] });
      i += 2;
    }
  }
  return entries.filter((e) => e.status !== 'D');
}

async function main() {
  try {
    const commonDir = resolve(git(['rev-parse', '--git-common-dir']));
    const configPath = join(commonDir, 'anytime', 'notify.json');
    if (!existsSync(configPath)) {
      log('INFO', `notify config not found, skip: ${configPath}`);
      return;
    }
    const config = JSON.parse(readFileSync(configPath, 'utf8'));

    // 親の有無は rev-list の親ハッシュ数で判定する（probe の失敗を「親なし」と混同しないため。
    // ここでの git 失敗は main の catch へ伝播し、全チケット新規扱いの誤通知を防ぐ）
    const hasParent = git(['rev-list', '--parents', '-n', '1', 'HEAD']).trim().split(/\s+/).length > 1;
    const listArgs = hasParent
      ? ['diff', '--name-status', '-M', '-z', 'HEAD~1', 'HEAD', '--', '.tickets/']
      : ['diff-tree', '--no-commit-id', '--name-status', '-r', '--root', '-z', 'HEAD', '--', '.tickets/'];
    const changes = parseNameStatus(git(listArgs)).map(({ oldPath, path }) => ({
      path,
      oldContent: oldPath == null ? null : gitOrWarn(['show', `HEAD~1:${oldPath}`]),
      newContent: gitOrWarn(['show', `HEAD:${path}`]),
    }));
    const returns = detectReturns(changes);
    if (returns.length === 0) return;

    const subject = git(['log', '-1', '--format=%s']);
    for (const ticket of returns) {
      const text = buildMessage({ ...ticket, subject, boardUrl: config.ticketsBoardUrl });
      try {
        if (config.channel === 'line') {
          await sendLine(config.line ?? {}, text);
        } else {
          throw new Error(`unknown channel: ${config.channel}`);
        }
        log('INFO', `notified return: ${ticket.id} (${ticket.path})`);
      } catch (err) {
        log('ERROR', `notify failed for ${ticket.id}: ${err?.stack ?? err}`);
      }
    }
  } catch (err) {
    log('ERROR', `notify-ticket-return aborted: ${err?.stack ?? err}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
