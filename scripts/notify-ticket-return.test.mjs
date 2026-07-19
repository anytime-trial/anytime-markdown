import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import {
  buildMessage,
  detectReturns,
  isNotifiableTicketPath,
  parseTicketFields,
} from './notify-ticket-return.mjs';

const execFileAsync = promisify(execFile);
const SCRIPT = join(import.meta.dirname, 'notify-ticket-return.mjs');
const HOOKS_DIR = join(import.meta.dirname, 'ticket-hooks');

const ticketMd = (assignee, body = '返信して') => `---
id: T-9
title: sample ticket
status: in_progress
priority: medium
assignee: ${assignee}
workspace: anytime-markdown
---

## 概要 (Description)

${body}
`;

test('parseTicketFields: フロントマターから id/title/assignee を取り出す', () => {
  const fields = parseTicketFields(ticketMd('agent'));
  assert.deepEqual(fields, { id: 'T-9', title: 'sample ticket', assignee: 'agent' });
});

test('parseTicketFields: 引用符付きの値は引用符を外す', () => {
  const fields = parseTicketFields('---\nid: "T-1"\ntitle: \'quoted\'\nassignee: "user"\n---\n');
  assert.deepEqual(fields, { id: 'T-1', title: 'quoted', assignee: 'user' });
});

test('parseTicketFields: フロントマターが無ければ null', () => {
  assert.equal(parseTicketFields('# 本文だけ\n'), null);
});

test('isNotifiableTicketPath: .tickets/ 直下の md のみ対象・archive/ は除外', () => {
  assert.equal(isNotifiableTicketPath('.tickets/T-1-a.md'), true);
  assert.equal(isNotifiableTicketPath('.tickets/archive/T-1-a.md'), false);
  assert.equal(isNotifiableTicketPath('.tickets/note.txt'), false);
  assert.equal(isNotifiableTicketPath('README.md'), false);
});

test('detectReturns: agent→user 遷移だけを拾う', () => {
  const returns = detectReturns([
    { path: '.tickets/T-9-s.md', oldContent: ticketMd('agent'), newContent: ticketMd('user') },
    { path: '.tickets/T-2-b.md', oldContent: ticketMd('user'), newContent: ticketMd('user') },
    { path: '.tickets/T-3-c.md', oldContent: ticketMd('agent'), newContent: ticketMd('agent') },
  ]);
  assert.deepEqual(returns, [{ path: '.tickets/T-9-s.md', id: 'T-9', title: 'sample ticket' }]);
});

test('detectReturns: 新規作成（旧なし）で assignee: user なら通知対象', () => {
  const returns = detectReturns([
    { path: '.tickets/T-9-s.md', oldContent: null, newContent: ticketMd('user') },
  ]);
  assert.equal(returns.length, 1);
});

test('detectReturns: archive/ 配下と削除ファイルは無視する', () => {
  const returns = detectReturns([
    { path: '.tickets/archive/T-9-s.md', oldContent: ticketMd('agent'), newContent: ticketMd('user') },
    { path: '.tickets/T-2-b.md', oldContent: ticketMd('agent'), newContent: null },
  ]);
  assert.deepEqual(returns, []);
});

test('buildMessage: id/title/件名/リンクのみで構成しチケット本文を含めない', () => {
  const text = buildMessage({
    id: 'T-9',
    title: 'sample ticket',
    subject: 'fix(tickets): 手離し（assignee: user へ返却 +5m）',
    boardUrl: 'https://example.test/tickets',
  });
  assert.match(text, /T-9/);
  assert.match(text, /sample ticket/);
  assert.match(text, /手離し/);
  assert.match(text, /https:\/\/example\.test\/tickets/);
  assert.doesNotMatch(text, /返信して/);
});

