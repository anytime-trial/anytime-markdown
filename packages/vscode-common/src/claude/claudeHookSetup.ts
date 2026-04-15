import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const STATUS_FILE = path.join(os.homedir(), '.vscode', 'claude-code-status.json');
const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const SETTINGS_PATH = path.join(CLAUDE_DIR, 'settings.json');

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

export function getStatusFilePath(): string {
  return STATUS_FILE;
}

function hasStatusFileHook(matchers: HookMatcher[]): boolean {
  return matchers.some((m) =>
    m.hooks?.some((h) => h.command?.includes(STATUS_FILE))
  );
}

export function setupClaudeHooks(): boolean {
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

  const hasPreHook = hasStatusFileHook(settings.hooks.PreToolUse);
  const hasPostHook = hasStatusFileHook(settings.hooks.PostToolUse);

  if (hasPreHook && hasPostHook) {
    return true;
  }

  const preCommand = `FP=$(jq -r '.tool_input.file_path // empty'); [ -n "$FP" ] && echo "{\\"editing\\":true,\\"file\\":\\"$FP\\",\\"timestamp\\":$(date +%s%3N)}" > ${STATUS_FILE}`;
  const postCommand = `FP=$(jq -r '.tool_input.file_path // empty'); [ -n "$FP" ] && echo "{\\"editing\\":false,\\"file\\":\\"$FP\\",\\"timestamp\\":$(date +%s%3N)}" > ${STATUS_FILE}`;

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
