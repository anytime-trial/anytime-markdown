import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const SETTINGS_PATH = path.join(CLAUDE_DIR, 'settings.json');
const SCRIPTS_DIR = path.join(CLAUDE_DIR, 'scripts');

// ---------------------------------------------------------------------------
// Hook scripts
// ---------------------------------------------------------------------------

function tokenBudgetScriptContent(port: number): string {
  return `#!/bin/bash
PORT="\${ANYTIME_TRAIL_PORT:-${port}}"
SESSION_ID=$(node -e "let d='';process.stdin.resume();process.stdin.setEncoding('utf8');process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{process.stdout.write(JSON.parse(d).session_id||'')}catch{}})")
if [ -z "$SESSION_ID" ]; then exit 0; fi
curl -s -X POST "http://127.0.0.1:\${PORT}/api/trail/token-budget" \\
  -H "Content-Type: application/json" \\
  -d "{\\"sessionId\\":\\"$\{SESSION_ID\}\\"}" > /dev/null 2>&1 || true
exit 0
`;
}

// safe-point.sh — Stop フック（セッション終了）で HEAD をセーフポイントとして trail サーバへ記録する。
// Phase 5 S1 (Emergency Protocol)。git repo 外・detached HEAD・サーバ未起動は silent skip（常に exit 0）。
function safePointScriptContent(port: number): string {
  return `#!/bin/bash
PORT="\${ANYTIME_TRAIL_PORT:-${port}}"
read -r -d '' STDIN_DATA || true
SESSION_ID=$(echo "\$STDIN_DATA" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{process.stdout.write(JSON.parse(d).session_id||'')}catch{}})" 2>/dev/null)
CWD=$(echo "\$STDIN_DATA" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{process.stdout.write(JSON.parse(d).cwd||'')}catch{}})" 2>/dev/null)
[ -z "\$CWD" ] && CWD="\$PWD"
HEAD_SHA=$(git -C "\$CWD" rev-parse HEAD 2>/dev/null)
[ -z "\$HEAD_SHA" ] && exit 0
BRANCH=$(git -C "\$CWD" rev-parse --abbrev-ref HEAD 2>/dev/null)
# detached HEAD はロールバック起点として不安定なため記録しない
[ "\$BRANCH" = "HEAD" ] && exit 0
WORKTREE=$(git -C "\$CWD" rev-parse --show-toplevel 2>/dev/null)
CREATED_AT=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
PAYLOAD=$(node -e "process.stdout.write(JSON.stringify({createdAt:process.argv[1],commitHash:process.argv[2],branch:process.argv[3]||'',worktree:process.argv[4]||'',label:'',source:'stop_hook',sessionId:process.argv[5]||null}))" "\$CREATED_AT" "\$HEAD_SHA" "\$BRANCH" "\$WORKTREE" "\$SESSION_ID")
curl -m 3 -s -X POST "http://127.0.0.1:\${PORT}/api/trail/safe-points" \\
  -H "Content-Type: application/json" \\
  -d "\$PAYLOAD" > /dev/null 2>&1 || true
exit 0
`;
}

const SESSION_GUARD_SCRIPT = `#!/bin/bash
# session-guard.sh — Check session duration and turn count, warn if thresholds exceeded
THRESHOLD_MINUTES=60
THRESHOLD_TURNS=50

read -r -d '' STDIN_DATA || true
CWD=$(echo "\$STDIN_DATA" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{process.stdout.write(JSON.parse(d).cwd||process.cwd())}catch{process.stdout.write(process.cwd())}})" 2>/dev/null)
[ -z "\$CWD" ] && CWD="\$PWD"
. ~/.claude/scripts/lib/agent-home.sh
AGENT_HOME="\${AGENT_HOME:-}"
if [ -z "\$AGENT_HOME" ]; then AGENT_HOME="$(resolve_agent_home "\$CWD" || true)"; fi
[ -z "\$AGENT_HOME" ] && exit 0
mkdir -p "\$AGENT_HOME" 2>/dev/null || true
STATE_FILE="\${AGENT_HOME}/claude-session-guard.json"

JSONL=$(find "$HOME/.claude/projects" -maxdepth 2 -name "*.jsonl" -not -path "*/subagents/*" -printf '%T@ %p\\n' 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-)

if [ -z "$JSONL" ] || [ ! -f "$JSONL" ]; then
  exit 0
fi

FILE_AGE=$(( $(date +%s) - $(stat -c %Y "$JSONL" 2>/dev/null || echo 0) ))
if [ "$FILE_AGE" -gt 60 ]; then
  exit 0
fi

FIRST_TS=$(head -20 "$JSONL" | grep -oP '"timestamp":"[^"]+' | head -1 | cut -d'"' -f4)
TURN_COUNT=$(grep -c '"type":"user"' "$JSONL" 2>/dev/null || echo 0)

if [ -z "$FIRST_TS" ]; then
  exit 0
fi

FIRST_EPOCH=$(date -d "$FIRST_TS" +%s 2>/dev/null || echo 0)
NOW_EPOCH=$(date +%s)
ELAPSED_MIN=$(( (NOW_EPOCH - FIRST_EPOCH) / 60 ))

WARNED_FOR=""
if [ -f "$STATE_FILE" ]; then
  WARNED_FOR=$(cat "$STATE_FILE" 2>/dev/null)
fi

MSG=""
if [ "$ELAPSED_MIN" -ge "$THRESHOLD_MINUTES" ] && [ "$TURN_COUNT" -ge "$THRESHOLD_TURNS" ]; then
  MSG="[Session Guard] \${ELAPSED_MIN}min / \${TURN_COUNT} turns — both thresholds exceeded. Consider /clear or new session."
elif [ "$ELAPSED_MIN" -ge "$THRESHOLD_MINUTES" ]; then
  MSG="[Session Guard] \${ELAPSED_MIN}min elapsed (limit: \${THRESHOLD_MINUTES}min). Consider /clear or new session."
elif [ "$TURN_COUNT" -ge "$THRESHOLD_TURNS" ]; then
  MSG="[Session Guard] \${TURN_COUNT} turns (limit: \${THRESHOLD_TURNS}). Consider /clear or new session."
fi

if [ -n "$MSG" ]; then
  if [ "$WARNED_FOR" = "$JSONL" ]; then
    OVER_THRESHOLD=$(( TURN_COUNT - THRESHOLD_TURNS ))
    if [ "$OVER_THRESHOLD" -gt 0 ] && [ $(( OVER_THRESHOLD % 10 )) -eq 0 ]; then
      echo "{\\"systemMessage\\":\\"$MSG\\"}"
    fi
  else
    echo "$JSONL" > "$STATE_FILE"
    echo "{\\"systemMessage\\":\\"$MSG\\"}"
  fi
fi
`;

