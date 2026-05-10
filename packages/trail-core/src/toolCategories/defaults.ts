export const DEFAULT_TOOL_CATEGORY_LABELS: ReadonlyMap<number, string> = new Map<number, string>([
  [0, 'Read/Grep'],
  [1, 'Write/Edit'],
  [2, 'Bash'],
  [3, 'Web・ブラウザ'],
  [4, 'コード解析'],
  [5, 'タスク・エージェント管理'],
  [6, 'その他'],
]);

export const DEFAULT_TOOL_CATEGORIES: ReadonlyMap<string, number> = new Map<string, number>([
  // 0: Read/Grep
  ['Read', 0], ['Grep', 0], ['Glob', 0], ['read_file', 0], ['find_file', 0],
  // 1: Write/Edit
  ['Edit', 1], ['Write', 1], ['write_stdin', 1], ['apply_patch', 1], ['get_current_config', 1],
  // 2: Bash
  ['Bash', 2], ['exec_command', 2], ['bash', 2],
  // 3: Web・ブラウザ
  ['WebSearch', 3], ['WebFetch', 3], ['mcp__playwright__*', 3],
  // 4: コード解析
  ['mcp__serena__*', 4], ['mcp__plugin_serena_serena__*', 4],
  ['check_onboarding_performed', 4], ['find_symbol', 4],
  ['find_implementations', 4], ['get_symbols_overview', 4],
  ['list_dir', 4], ['search_for_pattern', 4],
  // 5: タスク・エージェント管理
  ['TaskCreate', 5], ['TaskUpdate', 5], ['TaskOutput', 5], ['TaskList', 5], ['TaskStop', 5],
  ['Agent', 5], ['Skill', 5], ['ToolSearch', 5], ['AskUserQuestion', 5],
  ['ScheduleWakeup', 5], ['EnterPlanMode', 5], ['ExitPlanMode', 5],
  ['EnterWorktree', 5], ['ExitWorktree', 5], ['Monitor', 5], ['RemoteTrigger', 5],
  ['update_plan', 5],
  // 6: その他 (wildcard catch-all)
  ['*', 6],
]);
