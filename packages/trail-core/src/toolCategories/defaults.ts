export const DEFAULT_TOOL_CATEGORIES: ReadonlyMap<string, number> = new Map<string, number>([
  // 0: ファイル操作
  ['Bash', 0], ['Read', 0], ['Edit', 0], ['Grep', 0], ['Write', 0], ['Glob', 0],
  ['exec_command', 0], ['bash', 0], ['apply_patch', 0], ['write_stdin', 0], ['read_file', 0],
  // 1: Web・ブラウザ
  ['WebSearch', 1], ['WebFetch', 1], ['mcp__playwright__*', 1],
  // 2: コード解析
  ['mcp__serena__*', 2], ['mcp__plugin_serena_serena__*', 2],
  ['check_onboarding_performed', 2], ['find_file', 2], ['find_symbol', 2],
  ['find_implementations', 2], ['get_current_config', 2], ['get_symbols_overview', 2],
  ['list_dir', 2], ['search_for_pattern', 2],
  // 3: タスク・エージェント管理
  ['TaskCreate', 3], ['TaskUpdate', 3], ['TaskOutput', 3], ['TaskList', 3], ['TaskStop', 3],
  ['Agent', 3], ['Skill', 3], ['ToolSearch', 3], ['AskUserQuestion', 3],
  ['ScheduleWakeup', 3], ['EnterPlanMode', 3], ['ExitPlanMode', 3],
  ['EnterWorktree', 3], ['ExitWorktree', 3], ['Monitor', 3], ['RemoteTrigger', 3],
  ['update_plan', 3],
  // 4: その他 (wildcard catch-all)
  ['*', 4],
]);