// commit-tracker.sh — Bash ツール後に git commit を検出し agent-status ワーカーへ通知する。
// 旧実装の git-state ファイル + trail サーバ /api/message-commits を廃止し、agent-status DB に一本化。
// 直近 HEAD はワーカーの GET から取得し、git で差分件数を数えて POST /commit する。
// ワーカー未起動（agent-worker.json 無し / 接続失敗）なら何もせず exit 0（記録欠落許容）。
function commitTrackerScriptContent(): string {
  return `#!/usr/bin/env bash
# commit-tracker.sh — detect git commits after Bash tool use and notify agent-status worker
set -eu

read -r -d '' STDIN_DATA || true
SESSION_ID=$(echo "\$STDIN_DATA" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{process.stdout.write(JSON.parse(d).session_id||'')}catch{}})")
CWD=$(echo "\$STDIN_DATA" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{process.stdout.write(JSON.parse(d).cwd||process.cwd())}catch{}})")
[ -z "\$SESSION_ID" ] && exit 0

# ワーカー接続情報を cwd 相対 walk-up で解決（未起動/非 Trail なら exit 0）
. ~/.claude/scripts/lib/agent-home.sh
AGENT_HOME="\${AGENT_HOME:-}"
if [ -z "\$AGENT_HOME" ]; then AGENT_HOME="$(resolve_agent_home "\$CWD" || true)"; fi
[ -z "\$AGENT_HOME" ] && exit 0
WORKER_JSON="\${AGENT_HOME}/agent-worker.json"
[ -f "\$WORKER_JSON" ] || exit 0
URL=$(node -e "try{process.stdout.write(JSON.parse(require('fs').readFileSync('\${WORKER_JSON}','utf8')).url||'')}catch{}")
[ -z "\$URL" ] && exit 0
TOKEN=$(node -e "try{process.stdout.write(JSON.parse(require('fs').readFileSync('\${WORKER_JSON}','utf8')).token||'')}catch{}")

CURRENT=$(cd "\$CWD" && git rev-parse HEAD 2>/dev/null || true)
[ -z "\$CURRENT" ] && exit 0

# ワーカーから直近 HEAD を取得
LAST=$(curl -s -m 2 "\${URL}/api/agent-status/\${SESSION_ID}" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{process.stdout.write((JSON.parse(d).data||{}).lastHead||'')}catch{}})" || true)

COUNT=0
HASH=""
COMMITTED_AT=""
if [ -n "\$LAST" ] && [ "\$LAST" != "\$CURRENT" ]; then
  COUNT=$(cd "\$CWD" && git rev-list --count "\${LAST}..\${CURRENT}" 2>/dev/null || echo 0)
  HASH="\$CURRENT"
  COMMITTED_AT=$(cd "\$CWD" && git log -1 --format=%cI "\$CURRENT" 2>/dev/null | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{process.stdout.write(new Date(d.trim()).toISOString())}catch{}})" || true)
fi

# POST /commit（COUNT=0 のシードでも last_head を更新）
PAYLOAD=$(node -e "const c=Number(process.argv[1])||0;const o={sessionId:process.argv[2],lastHead:process.argv[3],count:c};if(c>0){o.commitHash=process.argv[4];o.committedAt=process.argv[5]}process.stdout.write(JSON.stringify(o))" "\$COUNT" "\$SESSION_ID" "\$CURRENT" "\$HASH" "\$COMMITTED_AT")
curl -s -m 2 -X POST "\${URL}/api/agent-status/commit" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer \${TOKEN}" \\
  -d "\$PAYLOAD" > /dev/null 2>&1 || true
exit 0
`;
}

