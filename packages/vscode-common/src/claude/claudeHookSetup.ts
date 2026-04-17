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

/** セッション ID を含むステータスファイルパスのパターンを返す（glob 用） */
export function getStatusFileGlob(workspaceRoot?: string, statusDir?: string): string {
  const dir = statusDir ?? '.vscode';
  const base = workspaceRoot
    ? (path.isAbsolute(dir) ? dir : path.join(workspaceRoot, dir))
    : (path.isAbsolute(dir) ? dir : path.join(os.homedir(), dir));
  return path.join(base, 'claude-code-status*.json');
}

/** claude-code-status 関連の書き込みを含むフックエントリを除去する */
function removeStatusFileHooks(matchers: HookMatcher[]): HookMatcher[] {
  return matchers.filter(
    (m) => !m.hooks?.some((h) => h.command?.includes('claude-code-status'))
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

  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
  return true;
}
