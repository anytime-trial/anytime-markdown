import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { analyzeCurrentCodeWithProgress } from './client.js';
import { probeServerAlive } from './probe.js';
import { route } from './router.js';
import type { RouteOpts } from './router.js';
import { SearchMemoryInputSchema, handleSearchMemory } from './tools/searchMemory.js';
import { SearchDocsInputSchema, handleSearchDocs } from './tools/searchDocs.js';
import { ListRecurringBugsInputSchema, handleListRecurringBugs } from './tools/listRecurringBugs.js';
import { GetBugHistoryInputSchema, handleGetBugHistory } from './tools/getBugHistory.js';
import { ListUnaddressedReviewFindingsInputSchema, handleListUnaddressedReviewFindings } from './tools/listUnaddressedReviewFindings.js';
import { GetReviewHistoryInputSchema, handleGetReviewHistory } from './tools/getReviewHistory.js';
import { LinkReviewToCommitInputSchema, handleLinkReviewToCommit } from './tools/linkReviewToCommit.js';
import { RunReviewAgentInputSchema, handleRunReviewAgent } from './tools/runReviewAgent.js';
import { GetReviewRunStatusInputSchema, handleGetReviewRunStatus } from './tools/getReviewRunStatus.js';
import { ListReviewRunsInputSchema, handleListReviewRuns } from './tools/listReviewRuns.js';
import { ListReviewTargetHintsInputSchema, handleListReviewTargetHints } from './tools/listReviewTargetHints.js';
import { DetectDriftInputSchema, handleDetectDrift } from './tools/detectDrift.js';
import { ExplainDriftInputSchema, handleExplainDrift } from './tools/explainDrift.js';
import { ResolveDriftInputSchema, handleResolveDrift } from './tools/resolveDrift.js';
import {
  EvaluateReverseSpecInputSchema,
  handleEvaluateReverseSpec,
} from './tools/evaluateReverseSpec.js';
import { selectImportantFiles, type FileAnalysisEntry, type ImportantFilesFilter } from './tools/importantFiles.js';
import { toCodeGraphNodeId } from './tools/nodeId.js';
import {
  capDependencies,
  capQueryResult,
  filterCochangePartners,
  filterCommunityNodes,
  projectCommunities,
  toSummaryRows,
  type RawCommunity,
} from './tools/discoveryShaping.js';

export interface McpTrailOptions {
  serverUrl?: string;
  repoName?: string;
}

const elementTypeEnum = z.enum(['person', 'system', 'container', 'component']);

const commonParams = {
  repoName: z.string().optional().describe('Repository name (default: basename of cwd)'),
  serverUrl: z.string().optional().describe('TrailDataServer URL (default: http://localhost:19841)'),
};

function buildRouteOpts(args: { repoName?: string; serverUrl?: string }, options: McpTrailOptions): RouteOpts {
  return {
    serverUrl: args.serverUrl ?? options.serverUrl ?? 'http://localhost:19841',
    repoName: args.repoName ?? options.repoName,
    workspacePath: process.env['TRAIL_WORKSPACE_PATH'],
    forceDirect: process.env['MCP_TRAIL_FORCE_DIRECT'] === '1',
  };
}