// handoff-inject.sh — UserPromptSubmit フック。新セッションの先頭で pending handoff を
// 一度だけ additionalContext として注入し、アトミック rename で消費する。
// - 注入対象は AGENT_HOME/handoff/ の最新 *.md（source==現セッションは除外＝自分へ戻さない）
// - rename に成功した 1 プロセスだけが注入（二重注入防止）
// - GC: 14 日より古い handoff を削除
function handoffInjectScriptContent(): string {
  return `#!/usr/bin/env bash
# handoff-inject.sh — inject pending session handoff once on first prompt, then consume
set -eu

read -r -d '' STDIN_DATA || true
CWD=$(echo "\$STDIN_DATA" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{process.stdout.write(JSON.parse(d).cwd||process.cwd())}catch{process.stdout.write(process.cwd())}})" 2>/dev/null)
[ -z "\$CWD" ] && CWD="\$PWD"
SID=$(echo "\$STDIN_DATA" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{process.stdout.write(JSON.parse(d).session_id||'')}catch{}})" 2>/dev/null)

# AGENT_HOME を cwd 相対 walk-up で解決（未起動/非 Trail なら exit 0）
. ~/.claude/scripts/lib/agent-home.sh
AGENT_HOME="\${AGENT_HOME:-}"
if [ -z "\$AGENT_HOME" ]; then AGENT_HOME="$(resolve_agent_home "\$CWD" || true)"; fi
[ -z "\$AGENT_HOME" ] && exit 0
HANDOFF_DIR="\${AGENT_HOME}/handoff"
[ -d "\$HANDOFF_DIR" ] || exit 0

# GC: 14 日より古い handoff（*.md / *.consumed）を削除
find "\$HANDOFF_DIR" -maxdepth 1 -name "*.md*" -mtime +14 -delete 2>/dev/null || true

# 最新の未消費 *.md を選ぶ（source==現セッションは除外）
FILES=$(ls -t "\$HANDOFF_DIR"/*.md 2>/dev/null) || exit 0
[ -z "\$FILES" ] && exit 0
FILE=""
while IFS= read -r f; do
  [ -f "\$f" ] || continue
  base=$(basename "\$f" .md)
  [ "\$base" = "\$SID" ] && continue
  FILE="\$f"; break
done <<< "\$FILES"
[ -z "\$FILE" ] && exit 0

# アトミックに消費してから注入（rename 成功者のみ注入＝二重注入防止）
CONSUMED="\${FILE}.consumed"
mv "\$FILE" "\$CONSUMED" 2>/dev/null || exit 0

node -e "const fs=require('fs');let c='';try{c=fs.readFileSync(process.argv[1],'utf8')}catch{process.exit(0)}process.stdout.write(JSON.stringify({hookSpecificOutput:{hookEventName:'UserPromptSubmit',additionalContext:c}}))" "\$CONSUMED"
exit 0
`;
}

// lib/agent-home.sh — bash 用の walk-up リゾルバ。commit-tracker / session-guard / handoff-inject が source する。
// resolve_agent_home <start_dir>: 最寄りの .anytime/agent を stdout に。見つからなければ非0（何も出力しない）。
const AGENT_HOME_LIB = `# agent-home.sh — resolve nearest .anytime/agent by walking up from a start dir.
# sourced by commit-tracker.sh / session-guard.sh / handoff-inject.sh
# resolve_agent_home <start_dir> : prints "<dir>/.anytime/agent" to stdout, or returns non-zero.
resolve_agent_home() {
  local dir="\$1"
  [ -z "\$dir" ] && dir="\$PWD"
  local stop="\${HOME:-/}"
  while [ -n "\$dir" ] && [ "\$dir" != "/" ]; do
    if [ -f "\$dir/.anytime/agent/agent-worker.json" ]; then
      printf '%s' "\$dir/.anytime/agent"; return 0
    fi
    [ "\$dir" = "\$stop" ] && break
    dir="$(dirname "\$dir")"
  done
  return 1
}
`;

