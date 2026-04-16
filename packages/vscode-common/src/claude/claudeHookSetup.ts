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

function hasStatusFileHook(matchers: HookMatcher[], statusFile: string): boolean {
  return matchers.some((m) =>
    m.hooks?.some((h) => h.command?.includes(statusFile))
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
  const hasPreHook = hasStatusFileHook(settings.hooks.PreToolUse, statusFile);
  const hasPostHook = hasStatusFileHook(settings.hooks.PostToolUse, statusFile);

  if (hasPreHook && hasPostHook) {
    return true;
  }

  const preCommand = `FP=$(jq -r '.tool_input.file_path // empty'); [ -n "$FP" ] && echo "{\\"editing\\":true,\\"file\\":\\"$FP\\",\\"timestamp\\":$(date +%s%3N)}" > ${statusFile}`;
  const postCommand = `FP=$(jq -r '.tool_input.file_path // empty'); [ -n "$FP" ] && echo "{\\"editing\\":false,\\"file\\":\\"$FP\\",\\"timestamp\\":$(date +%s%3N)}" > ${statusFile}`;

  if (!hasPreHook) {
    settings.hooks.PreToolUse.push({
      matcher: 'Edit|Write',
      hooks: [{ type: 'command', command: preCommand }],
    });
  }

  if (!hasPostHook) {
    settings.hooks.PostToolUse.push({
      matcher: 'Edit|Write',
      hooks: [{ type: 'command', command: postCommand }],
    });
  }

  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
  return true;
}
