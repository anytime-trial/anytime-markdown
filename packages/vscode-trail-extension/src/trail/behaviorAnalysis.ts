// behaviorAnalysis.ts — Pure functions for ClaudeCodeBehaviorAnalyzer

export type ErrorType =
  | 'file_not_found'
  | 'cmd_failed'
  | 'user_rejected'
  | 'constraint_violation'
  | 'invalid_params';

/**
 * ツール実行エラーメッセージを分類する。
 */
export function classifyErrorType(message: string): ErrorType {
  if (/Path does not exist|No such file/i.test(message)) return 'file_not_found';
  if (/The user doesn't want to proceed/i.test(message)) return 'user_rejected';
  if (/File has not been read yet|InputValidationError/i.test(message)) return 'constraint_violation';
  if (/Exit code 127|command not found/i.test(message)) return 'invalid_params';
  if (/Exit code [1-9]/i.test(message)) return 'cmd_failed';
  return 'cmd_failed';
}

/**
 * ツール名と入力から file_path を抽出する。
 * Read / Edit / Write / Glob が対象。
 */
export function extractFilePath(
  toolName: string,
  input: Record<string, unknown> | undefined,
): string | null {
  if (!input) return null;
  if (['Read', 'Edit', 'Write', 'Glob'].includes(toolName)) {
    return typeof input['file_path'] === 'string' ? input['file_path'] : null;
  }
  if (toolName === 'Grep') {
    return typeof input['path'] === 'string' ? input['path'] : null;
  }
  return null;
}

/**
 * ツール名と入力から command / description を抽出する。
 * Bash / Agent が対象。
 */
export function extractCommand(
  toolName: string,
  input: Record<string, unknown> | undefined,
): string | null {
  if (!input) return null;
  if (toolName === 'Bash') {
    return typeof input['command'] === 'string' ? input['command'] : null;
  }
  if (toolName === 'Agent') {
    return typeof input['description'] === 'string' ? input['description'] : null;
  }
  return null;
}