export function createMcpServer(options: McpTrailOptions = {}): McpServer {
  const server = new McpServer({
    name: 'mcp-trail',
    version: '0.1.0',
  });

  server.registerTool(
    'get_c4_model',
    { description: 'Get the current C4 architecture model including all elements and relationships', inputSchema: { ...commonParams } },
    async ({ repoName, serverUrl }) => {
      const opts = buildRouteOpts({ repoName, serverUrl }, options);
      const result = await route('get_c4_model', { repoName }, opts);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    'list_elements',
    { description: 'List all C4 elements with their IDs, types, and names. Useful for finding element IDs before adding relationships.', inputSchema: { ...commonParams } },
    async ({ repoName, serverUrl }) => {
      const opts = buildRouteOpts({ repoName, serverUrl }, options);
      const payload = await route('get_c4_model', { repoName }, opts) as { model?: { elements?: unknown[] } };
      const elements = payload?.model?.elements ?? [];
      const summary = (elements as Array<{ id: string; type: string; name: string; external?: boolean; manual?: boolean }>)
        .map(e => ({
          id: e.id,
          type: e.type,
          name: e.name,
          ...(e.external ? { external: true } : {}),
          ...(e.manual ? { manual: true } : {}),
        }));
      return { content: [{ type: 'text' as const, text: JSON.stringify(summary, null, 2) }] };
    },
  );

  server.registerTool(
    'add_element',
    { description: 'Add a manual C4 element (person, system, container, or component) to the architecture model', inputSchema: {
      type: elementTypeEnum.describe('Element type'),
      name: z.string().describe('Element name'),
      description: z.string().optional().describe('Element description'),
      external: z.boolean().default(false).describe('Whether this is an external element'),
      parentId: z.string().nullable().default(null).describe('Parent element ID (system for container, container for component)'),
      serviceType: z.string().optional().describe('Service type identifier (e.g. "supabase", "postgresql")'),
      ...commonParams,
    }, },
    async ({ type, name, description, external, parentId, serviceType, repoName, serverUrl }) => {
      const opts = buildRouteOpts({ repoName, serverUrl }, options);
      const result = await route('add_element', { type, name, description, external, parentId, serviceType }, opts);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    'update_element',
    { description: 'Update a manual C4 element', inputSchema: {
      id: z.string().describe('Element ID to update'),
      name: z.string().optional().describe('New name'),
      description: z.string().optional().describe('New description'),
      external: z.boolean().optional().describe('New external flag'),
      serviceType: z.string().optional().describe('New service type'),
      ...commonParams,
    }, },
    async ({ id, name, description, external, serviceType, repoName, serverUrl }) => {
      const opts = buildRouteOpts({ repoName, serverUrl }, options);
      const args: Record<string, unknown> = { id };
      if (name !== undefined) args.name = name;
      if (description !== undefined) args.description = description;
      if (external !== undefined) args.external = external;
      if (serviceType !== undefined) args.serviceType = serviceType;
      const result = await route('update_element', args, opts);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    'remove_element',
    { description: 'Remove a manual C4 element (and its associated relationships)', inputSchema: {
      id: z.string().describe('Element ID to remove'),
      ...commonParams,
    }, },
    async ({ id, repoName, serverUrl }) => {
      const opts = buildRouteOpts({ repoName, serverUrl }, options);
      await route('remove_element', { id }, opts);
      return { content: [{ type: 'text' as const, text: `Removed element ${id}` }] };
    },
  );

  server.registerTool(
    'list_relationships',
    { description: 'List all manual C4 relationships with their IDs. Useful for finding relationship IDs before removing them.', inputSchema: { ...commonParams } },
    async ({ repoName, serverUrl }) => {
      const opts = buildRouteOpts({ repoName, serverUrl }, options);
      const result = await route('list_relationships', { repoName }, opts);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    'add_relationship',
    { description: 'Add a relationship between two C4 elements', inputSchema: {
      fromId: z.string().describe('Source element ID'),
      toId: z.string().describe('Target element ID'),
      label: z.string().optional().describe('Relationship label (e.g. "Uses", "Calls", "Reads from")'),
      technology: z.string().optional().describe('Technology used (e.g. "REST API", "gRPC", "PostgreSQL")'),
      ...commonParams,
    }, },
    async ({ fromId, toId, label, technology, repoName, serverUrl }) => {
      const opts = buildRouteOpts({ repoName, serverUrl }, options);
      const result = await route('add_relationship', { fromId, toId, label, technology }, opts);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    'remove_relationship',
    { description: 'Remove a relationship between C4 elements', inputSchema: {
      id: z.string().describe('Relationship ID to remove'),
      ...commonParams,
    }, },
    async ({ id, repoName, serverUrl }) => {
      const opts = buildRouteOpts({ repoName, serverUrl }, options);
      await route('remove_relationship', { id }, opts);
      return { content: [{ type: 'text' as const, text: `Removed relationship ${id}` }] };
    },
  );

  server.registerTool(
    'list_groups',
    { description: 'List all manual C4 groups with their IDs and member element IDs.', inputSchema: { ...commonParams } },
    async ({ repoName, serverUrl }) => {
      const opts = buildRouteOpts({ repoName, serverUrl }, options);
      const result = await route('list_groups', { repoName }, opts);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    'add_group',
    { description: 'Create a visual group for a set of C4 elements', inputSchema: {
      memberIds: z.array(z.string()).min(2).describe('Element IDs to include in the group (minimum 2)'),
      label: z.string().optional().describe('Optional label for the group'),
      ...commonParams,
    }, },
    async ({ memberIds, label, repoName, serverUrl }) => {
      const opts = buildRouteOpts({ repoName, serverUrl }, options);
      const result = await route('add_group', { memberIds, label }, opts);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    'update_group',
    { description: 'Update the label or members of a group', inputSchema: {
      id: z.string().describe('Group ID to update'),
      label: z.string().nullable().optional().describe('New label (null to clear)'),
      memberIds: z.array(z.string()).min(2).optional().describe('New member list (minimum 2)'),
      ...commonParams,
    }, },
    async ({ id, label, memberIds, repoName, serverUrl }) => {
      const opts = buildRouteOpts({ repoName, serverUrl }, options);
      await route('update_group', { id, memberIds, label }, opts);
      return { content: [{ type: 'text' as const, text: `Updated group ${id}` }] };
    },
  );

  server.registerTool(
    'remove_group',
    { description: 'Remove a visual group (members are not deleted)', inputSchema: {
      id: z.string().describe('Group ID to remove'),
      ...commonParams,
    }, },
    async ({ id, repoName, serverUrl }) => {
      const opts = buildRouteOpts({ repoName, serverUrl }, options);
      await route('remove_group', { id }, opts);
      return { content: [{ type: 'text' as const, text: `Removed group ${id}` }] };
    },
  );

  // -------------------------------------------------------------------------
  //  Analyze pipeline tools (trigger VS Code extension via HTTP)
  // -------------------------------------------------------------------------

  server.registerTool(
    'analyze_current_code',
    { description: 'Run C4 / code graph analysis for the current workspace and persist results to Trail DB. Equivalent to "Anytime Trail: コード解析" command. Requires VS Code extension to be running. Returns 409 if another analysis is in progress. Subscribes to WebSocket progress events during the run and includes them in the response.', inputSchema: {
      ...commonParams,
      workspacePath: z.string().optional().describe('Absolute path to analyze (overrides anytimeTrail.workspace.path; defaults to extension current workspace)'),
      tsconfigPath: z.string().optional().describe('Specific tsconfig.json path to use. If omitted and multiple are found, the topmost (workspace root) is selected automatically'),
      includeProgress: z.boolean().optional().describe('Include WebSocket progress log in response (default: true)'),
    }, },
    async ({ serverUrl, workspacePath, tsconfigPath, includeProgress }) => {
      const opts = buildRouteOpts({ serverUrl }, options);
      if (includeProgress === false) {
        const result = await route('analyze_current_code', { workspacePath, tsconfigPath }, opts);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      }
      // includeProgress !== false → WebSocket 進捗付きで HTTP 直呼び
      const alive = opts.forceDirect ? false : await probeServerAlive(opts.serverUrl);
      if (!alive) {
        throw new Error('TrailDataServer not running. Start "Anytime Trail" sidebar in VS Code or run "Anytime Trail: コード解析" command first.');
      }
      const result = await analyzeCurrentCodeWithProgress(opts.serverUrl, { workspacePath, tsconfigPath });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    'analyze_release_code',
    { description: 'Run release-grouped C4 / code graph analysis (deletes existing release_code_graphs and regenerates). Equivalent to "Anytime Trail: リリース別コード解析" command.', inputSchema: { ...commonParams } },
    async ({ serverUrl }) => {
      const opts = buildRouteOpts({ serverUrl }, options);
      const result = await route('analyze_release_code', {}, opts);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    'analyze_all',
    { description: 'Import all Trail data (Claude Code JSONL sessions, commits, releases, coverage) from ~/.claude/projects. Equivalent to "Anytime Trail: 全データ解析" command.', inputSchema: { ...commonParams } },
    async ({ serverUrl }) => {
      const opts = buildRouteOpts({ serverUrl }, options);
      const result = await route('analyze_all', {}, opts);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    'get_analyze_status',
    { description: 'Check whether an analysis pipeline is currently in progress.', inputSchema: { ...commonParams } },
    async ({ serverUrl }) => {
      const opts = buildRouteOpts({ serverUrl }, options);
      const result = await route('get_analyze_status', {}, opts);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // -------------------------------------------------------------------------
  //  Community summary / mapping tools (anytime-reverse-engineer skill 用)
  // -------------------------------------------------------------------------

  const roleEnum = z.enum(['primary', 'secondary', 'dependency']);

  server.registerTool(
    'list_communities',
    {
      description:
        'List code graph communities (communityId / label / name / summary / stableKey). mappingsJson (C4 role mappings, large) is omitted by default; pass includeMappings=true to include it (e.g. anytime-reverse-engineer cache lookup). stableKey is a content hash stable across re-analysis.',
      inputSchema: {
        includeMappings: z.boolean().default(false).describe('Include the large mappingsJson field (default false)'),
        ...commonParams,
      },
    },
    async ({ includeMappings, repoName, serverUrl }) => {
      const opts = buildRouteOpts({ repoName, serverUrl }, options);
      const raw = (await route('list_communities', { repoName }, opts)) as { communities?: RawCommunity[] };
      const result = projectCommunities(raw, includeMappings);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    'list_community_nodes',
    {
      description:
        'List code graph nodes grouped by community, projected to { id, label, package }. Pass communityId to fetch one community (the full graph has ~1,900 nodes); nodeLimit caps nodes per community (adds nodeTotal when truncated). Returns empty array when no graph is stored.',
      inputSchema: {
        communityId: z.number().int().optional().describe('Restrict to a single community id'),
        nodeLimit: z.number().int().min(1).max(500).optional().describe('Max nodes per community'),
        ...commonParams,
      },
    },
    async ({ communityId, nodeLimit, repoName, serverUrl }) => {
      const opts = buildRouteOpts({ repoName, serverUrl }, options);
      const raw = (await route('list_community_nodes', { repoName }, opts)) as {
        communities?: Array<{ communityId: number; nodes: unknown[] }>;
      };
      const result = filterCommunityNodes(raw, {
        ...(communityId !== undefined ? { communityId } : {}),
        ...(nodeLimit !== undefined ? { nodeLimit } : {}),
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    'upsert_community_summaries',
    { description: 'Upsert community name + summary pairs to current_code_graph_communities. Used by anytime-reverse-engineer skill after AI generation. mappings_json is preserved.', inputSchema: {
      summaries: z
        .array(
          z.object({
            communityId: z.number().int().describe('community_id from current_code_graphs.graph_json'),
            name: z.string().describe('Short name (3 words)'),
            summary: z.string().describe('One-sentence summary (max 60 chars)'),
          }),
        )
        .describe('List of community summaries to upsert'),
      ...commonParams,
    }, },
    async ({ summaries, repoName, serverUrl }) => {
      const opts = buildRouteOpts({ repoName, serverUrl }, options);
      const result = await route('upsert_community_summaries', { summaries }, opts);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    'upsert_community_mappings',
    { description: 'Upsert C4 element role mappings (mappings_json) per community. Used by anytime-reverse-engineer skill after role determination. name/summary are preserved.', inputSchema: {
      mappings: z
        .array(
          z.object({
            communityId: z.number().int().describe('community_id'),
            mappings: z
              .array(
                z.object({
                  elementId: z.string().describe('C4 element id (e.g. pkg_trail-core/coverage)'),
                  elementType: z.string().describe('C4 element type (component, container, etc.)'),
                  role: roleEnum.describe('primary / secondary / dependency'),
                }),
              )
              .describe('Per-element role mappings within this community'),
          }),
        )
        .describe('List of community mapping batches to upsert'),
      ...commonParams,
    }, },
    async ({ mappings, repoName, serverUrl }) => {
      const opts = buildRouteOpts({ repoName, serverUrl }, options);
      const result = await route('upsert_community_mappings', { mappings }, opts);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // -------------------------------------------------------------------------
  //  Drift detection tools (memory-core)
  // -------------------------------------------------------------------------

  server.registerTool(
    'detect_drift',
    { description: 'Query persisted drift events with optional filters for severity, drift_type, subject entity, and time range', inputSchema: {
      unresolved_only: DetectDriftInputSchema.shape.unresolved_only,
      severity: DetectDriftInputSchema.shape.severity,
      drift_type: DetectDriftInputSchema.shape.drift_type,
      subject_id: DetectDriftInputSchema.shape.subject_id,
      since: DetectDriftInputSchema.shape.since,
      limit: DetectDriftInputSchema.shape.limit,
    }, },
    async (args) => {
      const result = await handleDetectDrift(args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    'explain_drift',
    { description: 'Return the 5-source (conversation/spec/code/bug_history/review) evidence for a specific drift event', inputSchema: { event_id: ExplainDriftInputSchema.shape.event_id } },
    async (args) => {
      const result = await handleExplainDrift(args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    'resolve_drift',
    { description: 'Mark a drift event as resolved with a resolution note', inputSchema: {
      event_id: ResolveDriftInputSchema.shape.event_id,
      resolution_note: ResolveDriftInputSchema.shape.resolution_note,
      resolved_at: ResolveDriftInputSchema.shape.resolved_at,
    }, },
    async (args) => {
      const result = await handleResolveDrift(args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // -------------------------------------------------------------------------
  //  Review agent tools (memory-core)
  // -------------------------------------------------------------------------

  server.registerTool(
    'run_review_agent',
    { description: 'Register a review agent run request and return a run_id immediately (actual agent execution is delegated)', inputSchema: {
      trigger_kind: RunReviewAgentInputSchema.shape.trigger_kind,
      target_kind: RunReviewAgentInputSchema.shape.target_kind,
      target_refs: RunReviewAgentInputSchema.shape.target_refs,
      prompt_kind: RunReviewAgentInputSchema.shape.prompt_kind,
      model: RunReviewAgentInputSchema.shape.model,
    }, },
    async (args) => {
      const result = await handleRunReviewAgent(args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    'get_review_run_status',
    { description: 'Get the status of a review agent run by run_id', inputSchema: { run_id: GetReviewRunStatusInputSchema.shape.run_id } },
    async (args) => {
      const result = await handleGetReviewRunStatus(args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    'list_review_runs',
    { description: 'List review agent runs with optional filters for trigger_kind, status, target_kind, model, and since', inputSchema: {
      trigger_kind: ListReviewRunsInputSchema.shape.trigger_kind,
      status: ListReviewRunsInputSchema.shape.status,
      target_kind: ListReviewRunsInputSchema.shape.target_kind,
      model: ListReviewRunsInputSchema.shape.model,
      since: ListReviewRunsInputSchema.shape.since,
      limit: ListReviewRunsInputSchema.shape.limit,
    }, },
    async (args) => {
      const result = await handleListReviewRuns(args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    'list_review_target_hints',
    { description: 'List prioritized review target candidates based on drift events, recent bug fixes, and unreviewed files', inputSchema: { limit: ListReviewTargetHintsInputSchema.shape.limit } },
    async (args) => {
      const result = await handleListReviewTargetHints(args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // -------------------------------------------------------------------------
  //  Bug history tools (memory-core)
  // -------------------------------------------------------------------------

  server.registerTool(
    'list_recurring_bugs',
    { description: 'List recurring bug groups filtered by package, file path, or root-cause entity within a time window', inputSchema: {
      package: ListRecurringBugsInputSchema.shape.package,
      file_path: ListRecurringBugsInputSchema.shape.file_path,
      caused_by_entity_id: ListRecurringBugsInputSchema.shape.caused_by_entity_id,
      windowDays: ListRecurringBugsInputSchema.shape.windowDays,
      minCount: ListRecurringBugsInputSchema.shape.minCount,
    }, },
    async (args) => {
      const result = await handleListRecurringBugs(args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    'get_bug_history',
    { description: 'Retrieve bug fix history with affected file paths and root-cause entity references', inputSchema: {
      package: GetBugHistoryInputSchema.shape.package,
      file_path: GetBugHistoryInputSchema.shape.file_path,
      category: GetBugHistoryInputSchema.shape.category,
      limit: GetBugHistoryInputSchema.shape.limit,
    }, },
    async (args) => {
      const result = await handleGetBugHistory(args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // -------------------------------------------------------------------------
  //  Review tools (memory-core)
  // -------------------------------------------------------------------------

  server.registerTool(
    'list_unaddressed_review_findings',
    { description: 'List review findings that have not yet been addressed, with optional severity/age/category filters', inputSchema: {
      severity: ListUnaddressedReviewFindingsInputSchema.shape.severity,
      daysSinceMin: ListUnaddressedReviewFindingsInputSchema.shape.daysSinceMin,
      target_file_path: ListUnaddressedReviewFindingsInputSchema.shape.target_file_path,
      category: ListUnaddressedReviewFindingsInputSchema.shape.category,
      limit: ListUnaddressedReviewFindingsInputSchema.shape.limit,
    }, },
    async (args) => {
      const result = await handleListUnaddressedReviewFindings(args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    'get_review_history',
    { description: 'Retrieve review history with findings, optionally including linked bug entities via precedes edges', inputSchema: {
      target_file_path: GetReviewHistoryInputSchema.shape.target_file_path,
      package: GetReviewHistoryInputSchema.shape.package,
      category: GetReviewHistoryInputSchema.shape.category,
      include_precedes_bugs: GetReviewHistoryInputSchema.shape.include_precedes_bugs,
      limit: GetReviewHistoryInputSchema.shape.limit,
    }, },
    async (args) => {
      const result = await handleGetReviewHistory(args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    'link_review_to_commit',
    { description: 'Mark a review finding as addressed by a specific commit, inserting an addresses edge', inputSchema: {
      finding_id: LinkReviewToCommitInputSchema.shape.finding_id,
      commit_sha: LinkReviewToCommitInputSchema.shape.commit_sha,
      addressed_at: LinkReviewToCommitInputSchema.shape.addressed_at,
      override_auto: LinkReviewToCommitInputSchema.shape.override_auto,
    }, },
    async (args) => {
      const result = await handleLinkReviewToCommit(args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // -------------------------------------------------------------------------
  //  Reverse spec evaluation (markdown-eval-core)
  // -------------------------------------------------------------------------

  server.registerTool(
    'evaluate_reverse_spec',
    { description: 'Pair golden and candidate markdown design documents, compute heuristic scores (intent / design / completeness) and excerpts for downstream LLM scoring. Used by /anytime-reverse-spec evaluate=true. LLM 推論はこのツールでは行わず、呼び出し側 (スキル実行 Agent) が excerpt を読んで採点する。', inputSchema: {
      goldenFiles: EvaluateReverseSpecInputSchema.shape.goldenFiles,
      candidateDir: EvaluateReverseSpecInputSchema.shape.candidateDir,
      documentGlob: EvaluateReverseSpecInputSchema.shape.documentGlob,
      excludeGlobs: EvaluateReverseSpecInputSchema.shape.excludeGlobs,
      maxExcerptChars: EvaluateReverseSpecInputSchema.shape.maxExcerptChars,
    }, },
    async (args) => {
      const result = await handleEvaluateReverseSpec(args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // -------------------------------------------------------------------------
  //  Memory graph search (memory-core)
  // -------------------------------------------------------------------------

  server.registerTool(
    'search_memory',
    { description: 'Search the memory graph for entities, relationships, and conversation episodes related to the query', inputSchema: {
      query: SearchMemoryInputSchema.shape.query,
      entity_types: SearchMemoryInputSchema.shape.entity_types,
      source_type: SearchMemoryInputSchema.shape.source_type,
      since: SearchMemoryInputSchema.shape.since,
      limit: SearchMemoryInputSchema.shape.limit,
      hops: SearchMemoryInputSchema.shape.hops,
    }, },
    async (args) => {
      const result = await handleSearchMemory(args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    'search_docs',
    { description: 'Search the spec documentation index (doc-core.db): typed relations (backlinks/neighbors), keyword (FTS5), and semantic (cosine, needs ollama)', inputSchema: {
      query: SearchDocsInputSchema.shape.query,
      mode: SearchDocsInputSchema.shape.mode,
      path: SearchDocsInputSchema.shape.path,
      type: SearchDocsInputSchema.shape.type,
      hops: SearchDocsInputSchema.shape.hops,
      limit: SearchDocsInputSchema.shape.limit,
    }, },
    async (args) => {
      const result = await handleSearchDocs(args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // -------------------------------------------------------------------------
  //  Discovery tools (code graph)
  // -------------------------------------------------------------------------

  server.registerTool(
    'get_code_dependencies',
    {
      description:
        'Return the direct dependents (incoming) and dependencies (outgoing) of a code-graph node. Use to scope the blast radius of a change before editing, instead of grepping for imports. Returns { node, incoming, outgoing, incomingTotal, outgoingTotal, truncated } (depth 1; edges capped at `limit`, default 50). nodeId accepts a file path from get_important_files (e.g. packages/x/src/Foo.ts) or a raw node id (<repo>:<path-without-extension>); pass repoName so a file path can be resolved.',
      inputSchema: {
        nodeId: z.string().describe('Code-graph node id or file path to inspect'),
        limit: z.number().int().min(1).max(500).default(50).describe('Max incoming/outgoing edges each (default 50)'),
        ...commonParams,
      },
      annotations: { readOnlyHint: true },
    },
    async ({ nodeId, limit, repoName, serverUrl }) => {
      const opts = buildRouteOpts({ repoName, serverUrl }, options);
      const resolvedId = repoName ? toCodeGraphNodeId(repoName, nodeId) : nodeId;
      const raw = (await route('get_code_dependencies', { nodeId: resolvedId }, opts)) as {
        node?: unknown;
        incoming?: unknown[];
        outgoing?: unknown[];
      };
      const result = capDependencies(raw, limit);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    'get_important_files',
    {
      description:
        'List the most important files to read first, ranked by precomputed graph signals. Use at the start of discovery to decide where to look, instead of reading files blindly. Returns up to `limit` rows of { rank, filePath, importanceScore, centralityScore, signals(object flags), reason }. filter: central|dead|barrel|risky (default = importance). limit default 10.',
      inputSchema: {
        limit: z.number().int().min(1).max(100).default(10).describe('Max rows (default 10)'),
        filter: z
          .enum(['central', 'dead', 'barrel', 'risky'])
          .optional()
          .describe('Ranking lens (default: overall importance)'),
        detail: z
          .enum(['summary', 'full'])
          .default('full')
          .describe('summary = rank/filePath/importanceScore only; full = include centralityScore/signals/reason'),
        ...commonParams,
      },
      annotations: { readOnlyHint: true },
    },
    async ({ limit, filter, detail, repoName, serverUrl }) => {
      const opts = buildRouteOpts({ repoName, serverUrl }, options);
      const raw = (await route('get_important_files', {}, opts)) as { entries: FileAnalysisEntry[] };
      const rows = selectImportantFiles(raw.entries ?? [], {
        limit,
        ...(filter ? { filter: filter as ImportantFilesFilter } : {}),
      });
      const out = detail === 'summary' ? toSummaryRows(rows) : rows;
      return { content: [{ type: 'text' as const, text: JSON.stringify(out, null, 2) }] };
    },
  );

  server.registerTool(
    'query_code_graph',
    {
      description:
        'Find code-graph nodes matching a keyword (id/label substring). Use to locate where a symbol/file lives before reading. Returns { nodes, edges, nodeTotal, truncated }. depth controls neighbor expansion (default 1; keep small to stay cheap); nodes capped at `limit` (default 30); edges are returned in full, so when truncated some edges may reference nodes beyond the returned list.',
      inputSchema: {
        q: z.string().describe('Keyword to match against node id/label'),
        depth: z.number().int().min(0).max(3).default(1).describe('Neighbor hops (default 1)'),
        limit: z.number().int().min(1).max(200).default(30).describe('Max nodes returned (default 30)'),
        ...commonParams,
      },
      annotations: { readOnlyHint: true },
    },
    async ({ q, depth, limit, repoName, serverUrl }) => {
      const opts = buildRouteOpts({ repoName, serverUrl }, options);
      const raw = (await route('query_code_graph', { q, depth }, opts)) as {
        nodes?: string[];
        edges?: Array<{ source: string; target: string }>;
      };
      const result = capQueryResult(raw, limit);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    'find_code_path',
    {
      description:
        'Find a dependency path between two code-graph nodes. Returns { found, path, hops }. from/to accept a file path (e.g. packages/x/src/Foo.ts) or a raw node id; pass repoName so file paths resolve.',
      inputSchema: {
        from: z.string().describe('Start node id or file path'),
        to: z.string().describe('End node id or file path'),
        ...commonParams,
      },
      annotations: { readOnlyHint: true },
    },
    async ({ from, to, repoName, serverUrl }) => {
      const opts = buildRouteOpts({ repoName, serverUrl }, options);
      const resolvedFrom = repoName ? toCodeGraphNodeId(repoName, from) : from;
      const resolvedTo = repoName ? toCodeGraphNodeId(repoName, to) : to;
      const result = await route('find_code_path', { from: resolvedFrom, to: resolvedTo }, opts);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    'get_cochange_partners',
    {
      description:
        'List files that historically change together with the given file (git temporal coupling). Use to find related files a change should touch, that the import graph misses. Returns up to top_n { partner, jaccard } sorted by jaccard. file is a repo-relative path (e.g. packages/x/src/Foo.ts).',
      inputSchema: {
        file: z.string().describe('Repo-relative file path'),
        top_n: z.number().int().min(1).max(100).default(10).describe('Max partners (default 10)'),
        windowDays: z.number().int().min(1).max(365).default(90).describe('History window in days (default 90)'),
        ...commonParams,
      },
      annotations: { readOnlyHint: true },
    },
    async ({ file, top_n, windowDays, repoName, serverUrl }) => {
      const opts = buildRouteOpts({ repoName, serverUrl }, options);
      const raw = (await route('get_cochange_partners', { opts: { windowDays, topK: 500 } }, opts)) as {
        edges?: Array<{ source: string; target: string; jaccard?: number }>;
      };
      const result = filterCochangePartners(raw, file, top_n);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  return server;
}
