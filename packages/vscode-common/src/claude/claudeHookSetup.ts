import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

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

const SESSION_GUARD_SCRIPT = `#!/bin/bash
# session-guard.sh — Check session duration and turn count, warn if thresholds exceeded
THRESHOLD_MINUTES=60
THRESHOLD_TURNS=50

read -r -d '' STDIN_DATA || true
CWD=$(echo "\$STDIN_DATA" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{process.stdout.write(JSON.parse(d).cwd||process.cwd())}catch{process.stdout.write(process.cwd())}})" 2>/dev/null)
[ -z "\$CWD" ] && CWD="\$PWD"
AGENT_HOME="\${AGENT_HOME:-\${CWD}/.anytime/agent}"
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

# ワーカー接続情報を解決（未起動なら exit 0）
AGENT_HOME="\${AGENT_HOME:-\${CWD}/.anytime/agent}"
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

HANDOFF_DIR="\${AGENT_HOME:-\${CWD}/.anytime/agent}/handoff"
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
  fs.mkdirSync(SCRIPTS_DIR, { recursive: true });
  const scriptPath = path.join(SCRIPTS_DIR, filename);
  fs.writeFileSync(scriptPath, content, { encoding: 'utf-8', mode: 0o755 });
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
  };
  [key: string]: unknown;
}

/** 指定マーカー文字列を含むフックエントリを除去する（idempotent 更新用） */
function removeHooksByMarker(entries: HookEntry[], marker: string): HookEntry[] {
  return entries.filter((e) => !e.hooks?.some((h) => h.command?.includes(marker)));
}

/**
 * agent-status 関連のステータス更新フックを除去する（idempotent 再登録用）。
 * 旧方式のファイル書き込み（claude-code-status）と新方式の POST（/api/agent-status/edit）の両方を対象にする。
 */
function removeStatusFileHooks(entries: HookEntry[]): HookEntry[] {
  return entries.filter(
    (m) =>
      !m.hooks?.some(
        (h: HookHandler) =>
          h.command?.includes('claude-code-status') ||
          h.command?.includes('/api/agent-status/edit'),
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
    writeScript('trail-token-budget.sh', tokenBudgetScriptContent(trailPort));
    writeScript('session-guard.sh', SESSION_GUARD_SCRIPT);
    writeScript('commit-tracker.sh', commitTrackerScriptContent());
    writeScript('handoff-inject.sh', handoffInjectScriptContent());
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

  // workspaceRootForHook は (a) git branch --show-current の cwd、
  // (b) plan-file hook で plannedEdits パスに前置する prefix、(c) agent-worker.json / session-guard の
  // state ディレクトリ解決 の用途で使う。setup 時に確定する workspaceRoot を基点とした絶対パスにする
  // （Bash ツールの cwd 相対だとサブパッケージ実行のたびに別ディレクトリを見てしまうため）。
  // 末尾の `/` を全削除して `/` 1 つを付け直す。正規表現を使わず CodeQL `js/polynomial-redos` の対象を回避。
  const rawRoot = workspaceRoot ?? os.homedir();
  let rootEnd = rawRoot.length;
  while (rootEnd > 0 && rawRoot.charCodeAt(rootEnd - 1) === 0x2f) rootEnd--;
  const workspaceRootForHook = rawRoot.slice(0, rootEnd) + '/';

  // agent 拡張が所有する state は `<workspace>/.anytime/agent/` 配下に集約する。
  // - agent-status ワーカーの接続情報: agent-worker.json（commit-tracker.sh / inline node フックが参照）
  // - session-guard.sh の警告デデュープ state: claude-session-guard.json（同フックが直接書く）
  // commit-tracker.sh / session-guard.sh には AGENT_HOME としてこのパスを渡す。
  const agentHome = workspaceRootForHook + '.anytime/agent';
  const agentWorkerJson = agentHome + '/agent-worker.json';

  // agent-status ワーカーへ JSON を POST する inline node コマンドを生成する。
  // 1. stdin の hook payload を読む
  // 2. agent-worker.json から url を解決（無ければ何もせず終了 = 記録欠落許容）
  // 3. buildBody(input) で /edit へ送る body を組み立てる（null を返したらスキップ）
  // 4. fetch で POST（node18+ の global fetch）。失敗は握りつぶす（exit 0 相当）
  // git branch は execSync で取得し branch フィールドに入れる。timestamp は UTC ISO 8601。
  const postEditCommand = (buildBody: string): string =>
    `node -e "let d='';process.stdin.resume();process.stdin.setEncoding('utf8');process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const i=JSON.parse(d);const fs=require('fs');let url='',tok='';try{const w=JSON.parse(fs.readFileSync('${agentWorkerJson}','utf8'));url=w.url||'';tok=w.token||''}catch{}if(!url)return;const body=(${buildBody})(i);if(!body)return;fetch(url+'/api/agent-status/edit',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+tok},body:JSON.stringify(body)}).catch(()=>{})}catch{}})"`;

  // Edit|Write フック: file と編集履歴(appendEdit)を更新する。file_path が無ければスキップ。
  // branch は workspaceRoot を cwd として取得する。
  const editBody = (editing: boolean): string =>
    `(i)=>{const fp=i.tool_input&&i.tool_input.file_path;if(!fp)return null;const sid=i.session_id||'';const ts=new Date().toISOString();let br='';try{br=require('child_process').execSync('git branch --show-current',{cwd:'${workspaceRootForHook}',timeout:3000}).toString().trim()}catch{}return{sessionId:sid,editing:${editing},file:fp,branch:br,appendEdit:{file:fp,timestamp:ts}}}`;

  // Bash フック: cwd を workspacePath として記録する。file/sessionEdits は触らない（部分更新）。
  // branch は Bash ツールの実行 cwd を基準に取得する。
  const bashBody = (editing: boolean): string =>
    `(i)=>{const cwd=i.cwd||process.cwd();const sid=i.session_id||'';let br='';try{br=require('child_process').execSync('git branch --show-current',{cwd,timeout:3000}).toString().trim()}catch{}return{sessionId:sid,editing:${editing},workspacePath:cwd,branch:br}}`;

  // プランファイル書き込み時に plannedEdits を抽出して全置換する。
  // /Shared/anytime-markdown-docs/plan/ 配下の Write のみ対象。## 変更対象ファイル セクションを読む。
  const planBody =
    `(i)=>{const fp=i.tool_input&&i.tool_input.file_path;if(!fp||!fp.startsWith('/Shared/anytime-markdown-docs/plan/'))return null;const sid=i.session_id||'';const wr='${workspaceRootForHook}';let ct='';try{ct=require('fs').readFileSync(fp,'utf8')}catch{return null}const ls=ct.split('\\n');let ins=false;const ps=[];for(const l of ls){if(l.trimEnd()==='## \\u5909\\u66f4\\u5bfe\\u8c61\\u30d5\\u30a1\\u30a4\\u30eb'){ins=true;continue}if(ins&&l.startsWith('## ')){break}if(ins&&l.startsWith('- ')){const s=l.indexOf('\`');const e=s>=0?l.indexOf('\`',s+1):-1;if(s>=0&&e>s)ps.push(wr+l.slice(s+1,e))}}return{sessionId:sid,plannedEdits:ps}}`;

  // 古い/破損したフックをすべて除去してから登録し直す（旧 claude-code-status ファイル書き込み + 新 agent-status POST）
  settings.hooks.PreToolUse = removeStatusFileHooks(settings.hooks.PreToolUse);
  settings.hooks.PostToolUse = removeStatusFileHooks(settings.hooks.PostToolUse);

  settings.hooks.PreToolUse.push({
    matcher: 'Edit|Write',
    hooks: [{ type: 'command', command: postEditCommand(editBody(true)) }],
  });
  settings.hooks.PostToolUse.push({
    matcher: 'Edit|Write',
    hooks: [{ type: 'command', command: postEditCommand(editBody(false)) }],
  });
  settings.hooks.PostToolUse.push({
    matcher: 'Write',
    hooks: [{ type: 'command', command: postEditCommand(planBody) }],
  });

  // Bash フック: cwd を workspacePath として記録し、テスト実行中も worktree を特定可能にする
  settings.hooks.PreToolUse.push({
    matcher: 'Bash',
    hooks: [{ type: 'command', command: postEditCommand(bashBody(true)) }],
  });
  settings.hooks.PostToolUse.push({
    matcher: 'Bash',
    hooks: [{ type: 'command', command: postEditCommand(bashBody(false)) }],
  });

  // PostToolUse hook: commit-tracker.sh (agent-status ワーカーへコミット検出を通知)
  settings.hooks.PostToolUse = removeHooksByMarker(settings.hooks.PostToolUse, 'commit-tracker.sh');
  settings.hooks.PostToolUse.push({
    matcher: 'Bash',
    hooks: [{ type: 'command', command: `AGENT_HOME='${agentHome}' bash ~/.claude/scripts/commit-tracker.sh`, timeout: 5 }],
  });

  // Stop hook: trail-token-budget.sh
  settings.hooks.Stop = removeHooksByMarker(settings.hooks.Stop, 'trail-token-budget.sh');
  settings.hooks.Stop.push({
    hooks: [{ type: 'command', command: '~/.claude/scripts/trail-token-budget.sh', timeout: 10 }],
  });

  // UserPromptSubmit hook: session-guard.sh
  settings.hooks.UserPromptSubmit = removeHooksByMarker(settings.hooks.UserPromptSubmit, 'session-guard.sh');
  settings.hooks.UserPromptSubmit.push({
    hooks: [{ type: 'command', command: `AGENT_HOME='${agentHome}' bash ~/.claude/scripts/session-guard.sh`, timeout: 5 }],
  });

  // UserPromptSubmit hook: handoff-inject.sh（pending handoff を先頭で一度だけ注入し消費）
  settings.hooks.UserPromptSubmit = removeHooksByMarker(settings.hooks.UserPromptSubmit, 'handoff-inject.sh');
  settings.hooks.UserPromptSubmit.push({
    hooks: [{ type: 'command', command: `AGENT_HOME='${agentHome}' bash ~/.claude/scripts/handoff-inject.sh`, timeout: 5 }],
  });

  // handoff doc・worker state が誤コミットされないよう .anytime/ を .gitignore へ
  if (workspaceRoot) ensureAnytimeGitignored(workspaceRoot);

  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
  return true;
}