// agent-status-report.mjs — 5 本の inline node hook を集約したレポータ。
// settings.json からは絶対パス無しの `node ~/.claude/scripts/agent-status-report.mjs <mode>` で呼ばれ、
// hook stdin の cwd を起点に walk-up で最寄りワーカーを解決して /api/agent-status/edit へ POST する。
function agentStatusReportContent(): string {
  return `#!/usr/bin/env node
// agent-status-report.mjs — 2 つの役割を持つ。
//   1) airspace ゲート: 並行セッションの衝突を判定し、stdout に判定 JSON を出す。
//      判定ロジックは <git-common-dir>/anytime/airspace.cjs（agent 拡張が配置）に置く。
//      **ワーカーにも DB にも VS Code にも依存しない**ため、VS Code 停止中でも動く。
//   2) agent-status ワーカーへの編集/実行状況の POST（Agent マッピング UI 用。従来どおり）。
// mode: edit-start | edit-end | bash-start | bash-end | planned | session-start | gate | loop-check
//
// **stdout は判定 JSON 専用**。ログは必ず stderr へ出す（stdout を汚すと Claude Code の
// JSON パースが壊れ、フックが機能しなくなる）。
// 失敗は常に fail-open（判定を出さずツール実行を通す）。事故防止機構が作業を止める方が有害。
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const PLAN_DIR_PREFIX = '/Shared/anytime-markdown-docs/plan/';
const CHANGE_TARGET_HEADING = '## 変更対象ファイル';
const WORKER_TIMEOUT_MS = 1500;

function warn(message) {
  process.stderr.write(\`[airspace] \${message}\\n\`);
}

function readStdin() {
  return new Promise((resolve) => {
    let d = '';
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (d += c));
    process.stdin.on('end', () => resolve(d));
  });
}

// startDir から親方向へ walk-up し、最初に見つかった .anytime/agent/agent-worker.json を採用する。
// \\$HOME / FS ルートで打ち切る。見つからなければ null。
function resolveWorker(startDir) {
  let dir = startDir;
  const stop = process.env.HOME || '/';
  for (let i = 0; i < 64; i++) {
    try {
      const w = JSON.parse(
        fs.readFileSync(path.join(dir, '.anytime/agent/agent-worker.json'), 'utf8'),
      );
      if (w && w.url) return { url: w.url, token: w.token || '', root: dir };
    } catch {
      // このディレクトリには無い。親を辿る。
    }
    if (dir === stop || dir === '/') break;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function gitOut(args, cwd) {
  try {
    return execSync(\`git \${args}\`, {
      cwd,
      timeout: 3000,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch (err) {
    // 非 Git ディレクトリ・detached HEAD 等。ゲートを無効化する（fail-open）。
    warn(\`git \${args} failed in \${cwd}: \${err.message}\`);
    return '';
  }
}

function safeBranch(cwd) {
  return gitOut('branch --show-current', cwd);
}

// 判定ロジックは git の common dir 配下に置く。common dir は全 worktree から共有され、
// git の管理対象外なので、worktree ごとに分裂せず、コミットもされない。
function loadAirspace(cwd) {
  const common = gitOut('rev-parse --git-common-dir', cwd);
  if (!common) return null;
  const abs = path.isAbsolute(common) ? common : path.resolve(cwd, common);
  const dir = path.join(abs, 'anytime');
  const modulePath = path.join(dir, 'airspace.cjs');
  if (!fs.existsSync(modulePath)) return null; // 拡張が未配置 → ゲート無効（fail-open）
  try {
    const req = createRequire(import.meta.url);
    return { api: req(modulePath), dir };
  } catch (err) {
    warn(\`failed to load \${modulePath}: \${err.message}\`);
    return null;
  }
}

function toPreToolUse(verdict) {
  if (verdict.kind === 'deny') {
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: verdict.reason,
      },
    };
  }
  if (verdict.kind === 'warn') {
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        additionalContext: verdict.reason,
      },
    };
  }
  return null;
}

// クレームを更新し、衝突判定を返す。判定不能なら null（fail-open）。
function airspaceVerdict(mode, input, cwd) {
  const loaded = loadAirspace(cwd);
  if (loaded === null) return null;
  const { api, dir } = loaded;

  // Kill Switch（Phase 5 S1）: 発動中は airspace 判定より先に全変更系ツールを遮断する。
  // ANYTIME_AIRSPACE=off（airspace 衝突ゲートの脱出口）より前に評価する。緊急停止が
  // 環境変数 1 つで無効化されては Kill Switch の意味がないため、解除経路は
  // VS Code コマンドまたは台帳削除のみに限定する（cross-review 指摘の是正）。
  // 旧バンドル（関数未搭載）は skip（fail-open・後方互換）。
  if (
    (mode === 'edit-start' || mode === 'bash-start') &&
    typeof api.readEmergencyState === 'function' &&
    typeof api.evaluateEmergencyGate === 'function'
  ) {
    const emergency = api.evaluateEmergencyGate(api.readEmergencyState(dir), dir);
    if (emergency.kind === 'deny') return toPreToolUse(emergency);
  }

  // airspace（並行セッション衝突）ゲートのみの無効化スイッチ。Kill Switch には効かない。
  if (process.env.ANYTIME_AIRSPACE === 'off') return null;

  const claudePid = api.findClaudePid(process.pid);
  if (claudePid === null) {
    warn('claude process not found in /proc ancestry; gate disabled');
    return null;
  }
  const starttime = api.readProcessStartTime(claudePid);
  if (starttime === null) return null;

  const worktree = gitOut('rev-parse --show-toplevel', cwd);
  if (!worktree) return null;

  const sessionId = input.session_id || '';
  // file は「今まさに編集中」のみを表す。編集履歴を残すと、過去に触ったファイルで誤警告が出続ける。
  const editing = mode === 'edit-start';
  const file = (editing && input.tool_input && input.tool_input.file_path) || '';

  try {
    api.writeClaim(dir, {
      sessionId,
      pid: claudePid,
      starttime,
      worktree,
      branch: safeBranch(cwd),
      file,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    warn(\`writeClaim failed: \${err.message}\`);
    return null;
  }

  // 自分自身（同一セッション・同一プロセス）は必ず除外する。単独作業では発火してはならない。
  const live = api.listLiveClaims(dir, sessionId, claudePid);
  if (live.length === 0) return null;

  if (mode === 'bash-start') {
    const command = (input.tool_input && input.tool_input.command) || '';
    // cwd を渡す。git worktree remove ../wt のような相対パス指定は cwd 基準で解決する必要がある。
    return toPreToolUse(api.evaluateBashGate(command, live, worktree, cwd));
  }
  if (mode === 'edit-start') {
    return toPreToolUse(api.evaluateEditGate(file, live));
  }
  if (mode === 'session-start') {
    const verdict = api.evaluateSessionStartGate(live, worktree);
    if (verdict.kind !== 'advise') return null;
    return {
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: verdict.reason,
      },
    };
  }
  return null;
}

// Phase 5 S2: ループ検知（PostToolUse・全ツール）。exit code を返す（0=通常 / 2=Mayday 警告）。
// 判定・状態・spool の実装は airspace.cjs バンドル側（agent-core）。ここでは配線のみ行う。
function loopCheck(input, cwd) {
  const loaded = loadAirspace(cwd);
  if (loaded === null) return 0;
  const { api, dir } = loaded;
  // 旧バンドル（関数未搭載）は skip（fail-open・後方互換）。
  if (
    typeof api.toolSignature !== 'function' ||
    typeof api.readLoopState !== 'function' ||
    typeof api.evaluateLoop !== 'function' ||
    typeof api.writeLoopState !== 'function' ||
    typeof api.appendEmergencySpool !== 'function' ||
    typeof api.writeEmergencyState !== 'function'
  ) {
    return 0;
  }
  const toolName = input.tool_name || '';
  if (!toolName) return 0;
  const sessionId = input.session_id || 'unknown';
  const signature = api.toolSignature(toolName, input.tool_input ?? null);
  const result = api.evaluateLoop(api.readLoopState(dir, sessionId), signature);
  api.writeLoopState(dir, sessionId, result.state);
  const verdict = result.verdict;
  if (verdict.kind !== 'warn' && verdict.kind !== 'kill') return 0;

  const now = new Date().toISOString();
  const detailJson = JSON.stringify({
    kind: 'loop_detected',
    tool: toolName,
    signature: verdict.signature, // 要件書 §12.4。同一 tool の異なる引数のループを事後に区別する
    count: verdict.count,
    pattern: verdict.pattern,
  });

  if (verdict.kind === 'kill') {
    const reason = \`ループ検知: \${toolName} が同一引数で \${verdict.count} 回連続実行されました\`;
    api.writeEmergencyState(dir, {
      active: true,
      reason,
      triggeredBy: 'loop-detector',
      triggeredAt: now,
    });
    api.appendEmergencySpool(
      dir,
      { occurredAt: now, event: 'kill_switch_on', reason, actor: 'agent', sessionId, detailJson },
      warn,
    );
    process.stderr.write(
      \`[Mayday] \${reason}。Kill Switch を自動発動しました。以後のツール実行は遮断されます。\` +
        \`解除は VS Code コマンド「Anytime Trail: Kill Switch 解除」または台帳 \` +
        \`\${path.join(dir, 'emergency.json')} の削除です。\\n\`,
    );
    return 2;
  }

  const reason =
    verdict.pattern === 'oscillation'
      ? \`ループ検知: 直近 \${verdict.count} 回のツール呼出が 2 種類の操作の往復になっています\`
      : \`ループ検知: \${toolName} が同一引数で \${verdict.count} 回連続実行されています\`;
  api.appendEmergencySpool(
    dir,
    { occurredAt: now, event: 'anomaly_detected', reason, actor: 'agent', sessionId, detailJson },
    warn,
  );
  const killAt = typeof api.KILL_CONSECUTIVE === 'number' ? api.KILL_CONSECUTIVE : 10;
  process.stderr.write(
    \`[Mayday] \${reason}。方針を再評価してください（同一呼出が \${killAt} 回連続に達すると \` +
      \`Kill Switch が自動発動します）。\\n\`,
  );
  return 2;
}

// claude CLI プロセスと親シェル（ターミナル）の PID を /proc の祖先から解決する。
// airspace.cjs の findClaudePid と同じ判定（comm が 'claude' で始まる。WSL 相互運用では claude.exe になり得る）。
// 非 Linux（/proc なし）・プロセス消滅時は null（PID なしで続行。ゲートと同じ fail-open）。
function resolvePids() {
  let current = process.pid;
  for (let depth = 0; depth < 8; depth += 1) {
    let comm = '';
    let ppid = 0;
    try {
      comm = fs.readFileSync('/proc/' + current + '/comm', 'utf8').trim();
      const stat = fs.readFileSync('/proc/' + current + '/stat', 'utf8');
      // stat は "pid (comm) state ppid ..."。comm 自体に空白・括弧が含まれ得るため右端の ')' から読む。
      ppid = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]);
    } catch (err) {
      warn('resolvePids failed at pid ' + current + ': ' + err.message);
      return null;
    }
    if (comm.startsWith('claude')) {
      // ppid <= 1 は親が init（ターミナル情報なし）。claude PID だけ返す。
      return { pid: current, terminalPid: Number.isFinite(ppid) && ppid > 1 ? ppid : undefined };
    }
    if (!Number.isFinite(ppid) || ppid <= 1) return null;
    current = ppid;
  }
  return null;
}

// mode ごとに /api/agent-status/edit へ送る body を組み立てる。対象外なら null。
function buildBody(mode, input, cwd, root, branch) {
  const sid = input.session_id || '';
  const ts = new Date().toISOString();
  if (mode === 'edit-start' || mode === 'edit-end') {
    const fp = input.tool_input && input.tool_input.file_path;
    if (!fp) return null;
    const pids = resolvePids();
    return {
      sessionId: sid,
      editing: mode === 'edit-start',
      file: fp,
      branch,
      workspacePath: cwd,
      appendEdit: { file: fp, timestamp: ts },
      pid: pids ? pids.pid : undefined,
      terminalPid: pids ? pids.terminalPid : undefined,
    };
  }
  if (mode === 'bash-start' || mode === 'bash-end') {
    const pids = resolvePids();
    return {
      sessionId: sid,
      editing: mode === 'bash-start',
      workspacePath: cwd,
      branch,
      pid: pids ? pids.pid : undefined,
      terminalPid: pids ? pids.terminalPid : undefined,
    };
  }
  if (mode === 'planned') {
    const fp = input.tool_input && input.tool_input.file_path;
    if (!fp || !fp.startsWith(PLAN_DIR_PREFIX)) return null;
    let content = '';
    try {
      content = fs.readFileSync(fp, 'utf8');
    } catch {
      return null;
    }
    const prefix = root.endsWith('/') ? root : root + '/';
    const planned = [];
    let inSection = false;
    for (const line of content.split('\\n')) {
      if (line.trimEnd() === CHANGE_TARGET_HEADING) {
        inSection = true;
        continue;
      }
      if (inSection && line.startsWith('## ')) break;
      if (inSection && line.startsWith('- ')) {
        const s = line.indexOf('\\\`');
        const e = s >= 0 ? line.indexOf('\\\`', s + 1) : -1;
        if (s >= 0 && e > s) planned.push(prefix + line.slice(s + 1, e));
      }
    }
    return { sessionId: sid, plannedEdits: planned };
  }
  return null;
}

async function main() {
  const mode = process.argv[2];
  let input;
  try {
    input = JSON.parse(await readStdin());
  } catch {
    process.exit(0);
  }
  const cwd = (input && input.cwd) || process.cwd();

  // Phase 5 S2: 全ツール対象の軽量モード。クレーム更新・ワーカー POST は行わず即 exit する。
  // - gate: PreToolUse（matcher なし）。Kill Switch 台帳だけを見る。S1 の edit-start/bash-start
  //   内評価は Bash/Edit|Write にしか登録されないため、Read 等を含む「全ツール deny」
  //   （要件書 §12.3）はこのモードが成立させる。Bash/Edit の二重評価は無害（同じ台帳を読むだけ）。
  // - loop-check: PostToolUse（matcher なし）。ループ検知 → warn は exit 2 の Mayday 警告、
  //   kill は台帳書込（次のツール呼出から gate が遮断）+ spool 記録。失敗は fail-open。
  if (mode === 'gate') {
    try {
      const loaded = loadAirspace(cwd);
      if (
        loaded !== null &&
        typeof loaded.api.readEmergencyState === 'function' &&
        typeof loaded.api.evaluateEmergencyGate === 'function'
      ) {
        const emergency = loaded.api.evaluateEmergencyGate(
          loaded.api.readEmergencyState(loaded.dir),
          loaded.dir,
        );
        if (emergency.kind === 'deny') {
          process.stdout.write(JSON.stringify(toPreToolUse(emergency)));
        }
      }
    } catch (err) {
      warn(\`gate mode failed: \${err.message}\`);
    }
    process.exit(0);
  }
  if (mode === 'loop-check') {
    let exitCode = 0;
    try {
      exitCode = loopCheck(input, cwd);
    } catch (err) {
      warn(\`loop-check failed: \${err.message}\`);
    }
    process.exit(exitCode);
  }

  // 1) airspace ゲート（ワーカー非依存）
  try {
    const verdict = airspaceVerdict(mode, input, cwd);
    if (verdict !== null) process.stdout.write(JSON.stringify(verdict));
  } catch (err) {
    // ゲートの失敗でツール実行を止めない（fail-open）。
    warn(\`gate failed: \${err.message}\`);
  }

  // SessionStart はワーカーへ送る状態を持たない。
  if (mode === 'session-start') process.exit(0);

  // 2) agent-status ワーカーへの POST（Agent マッピング UI 用）
  const wk = resolveWorker(cwd);
  if (!wk) process.exit(0);

  // branch の基点は常に hook の実行 cwd。git worktree/submodule では cwd 側が正しいブランチを返す。
  const branch = safeBranch(cwd);

  const body = buildBody(mode, input, cwd, wk.root, branch);
  if (!body) process.exit(0);

  try {
    // タイムアウト必須。TCP 接続を受けるが応答しないワーカーに対し、素の fetch は
    // 15 秒経っても resolve しないことを実測済み（フックがそのまま待たされる）。
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), WORKER_TIMEOUT_MS);
    try {
      await fetch(\`\${wk.url}/api/agent-status/edit\`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: \`Bearer \${wk.token}\`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    warn(\`worker post failed: \${err.message}\`);
  }
}

main();
`;
}