/** 統合テスト用の一時チケットリポジトリと通知モックサーバー。 */
async function setupRepo() {
  const repo = mkdtempSync(join(tmpdir(), 'notify-ticket-'));
  const gitEnv = ['-c', 'user.name=test', '-c', 'user.email=test@example.test'];
  const run = (args, opts = {}) => execFileAsync('git', [...gitEnv, ...args], { cwd: repo, ...opts });
  await run(['init', '-q']);
  mkdirSync(join(repo, '.tickets'), { recursive: true });
  writeFileSync(join(repo, '.tickets', 'T-9-sample.md'), ticketMd('agent', '本文シークレット'));
  await run(['add', '.tickets/T-9-sample.md']);
  await run(['commit', '-q', '-m', 'chore(tickets): T-9 起票']);

  const requests = [];
  let statusCode = 200;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      requests.push({ headers: req.headers, body });
      res.statusCode = statusCode;
      res.end('{}');
    });
  });
  await new Promise((res) => server.listen(0, '127.0.0.1', res));
  const apiUrl = `http://127.0.0.1:${server.address().port}/push`;

  const writeConfig = (extra = {}) => {
    mkdirSync(join(repo, '.git', 'anytime'), { recursive: true });
    writeFileSync(
      join(repo, '.git', 'anytime', 'notify.json'),
      JSON.stringify({
        channel: 'line',
        line: { channelAccessToken: 'tok-abc', to: 'U123', apiUrl },
        ticketsBoardUrl: 'https://example.test/tickets',
        ...extra,
      }),
    );
  };

  const returnTicket = async (subject = 'fix(tickets): T-9 手離し（assignee: user へ返却 +3m）') => {
    writeFileSync(join(repo, '.tickets', 'T-9-sample.md'), ticketMd('user', '本文シークレット'));
    await run(['add', '.tickets/T-9-sample.md']);
    await run(['commit', '-q', '-m', subject]);
  };

  const runScript = () => execFileAsync('node', [SCRIPT], { cwd: repo });

  const cleanup = () => {
    server.close();
    rmSync(repo, { recursive: true, force: true });
  };
  return {
    repo,
    run,
    requests,
    writeConfig,
    returnTicket,
    runScript,
    setStatus: (code) => (statusCode = code),
    cleanup,
  };
}

test('統合: 返却コミットで LINE push が発火し本文は含まれない', async () => {
  const ctx = await setupRepo();
  try {
    ctx.writeConfig();
    await ctx.returnTicket();
    const { stderr } = await ctx.runScript();
    assert.equal(ctx.requests.length, 1);
    assert.equal(ctx.requests[0].headers.authorization, 'Bearer tok-abc');
    const payload = JSON.parse(ctx.requests[0].body);
    assert.equal(payload.to, 'U123');
    assert.match(payload.messages[0].text, /T-9/);
    assert.match(payload.messages[0].text, /sample ticket/);
    assert.match(payload.messages[0].text, /https:\/\/example\.test\/tickets/);
    assert.doesNotMatch(payload.messages[0].text, /本文シークレット/);
    assert.match(stderr, /notified/);
  } finally {
    ctx.cleanup();
  }
});

test('統合: assignee 遷移の無いコミットでは発火しない', async () => {
  const ctx = await setupRepo();
  try {
    ctx.writeConfig();
    writeFileSync(join(ctx.repo, '.tickets', 'T-9-sample.md'), ticketMd('agent', '本文だけ更新'));
    await ctx.run(['add', '.tickets/T-9-sample.md']);
    await ctx.run(['commit', '-q', '-m', 'chore(tickets): 本文更新']);
    await ctx.runScript();
    assert.equal(ctx.requests.length, 0);
  } finally {
    ctx.cleanup();
  }
});

test('統合: 設定ファイル不在なら exit 0 で skip をログする', async () => {
  const ctx = await setupRepo();
  try {
    await ctx.returnTicket();
    const { stderr } = await ctx.runScript();
    assert.match(stderr, /notify config not found/);
    assert.equal(ctx.requests.length, 0);
  } finally {
    ctx.cleanup();
  }
});

test('統合: HTTP 500 でも exit 0 でエラーをログする', async () => {
  const ctx = await setupRepo();
  try {
    ctx.writeConfig();
    ctx.setStatus(500);
    await ctx.returnTicket();
    const { stderr } = await ctx.runScript();
    assert.match(stderr, /\[ERROR\]/);
    assert.equal(ctx.requests.length, 1);
  } finally {
    ctx.cleanup();
  }
});

test('統合: core.hooksPath 配線で git commit から発火する', async () => {
  const ctx = await setupRepo();
  try {
    ctx.writeConfig();
    await ctx.run(['config', 'core.hooksPath', HOOKS_DIR]);
    await ctx.returnTicket();
    assert.equal(ctx.requests.length, 1);
  } finally {
    ctx.cleanup();
  }
});
