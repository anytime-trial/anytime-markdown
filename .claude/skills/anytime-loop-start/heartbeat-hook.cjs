#!/usr/bin/env node
// heartbeat-hook.cjs — 委譲マーカーの heartbeat 更新（anytime-loop-start 同梱スクリプト）
//
// 委譲子セッション（headless claude -p）の hooks から呼ばれ、環境変数
// TICKET_DELEGATION_MARKER が指すマーカー JSON へ state / lastActivity / updatedAt を
// 追記する。ランチャーが --settings で本スクリプトを配線し、export した env で
// マーカーを特定する（グローバル・プロジェクト settings には配線しない）。
//
// 不変条件:
// - 既存フィールド（ticket / pid / startedAt）には触れない（tick 手順 1 の死亡検知と互換）
// - マーカー不在時に新規作成しない（「マーカーを先に書いてから起動」の契約を侵さない）
// - 書き込みは同一ディレクトリ tmp → rename の原子置換（tick が半端な JSON を読まない）
// - hook はいかなる失敗でも exit 0（heartbeat の失敗で子の本作業を止めない。ただし
//   stderr へ WARN を出す — silent catch 禁止）
//
// state enum: running（PostToolUse）/ done（Stop・SessionEnd）。
// blocked / failed は予約値（blocked は §2 の質問化がチケット側に現れるため Phase 1 では
// 書かない。failed はマーカーが自身のクラッシュを書けないため tick の死亡検知が担う）。
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const EVENT_STATE = {
  posttool: 'running',
  stop: 'done',
  sessionend: 'done',
};

function log(level, msg) {
  process.stderr.write(`[${new Date().toISOString()}] [${level}] heartbeat-hook: ${msg}\n`);
}

function readStdinJson() {
  let raw = '';
  try {
    raw = fs.readFileSync(0, 'utf8');
  } catch (err) {
    log('WARN', `stdin read failed: ${err.message}`);
    return {};
  }
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch (err) {
    log('WARN', `stdin parse failed: ${err.message}`);
    return {};
  }
}

function main() {
  const markerPath = process.env.TICKET_DELEGATION_MARKER;
  // 委譲子セッション以外（env 未設定）では何もしない — 設計上の分岐でありエラーではない
  if (!markerPath) return;

  const event = (process.argv[2] || '').toLowerCase();
  const state = EVENT_STATE[event];
  if (!state) {
    log('WARN', `unknown event: "${event}" (marker: ${markerPath})`);
    return;
  }

  let marker;
  try {
    marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
  } catch (err) {
    log('WARN', `marker read failed (${markerPath}): ${err.message}`);
    return;
  }

  // Stop / SessionEnd 後に遅延発火した PostToolUse で done を running へ戻さない
  if (marker.state === 'done' && state === 'running') return;

  const input = readStdinJson();
  marker.state = state;
  if (typeof input.tool_name === 'string' && input.tool_name) {
    marker.lastActivity = input.tool_name;
  } else if (event !== 'posttool') {
    marker.lastActivity = event;
  }
  if (event === 'sessionend' && typeof input.reason === 'string' && input.reason) {
    marker.endReason = input.reason;
  }
  marker.updatedAt = new Date().toISOString();

  // SHORTCUT: 書き手同士（並行 PostToolUse hook）の read-modify-write は排他しない（最後の rename が勝つ）.
  // ceiling: 並行発火時に lastActivity/state が僅差の別イベント値で上書きされ得る（updatedAt は各 hook が
  // 自身の現在時刻を書くため鮮度は保たれ、死亡検知は pid 判定で本 state に依存しない）.
  // upgrade: 手順 1/8 の観測で state 誤りが実測されたらファイルロック（flock / 楽観 CAS）を導入.
  const tmp = path.join(
    path.dirname(markerPath),
    `.${path.basename(markerPath)}.tmp-${process.pid}`
  );
  try {
    fs.writeFileSync(tmp, `${JSON.stringify(marker)}\n`);
    fs.renameSync(tmp, markerPath);
  } catch (err) {
    log('WARN', `marker write failed (${markerPath}): ${err.message}`);
    try {
      fs.rmSync(tmp, { force: true });
    } catch (rmErr) {
      log('WARN', `tmp cleanup failed (${tmp}): ${rmErr.message}`);
    }
  }
}

main();
