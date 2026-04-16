import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const SETTINGS_PATH = path.join(CLAUDE_DIR, 'settings.json');

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
}

interface HookMatcher {
  matcher: string;
  hooks: HookHandler[];
}

interface ClaudeSettings {
  hooks?: {
    PreToolUse?: HookMatcher[];
    PostToolUse?: HookMatcher[];
  };
  [key: string]: unknown;
}

export function getStatusFilePath(workspaceRoot?: string, statusDir?: string): string {
  return buildStatusFilePath(workspaceRoot, statusDir);
}

/** claude-code-status.json への書き込みを含むフックエントリを除去する */
function removeStatusFileHooks(matchers: HookMatcher[]): HookMatcher[] {
  return matchers.filter(
    (m) => !m.hooks?.some((h) => h.command?.includes('claude-code-status.json'))
  );
}

export function setupClaudeHooks(workspaceRoot?: string, statusDir?: string): boolean {
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

  settings.hooks ??= {};
  settings.hooks.PreToolUse ??= [];
  settings.hooks.PostToolUse ??= [];

  const statusFile = buildStatusFilePath(workspaceRoot, statusDir);
  // stdin の JSON を読み取り、セッション履歴を保持しながらステータスファイルを更新する。
  // session_id が変わった場合は sessionEdits をリセットし新セッションとして記録する。
  // timestamp は UTC ISO 8601 文字列で記録する。
  const makeCommand = (editing: boolean): string =>
    `node -e "let d='';process.stdin.resume();process.stdin.setEncoding('utf8');process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const i=JSON.parse(d),fp=i.tool_input?.file_path;if(!fp)return;const sid=i.session_id||'',fs=require('fs'),f='${statusFile}',ts=new Date().toISOString();let c={};try{c=JSON.parse(fs.readFileSync(f,'utf8'))}catch{}const e=(c.sessionId===sid)?(c.sessionEdits||[]):[];const j=e.findIndex(x=>x.file===fp);if(j>=0)e[j].timestamp=ts;else e.push({file:fp,timestamp:ts});fs.writeFileSync(f,JSON.stringify({editing:${editing},file:fp,timestamp:ts,sessionId:sid,sessionEdits:e}))}catch{}})"`;
  const preCommand = makeCommand(true);
  const postCommand = makeCommand(false);

  // 古い/破損したフックをすべて除去してから登録し直す
  settings.hooks.PreToolUse = removeStatusFileHooks(settings.hooks.PreToolUse);
  settings.hooks.PostToolUse = removeStatusFileHooks(settings.hooks.PostToolUse);

  settings.hooks.PreToolUse.push({
    matcher: 'Edit|Write',
    hooks: [{ type: 'command', command: preCommand }],
  });
  settings.hooks.PostToolUse.push({
    matcher: 'Edit|Write',
    hooks: [{ type: 'command', command: postCommand }],
  });

  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
  return true;
}
