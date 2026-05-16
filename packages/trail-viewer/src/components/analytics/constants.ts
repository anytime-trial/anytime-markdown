import { toolActionColors, modelColors, analyticsPalette, getModelBrandColor } from '../../theme/designTokens';
import type { LaneTool } from '../../domain/analytics/calculators';

export const LANE_TOOL_COLORS: Record<LaneTool, string> = {
  bash:  toolActionColors.bash,
  edit:  toolActionColors.edit,
  write: toolActionColors.write,
  read:  toolActionColors.read,
  task:  toolActionColors.task,
  other: toolActionColors.other,
};

export const LANE_TOOL_LABELS: Record<LaneTool, string> = {
  bash: 'Bash', edit: 'Edit', write: 'Write', read: 'Read', task: 'Task', other: 'Other',
};

export function laneModelColor(model: string): string {
  return getModelBrandColor(model) ?? modelColors.unknown;
}

export function laneSkillColor(skill: string): string {
  let hash = 0;
  for (let i = 0; i < skill.length; i++) hash = ((hash * 31) + skill.charCodeAt(i)) & 0xFFFFFF;
  return analyticsPalette[Math.abs(hash) % analyticsPalette.length];
}
