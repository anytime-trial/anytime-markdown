export { ClaudeStatusWatcher, jstDateString } from './claude/ClaudeStatusWatcher';
export { setupClaudeHooks } from './claude/claudeHookSetup';
export type { Disposable, ClaudeStatus, SessionEdit, StatusChangeCallback, AgentInfo, AgentLastCommit, AgentStatusRow, AgentStatusSource, MultiStatusChangeCallback, TodayStats } from './claude/types';
export { resolveLocale } from './locale';
export { TimelineProvider, TimelineItem } from './git/TimelineProvider';
export {
  installBundledSkills,
  installTemplatedSkill,
  installStaticSkillDir,
} from './skill-installer';
export type {
  InstallSkillLogger,
  InstallBundledSkillsOptions,
  InstallBundledSkillsResult,
  InstallTemplatedSkillOptions,
  InstallTemplatedSkillResult,
  InstallStaticSkillDirOptions,
  InstallStaticSkillDirResult,
} from './skill-installer';