// ワークスペースの .gitignore に `.anytime/` を冪等で追加する（handoff doc の絶対パス・
// 会話由来の ai-title が誤コミットされるのを防ぐ）。失敗はログのみ。
function ensureAnytimeGitignored(workspaceRoot: string): void {
  try {
    const gitignorePath = path.join(workspaceRoot, '.gitignore');
    let content = '';
    try {
      content = fs.readFileSync(gitignorePath, 'utf8');
    } catch {
      // 無ければ新規作成
    }
    const hasEntry = content
      .split('\n')
      .some((line) => line.trim() === '.anytime/' || line.trim() === '.anytime');
    if (hasEntry) return;
    const prefix = content.length > 0 && !content.endsWith('\n') ? '\n' : '';
    fs.appendFileSync(gitignorePath, `${prefix}.anytime/\n`);
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') {
      console.error('[agent] Failed to update .gitignore for .anytime/:', err);
    }
  }
}

function writeScript(filename: string, content: string): void {
  const scriptPath = path.join(SCRIPTS_DIR, filename);
  // filename に `lib/` 等のサブディレクトリを含む場合も掘る
  fs.mkdirSync(path.dirname(scriptPath), { recursive: true });
  fs.writeFileSync(scriptPath, content, { encoding: 'utf-8', mode: 0o755 });
}

