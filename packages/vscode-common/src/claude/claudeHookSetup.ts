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
STATE_FILE="/tmp/claude-session-guard.json"

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

function commitTrackerScriptContent(port: number): string {
  return `#!/usr/bin/env bash
# commit-tracker.sh — detect git commits after Bash tool use and notify Trail
set -eu
STATE_DIR="\${HOME}/.vscode-server/data/User/globalStorage/anytime-trial.anytime-trail/git-state"
mkdir -p "\$STATE_DIR"

read -r -d '' STDIN_DATA || true
SESSION_ID=$(echo "\$STDIN_DATA" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{process.stdout.write(JSON.parse(d).session_id||'')}catch{}})")
CWD=$(echo "\$STDIN_DATA" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{process.stdout.write(JSON.parse(d).cwd||process.cwd())}catch{}})")
TRANSCRIPT=$(echo "\$STDIN_DATA" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{process.stdout.write(JSON.parse(d).transcript_path||'')}catch{}})")
[ -z "\$SESSION_ID" ] && exit 0

STATE_FILE="\$STATE_DIR/claude-code-git-state-\${SESSION_ID}.json"
CURRENT=$(cd "\$CWD" && git rev-parse HEAD 2>/dev/null || true)
[ -z "\$CURRENT" ] && exit 0

LAST=""
[ -f "\$STATE_FILE" ] && LAST=$(node -e "try{process.stdout.write(JSON.parse(require('fs').readFileSync('\${STATE_FILE}','utf8')).lastHead||'')}catch{}")

if [ "\$LAST" != "\$CURRENT" ] && [ -n "\$LAST" ]; then
  UUID=$(node -e "const fs=require('fs');try{const lines=fs.readFileSync('\${TRANSCRIPT}','utf8').trim().split('\\\\n');for(let i=lines.length-1;i>=0;i--){const o=JSON.parse(lines[i]);if(o.type==='assistant'&&o.uuid){process.stdout.write(o.uuid);break}}}catch{}")
  COMMITS=$(cd "\$CWD" && git log "\${LAST}..\${CURRENT}" --format=%H 2>/dev/null || true)
  PORT="\${ANYTIME_TRAIL_PORT:-${port}}"
  for HASH in \$COMMITS; do
    [ -z "\$UUID" ] || curl -s -m 2 -X POST "http://localhost:\${PORT}/api/message-commits" \\
      -H "Content-Type: application/json" \\
      -d "{\\"messageUuid\\":\\"\${UUID}\\",\\"sessionId\\":\\"\${SESSION_ID}\\",\\"commitHash\\":\\"\${HASH}\\",\\"matchConfidence\\":\\"realtime\\"}" || true
  done
fi

node -e "require('fs').writeFileSync('\${STATE_FILE}',JSON.stringify({sessionId:'\${SESSION_ID}',lastHead:'\${CURRENT}',updatedAt:new Date().toISOString()}))" || true
exit 0
`;
}

function writeScript(filename: string, content: string): void {
  fs.mkdirSync(SCRIPTS_DIR, { recursive: true });
  const scriptPath = path.join(SCRIPTS_DIR, filename);
  fs.writeFileSync(scriptPath, content, { encoding: 'utf-8', mode: 0o755 });
}

