import type { TrailMessage, TrailSession, TrailToolCall } from '../parser/types';
import type {
  SessionDbRow,
  MessageDbRow,
  CommitDbRow,
} from '../../data/types';

export function extractWorkspace(filePath: string | undefined | null): string | undefined {
  if (!filePath) return undefined;
  const match = /\/projects\/([^/]+)\//.exec(filePath);
  if (!match) return undefined;
  const key = match[1].replace(/--(?:claude-)?worktrees-.+$/, '');
  if (!key.startsWith('-')) return undefined;
  return '/' + key.slice(1);
}

export function toTrailSession(
  r: SessionDbRow,
  commits: readonly CommitDbRow[],
): TrailSession {
  const commitStats = commits.length > 0
    ? {
        commits: commits.length,
        linesAdded: commits.reduce((s, c) => s + c.lines_added, 0),
        linesDeleted: commits.reduce((s, c) => s + c.lines_deleted, 0),
        filesChanged: commits.reduce((s, c) => s + c.files_changed, 0),
      }
    : undefined;

  const costs = r.trail_session_costs ?? [];
  const totalInput = costs.reduce((s, c) => s + c.input_tokens, 0);
  const totalOutput = costs.reduce((s, c) => s + c.output_tokens, 0);
  const totalCacheRead = costs.reduce((s, c) => s + c.cache_read_tokens, 0);
  const totalCacheCreation = costs.reduce((s, c) => s + c.cache_creation_tokens, 0);
  const totalCostUsd = costs.reduce((s, c) => s + c.estimated_cost_usd, 0);

  return {
    id: r.id,
    slug: r.slug,
    repoName: r.repo_name ?? '',
    gitBranch: '',
    startTime: r.start_time,
    endTime: r.end_time,
    version: r.version,
    model: r.model,
    messageCount: r.message_count,
    peakContextTokens: r.peak_context_tokens ?? undefined,
    initialContextTokens: r.initial_context_tokens ?? undefined,
    interruption: r.interruption_reason
      ? {
          interrupted: true,
          reason: r.interruption_reason as 'max_tokens' | 'no_response',
          contextTokens: r.interruption_context_tokens ?? 0,
        }
      : undefined,
    compactCount: r.compact_count && r.compact_count > 0 ? r.compact_count : undefined,
    source: r.source ?? undefined,
    workspace: extractWorkspace(r.file_path ?? undefined),
    commitStats,
    usage: {
      inputTokens: totalInput,
      outputTokens: totalOutput,
      cacheReadTokens: totalCacheRead,
      cacheCreationTokens: totalCacheCreation,
    },
    estimatedCostUsd: totalCostUsd,
    errorCount: r.error_count && r.error_count > 0 ? r.error_count : undefined,
    subAgentCount: r.sub_agent_count && r.sub_agent_count > 0 ? r.sub_agent_count : undefined,
    assistantMessageCount: r.assistant_message_count && r.assistant_message_count > 0
      ? r.assistant_message_count : undefined,
  };
}

export function toTrailMessage(r: MessageDbRow): TrailMessage {
  let toolCalls: readonly TrailToolCall[] | undefined;
  if (r.tool_calls) {
    try {
      toolCalls = JSON.parse(r.tool_calls) as readonly TrailToolCall[];
    } catch {
      // ignore parse errors
    }
  }

  return {
    uuid: r.uuid,
    parentUuid: r.parent_uuid,
    type: r.type as 'user' | 'assistant' | 'system',
    subtype: r.subtype ?? undefined,
    timestamp: r.timestamp,
    isSidechain: r.is_sidechain === 1,
    model: r.model ?? undefined,
    toolCalls,
    textContent: r.text_content ?? undefined,
    userContent: r.user_content ?? undefined,
    stopReason: r.stop_reason,
    usage: {
      inputTokens: r.input_tokens,
      outputTokens: r.output_tokens,
      cacheReadTokens: r.cache_read_tokens,
      cacheCreationTokens: r.cache_creation_tokens,
    },
    agentId: r.agent_id ?? undefined,
    agentDescription: r.agent_description ?? undefined,
  };
}