/** リネームで不要になった旧スクリプトを削除する（存在しなければ何もしない）。 */
function removeObsoleteScript(filename: string): void {
  fs.rmSync(path.join(SCRIPTS_DIR, filename), { force: true });
}

interface HookHandler {
  type: 'command';
  command: string;
  timeout?: number;
}

interface HookEntry {
  matcher?: string;
  hooks: HookHandler[];
}

interface ClaudeSettings {
  hooks?: {
    PreToolUse?: HookEntry[];
    PostToolUse?: HookEntry[];
    Stop?: HookEntry[];
    UserPromptSubmit?: HookEntry[];
    SessionStart?: HookEntry[];
  };
  [key: string]: unknown;
}

/** 指定マーカー文字列を含むフックエントリを除去する（idempotent 更新用） */
function removeHooksByMarker(entries: HookEntry[], marker: string): HookEntry[] {
  return entries.filter((e) => !e.hooks?.some((h) => h.command?.includes(marker)));
}

/**
 * agent-status 関連のステータス更新フックを除去する（idempotent 再登録用）。
 * - 旧方式1: ファイル書き込み（claude-code-status）
 * - 旧方式2: 絶対パス固定の inline node hook（POST /api/agent-status/edit を含む）
 * - 新方式: cwd 相対 walk-up の agent-status-report.mjs
 * のいずれも対象にし、次回生成で確実に置換する（重複積み上げ防止・旧世代マイグレーション）。
 */