function buildStatusFilePath(workspaceRoot?: string, statusDir?: string): string {
  const dir = statusDir ?? '.vscode';
  if (path.isAbsolute(dir)) {
    return path.join(dir, 'claude-code-status.json');
  }
  const base = workspaceRoot ?? os.homedir();
  return path.join(base, dir, 'claude-code-status.json');
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

export function getStatusFilePath(workspaceRoot?: string, statusDir?: string): string {
  return buildStatusFilePath(workspaceRoot, statusDir);
}

/** 指定マーカー文字列を含むフックエントリを除去する（idempotent 更新用） */
function removeHooksByMarker(entries: HookEntry[], marker: string): HookEntry[] {
  return entries.filter((e) => !e.hooks?.some((h) => h.command?.includes(marker)));
}

/** セッション ID を含むステータスファイルパスのパターンを返す（glob 用） */
export function getStatusFileGlob(workspaceRoot?: string, statusDir?: string): string {
  const dir = statusDir ?? '.vscode';
  const base = workspaceRoot
    ? (path.isAbsolute(dir) ? dir : path.join(workspaceRoot, dir))
    : (path.isAbsolute(dir) ? dir : path.join(os.homedir(), dir));
  return path.join(base, 'claude-code-status*.json');
}

/** claude-code-status 関連の書き込みを含むフックエントリを除去する */
function removeStatusFileHooks(entries: HookEntry[]): HookEntry[] {
  return entries.filter(
    (m) => !m.hooks?.some((h: HookHandler) => h.command?.includes('claude-code-status'))
  );
}

export function setupClaudeHooks(workspaceRoot?: string, statusDir?: string, trailPort = 19841): boolean {
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
    writeScript('commit-tracker.sh', commitTrackerScriptContent(trailPort));
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

  const statusFile = buildStatusFilePath(workspaceRoot, statusDir);
  const statusFileBase = statusFile.replace(/\.json$/, '');
  const workspaceRootForHook = path.dirname(path.dirname(statusFile)) + '/';

  // stdin の JSON を読み取り、セッション履歴を保持しながらステータスファイルを更新する。
  // session_id がある場合は claude-code-status-{sessionId}.json に書き込む（マルチエージェント対応）。
  // session_id が空の場合は従来の claude-code-status.json に書き込む（後方互換）。
  // git branch --show-current で現在のブランチ名を取得し branch フィールドに書き込む。
  // timestamp は UTC ISO 8601 文字列で記録する。
  const makeCommand = (editing: boolean): string =>
    `node -e "let d='';process.stdin.resume();process.stdin.setEncoding('utf8');process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const i=JSON.parse(d),fp=i.tool_input?.file_path;if(!fp)return;const sid=i.session_id||'',fs=require('fs'),fb='${statusFileBase}',f=sid?fb+'-'+sid+'.json':fb+'.json',ts=new Date().toISOString();let br='';try{br=require('child_process').execSync('git branch --show-current',{cwd:'${workspaceRootForHook}',timeout:3000}).toString().trim()}catch{}let c={};try{c=JSON.parse(fs.readFileSync(f,'utf8'))}catch{}const e=(c.sessionId===sid)?(c.sessionEdits||[]):[];const j=e.findIndex(x=>x.file===fp);if(j>=0)e[j].timestamp=ts;else e.push({file:fp,timestamp:ts});fs.writeFileSync(f,JSON.stringify({editing:${editing},file:fp,timestamp:ts,sessionId:sid,sessionEdits:e,plannedEdits:c.plannedEdits||[],branch:br}))}catch{}})"`;

  // プランファイル書き込み時に plannedEdits を更新するフック。
  // /Shared/anytime-markdown-docs/plan/ 配下のファイルが Write ツールで書き込まれたとき、
  // ## 変更対象ファイル セクションからパスを抽出して plannedEdits に書き込む。
  const planHookCommand =
    `node -e "let d='';process.stdin.resume();process.stdin.setEncoding('utf8');process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const i=JSON.parse(d),fp=i.tool_input?.file_path;if(!fp||!fp.startsWith('/Shared/anytime-markdown-docs/plan/'))return;const sid=i.session_id||'',fs=require('fs'),fb='${statusFileBase}',f=sid?fb+'-'+sid+'.json':fb+'.json',wr='${workspaceRootForHook}';let ct='';try{ct=fs.readFileSync(fp,'utf8')}catch{return}const ls=ct.split('\\n');let ins=false;const ps=[];for(const l of ls){if(l.trimEnd()==='## \\u5909\\u66f4\\u5bfe\\u8c61\\u30d5\\u30a1\\u30a4\\u30eb'){ins=true;continue}if(ins&&l.startsWith('## ')){break}if(ins&&l.startsWith('- ')){const s=l.indexOf('\`');const e=s>=0?l.indexOf('\`',s+1):-1;if(s>=0&&e>s)ps.push(wr+l.slice(s+1,e))}}let c={};try{c=JSON.parse(fs.readFileSync(f,'utf8'))}catch{}c.plannedEdits=ps;fs.writeFileSync(f,JSON.stringify(c))}catch{}})"`;

  // 古い/破損したフックをすべて除去してから登録し直す
  settings.hooks.PreToolUse = removeStatusFileHooks(settings.hooks.PreToolUse);
  settings.hooks.PostToolUse = removeStatusFileHooks(settings.hooks.PostToolUse);

  settings.hooks.PreToolUse.push({
    matcher: 'Edit|Write',
    hooks: [{ type: 'command', command: makeCommand(true) }],
  });
  settings.hooks.PostToolUse.push({
    matcher: 'Edit|Write',
    hooks: [{ type: 'command', command: makeCommand(false) }],
  });
  settings.hooks.PostToolUse.push({
    matcher: 'Write',
    hooks: [{ type: 'command', command: planHookCommand }],
  });

  // PostToolUse hook: commit-tracker.sh (realtime message_commits recording)
  settings.hooks.PostToolUse = removeHooksByMarker(settings.hooks.PostToolUse, 'commit-tracker.sh');
  settings.hooks.PostToolUse.push({
    matcher: 'Bash',
    hooks: [{ type: 'command', command: 'bash ~/.claude/scripts/commit-tracker.sh', timeout: 5 }],
  });

  // Stop hook: trail-token-budget.sh
  settings.hooks.Stop = removeHooksByMarker(settings.hooks.Stop, 'trail-token-budget.sh');
  settings.hooks.Stop.push({
    hooks: [{ type: 'command', command: '~/.claude/scripts/trail-token-budget.sh', timeout: 10 }],
  });

  // UserPromptSubmit hook: session-guard.sh
  settings.hooks.UserPromptSubmit = removeHooksByMarker(settings.hooks.UserPromptSubmit, 'session-guard.sh');
  settings.hooks.UserPromptSubmit.push({
    hooks: [{ type: 'command', command: 'bash ~/.claude/scripts/session-guard.sh', timeout: 5 }],
  });

  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
  return true;
}
