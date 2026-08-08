// domain/engine/skillModels.ts — Default skill-to-model mapping

export const DEFAULT_SKILL_MODELS: ReadonlyArray<readonly [string, string | null, string]> = [
  // opus
  ['resolve-issues', null, 'opus'],
  ['security-review', null, 'opus'],
  ['superpowers:systematic-debugging', null, 'opus'],
  // sonnet
  ['superpowers:brainstorming', null, 'sonnet'],
  ['superpowers:writing-plans', null, 'sonnet'],
  ['superpowers:subagent-driven-development', null, 'sonnet'],
  ['superpowers:executing-plans', null, 'sonnet'],
  ['superpowers:using-git-worktrees', null, 'sonnet'],
  ['superpowers:finishing-a-development-branch', null, 'sonnet'],
  ['superpowers:writing-skills', null, 'sonnet'],
  ['superpowers:requesting-code-review', null, 'sonnet'],
  ['superpowers:verification-before-completion', null, 'sonnet'],
  ['superpowers:test-driven-development', null, 'sonnet'],
  ['markdown-output', null, 'sonnet'],
  ['production-release', null, 'sonnet'],
  ['code-review-checklist', null, 'sonnet'],
  ['tech-article', null, 'sonnet'],
  ['design-md', null, 'sonnet'],
  ['daily-research', null, 'sonnet'],
  ['documentation-update', null, 'sonnet'],
  ['claude-code-guide', null, 'sonnet'],
  ['feature-dev', null, 'sonnet'],
  ['update-config', null, 'sonnet'],
  ['anytime-note', null, 'sonnet'],
  ['claude-api', null, 'sonnet'],
  ['weekly-research', null, 'sonnet'],
  ['daily-humanities-research', null, 'sonnet'],
  ['daily-cs-research', null, 'sonnet'],
  ['daily-patent-research', null, 'sonnet'],
  // haiku
  ['dotfiles-commit', null, 'haiku'],
  ['find-skills', null, 'haiku'],
  ['web-search', null, 'haiku'],
  ['test-spec-generator', null, 'haiku'],
  ['brainstorming', null, 'haiku'],
  ['deploy-cms-remote', null, 'haiku'],
  ['daily-essay', null, 'haiku'],
  ['simplify', null, 'haiku'],
  ['health', null, 'haiku'],
  ['manual-guide', null, 'haiku'],
  // aliases
  ['note', 'anytime-note', 'sonnet'],
  ['release', 'production-release', 'sonnet'],
  ['writing-skills', 'superpowers:writing-skills', 'sonnet'],
  ['claude-health', 'health', 'haiku'],
];

/**
 * Extract skill name from tool_calls JSON string.
 * Looks for a Skill tool call with an input.skill property.
 */
export function extractSkillName(toolCallsJson: string | null): string | null {
  if (!toolCallsJson) return null;
  try {
    const calls = JSON.parse(toolCallsJson) as Array<{ name?: string; input?: Record<string, unknown> }>;
    for (const call of calls) {
      if (call.name === 'Skill' && typeof call.input?.skill === 'string') {
        return call.input.skill;
      }
    }
  } catch { /* ignore */ }
  return null;
}