function removeStatusFileHooks(entries: HookEntry[]): HookEntry[] {
  return entries.filter(
    (m) =>
      !m.hooks?.some(
        (h: HookHandler) =>
          h.command?.includes('claude-code-status') ||
          h.command?.includes('/api/agent-status/edit') ||
          h.command?.includes('agent-status-report.mjs'),
      ),
  );
}

export function setupClaudeHooks(workspaceRoot?: string, trailPort = 19841): boolean {
  if (!fs.existsSync(CLAUDE_DIR)) {
    return false;
  }

  let settings: ClaudeSettings = {};
  try {
    settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
  } catch (err: unknown) {
    if (err instanceof SyntaxError) {
      return false;
    }
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code !== 'ENOENT') {
      return false;
    }
  }

  // スクリプトファイルを作成/更新
  try {
    writeScript('lib/agent-home.sh', AGENT_HOME_LIB); // bash walk-up リゾルバ（3 script が source）
    writeScript('agent-status-report.mjs', agentStatusReportContent()); // inline node hook 5 本を集約
    writeScript('token-budget.sh', tokenBudgetScriptContent(trailPort));
    writeScript('safe-point.sh', safePointScriptContent(trailPort));
    writeScript('session-guard.sh', SESSION_GUARD_SCRIPT);
    writeScript('commit-tracker.sh', commitTrackerScriptContent());
    writeScript('handoff-inject.sh', handoffInjectScriptContent());
    removeObsoleteScript('trail-token-budget.sh'); // 旧名（token-budget.sh へリネーム）の孤児を掃除
  } catch (err) {
    // スクリプト作成失敗はログのみ（フック設定は続行）
    if (process.env.NODE_ENV !== 'test') {
      console.error('[trail] Failed to write hook scripts:', err);
    }
  }

  settings.hooks ??= {};
  settings.hooks.PreToolUse ??= [];
  settings.hooks.PostToolUse ??= [];
  settings.hooks.Stop ??= [];
  settings.hooks.UserPromptSubmit ??= [];
  settings.hooks.SessionStart ??= [];

  // hook は workspace 非依存にする。POST 先の解決は実行時の cwd 相対 walk-up
  // （agent-status-report.mjs / lib/agent-home.sh）に委ね、settings.json には絶対パスを一切焼き込まない。
  // これにより複数 workspace を同時に開いても、各セッションが自 workspace の worker へ正しく届く。

  // Edit|Write・Bash・plan-file の 5 本を単一 mjs（mode 引数で分岐）へ集約する。
  const reportCommand = (mode: string): string =>
    `node ~/.claude/scripts/agent-status-report.mjs ${mode}`;

  // 古い/破損したフックをすべて除去してから登録し直す
  // （旧 claude-code-status ファイル書き込み・旧絶対パス inline node hook・新 mjs のいずれも対象）。
  settings.hooks.PreToolUse = removeStatusFileHooks(settings.hooks.PreToolUse);
  settings.hooks.PostToolUse = removeStatusFileHooks(settings.hooks.PostToolUse);

  // timeout を明示する。未指定時の既定は 600 秒で、フックが詰まるとツール実行がその間待たされる。
  // 他のフック（commit-tracker.sh 等）に倣い 5 秒で切る。
  const REPORT_TIMEOUT_SEC = 5;

  settings.hooks.PreToolUse.push({
    matcher: 'Edit|Write',
    hooks: [{ type: 'command', command: reportCommand('edit-start'), timeout: REPORT_TIMEOUT_SEC }],
  });
  settings.hooks.PostToolUse.push({
    matcher: 'Edit|Write',
    hooks: [{ type: 'command', command: reportCommand('edit-end'), timeout: REPORT_TIMEOUT_SEC }],
  });
  settings.hooks.PostToolUse.push({
    matcher: 'Write',
    hooks: [{ type: 'command', command: reportCommand('planned'), timeout: REPORT_TIMEOUT_SEC }],
  });

  // Bash フック: cwd を workspacePath として記録し、テスト実行中も worktree を特定可能にする
  settings.hooks.PreToolUse.push({
    matcher: 'Bash',
    hooks: [{ type: 'command', command: reportCommand('bash-start'), timeout: REPORT_TIMEOUT_SEC }],
  });
  settings.hooks.PostToolUse.push({
    matcher: 'Bash',
    hooks: [{ type: 'command', command: reportCommand('bash-end'), timeout: REPORT_TIMEOUT_SEC }],
  });

  // Phase 5 S2: 全ツール対象の 2 モード（matcher なし = all tools）。
  // gate は Kill Switch 台帳のみ参照する軽量 PreToolUse（Read 等も遮断対象にする。要件書 §12.3）。
  // loop-check はループ検知の PostToolUse（warn = Mayday 警告 / kill = Kill Switch 自動発動）。
  settings.hooks.PreToolUse.push({
    hooks: [{ type: 'command', command: reportCommand('gate'), timeout: REPORT_TIMEOUT_SEC }],
  });
  settings.hooks.PostToolUse.push({
    hooks: [{ type: 'command', command: reportCommand('loop-check'), timeout: REPORT_TIMEOUT_SEC }],
  });

  // SessionStart フック: 同じ作業ツリーに他の生存セッションがいれば worktree 分離を助言する。
  // 衝突を「起こしてから迎撃する」のではなく「そもそも同じ空域に 2 機を入れない」ための入口ゲート。
  settings.hooks.SessionStart = removeHooksByMarker(
    settings.hooks.SessionStart,
    'agent-status-report.mjs',
  );
  settings.hooks.SessionStart.push({
    hooks: [
      { type: 'command', command: reportCommand('session-start'), timeout: REPORT_TIMEOUT_SEC },
    ],
  });

  // PostToolUse hook: commit-tracker.sh (agent-status ワーカーへコミット検出を通知)
  // AGENT_HOME 注入は撤去し、script 内の walk-up（lib/agent-home.sh）に解決を委ねる。
  settings.hooks.PostToolUse = removeHooksByMarker(settings.hooks.PostToolUse, 'commit-tracker.sh');
  settings.hooks.PostToolUse.push({
    matcher: 'Bash',
    hooks: [{ type: 'command', command: 'bash ~/.claude/scripts/commit-tracker.sh', timeout: 5 }],
  });

  // Stop hook: token-budget.sh
  // 旧名 trail-token-budget.sh のエントリも除去する（リネーム移行: 旧スクリプトは
  // 削除されるため、旧マーカーを残すと存在しないパスを指す stale フックになる）。
  settings.hooks.Stop = removeHooksByMarker(settings.hooks.Stop, 'trail-token-budget.sh');
  settings.hooks.Stop = removeHooksByMarker(settings.hooks.Stop, 'token-budget.sh');
  settings.hooks.Stop.push({
    hooks: [{ type: 'command', command: '~/.claude/scripts/token-budget.sh', timeout: 10 }],
  });

  // Stop hook: safe-point.sh（Phase 5 S1: セッション終了時にセーフポイントを自動記録）
  settings.hooks.Stop = removeHooksByMarker(settings.hooks.Stop, 'safe-point.sh');
  settings.hooks.Stop.push({
    hooks: [{ type: 'command', command: 'bash ~/.claude/scripts/safe-point.sh', timeout: 10 }],
  });

  // UserPromptSubmit hook: session-guard.sh（AGENT_HOME 注入は撤去し walk-up に委ねる）
  settings.hooks.UserPromptSubmit = removeHooksByMarker(settings.hooks.UserPromptSubmit, 'session-guard.sh');
  settings.hooks.UserPromptSubmit.push({
    hooks: [{ type: 'command', command: 'bash ~/.claude/scripts/session-guard.sh', timeout: 5 }],
  });

  // UserPromptSubmit hook: handoff-inject.sh（pending handoff を先頭で一度だけ注入し消費）
  settings.hooks.UserPromptSubmit = removeHooksByMarker(settings.hooks.UserPromptSubmit, 'handoff-inject.sh');
  settings.hooks.UserPromptSubmit.push({
    hooks: [{ type: 'command', command: 'bash ~/.claude/scripts/handoff-inject.sh', timeout: 5 }],
  });

  // handoff doc・worker state が誤コミットされないよう .anytime/ を .gitignore へ
  if (workspaceRoot) ensureAnytimeGitignored(workspaceRoot);

  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
  return true;
}
