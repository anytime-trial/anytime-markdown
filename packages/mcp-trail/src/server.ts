import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { analyzeCurrentCodeWithProgress } from './client.js';
import { probeServerAlive } from './probe.js';
import { route } from './router.js';
import type { RouteOpts } from './router.js';
import { SearchMemoryInputSchema, handleSearchMemory } from './tools/searchMemory.js';
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
    dbPath: process.env['TRAIL_DB_PATH'],
    forceDirect: process.env['MCP_TRAIL_FORCE_DIRECT'] === '1',
  };
}

export function createMcpServer(options: McpTrailOptions = {}): McpServer {
  const server = new McpServer({
    name: 'mcp-trail',
    version: '0.1.0',
  });

  server.tool(
    'get_c4_model',
    'Get the current C4 architecture model including all elements and relationships',
    { ...commonParams },
    async ({ repoName, serverUrl }) => {
      const opts = buildRouteOpts({ repoName, serverUrl }, options);
      const result = await route('get_c4_model', { repoName }, opts);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'list_elements',
    'List all C4 elements with their IDs, types, and names. Useful for finding element IDs before adding relationships.',
    { ...commonParams },
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

  server.tool(
    'add_element',
    'Add a manual C4 element (person, system, container, or component) to the architecture model',
    {
      type: elementTypeEnum.describe('Element type'),
      name: z.string().describe('Element name'),
      description: z.string().optional().describe('Element description'),
      external: z.boolean().default(false).describe('Whether this is an external element'),
      parentId: z.string().nullable().default(null).describe('Parent element ID (system for container, container for component)'),
      serviceType: z.string().optional().describe('Service type identifier (e.g. "supabase", "postgresql")'),
      ...commonParams,
    },
    async ({ type, name, description, external, parentId, serviceType, repoName, serverUrl }) => {
      const opts = buildRouteOpts({ repoName, serverUrl }, options);
      const result = await route('add_element', { type, name, description, external, parentId, serviceType }, opts);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'update_element',
    'Update a manual C4 element',
    {
      id: z.string().describe('Element ID to update'),
      name: z.string().optional().describe('New name'),
      description: z.string().optional().describe('New description'),
      external: z.boolean().optional().describe('New external flag'),
      serviceType: z.string().optional().describe('New service type'),
      ...commonParams,
    },
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

  server.tool(
    'remove_element',
    'Remove a manual C4 element (and its associated relationships)',
    {
      id: z.string().describe('Element ID to remove'),
      ...commonParams,
    },
    async ({ id, repoName, serverUrl }) => {
      const opts = buildRouteOpts({ repoName, serverUrl }, options);
      await route('remove_element', { id }, opts);
      return { content: [{ type: 'text' as const, text: `Removed element ${id}` }] };
    },
  );

  server.tool(
    'list_relationships',
    'List all manual C4 relationships with their IDs. Useful for finding relationship IDs before removing them.',
    { ...commonParams },
    async ({ repoName, serverUrl }) => {
      const opts = buildRouteOpts({ repoName, serverUrl }, options);
      const result = await route('list_relationships', { repoName }, opts);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'add_relationship',
    'Add a relationship between two C4 elements',
    {
      fromId: z.string().describe('Source element ID'),
      toId: z.string().describe('Target element ID'),
      label: z.string().optional().describe('Relationship label (e.g. "Uses", "Calls", "Reads from")'),
      technology: z.string().optional().describe('Technology used (e.g. "REST API", "gRPC", "PostgreSQL")'),
      ...commonParams,
    },
    async ({ fromId, toId, label, technology, repoName, serverUrl }) => {
      const opts = buildRouteOpts({ repoName, serverUrl }, options);
      const result = await route('add_relationship', { fromId, toId, label, technology }, opts);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'remove_relationship',
    'Remove a relationship between C4 elements',
    {
      id: z.string().describe('Relationship ID to remove'),
      ...commonParams,
    },
    async ({ id, repoName, serverUrl }) => {
      const opts = buildRouteOpts({ repoName, serverUrl }, options);
      await route('remove_relationship', { id }, opts);
      return { content: [{ type: 'text' as const, text: `Removed relationship ${id}` }] };
    },
  );

  server.tool(
    'list_groups',
    'List all manual C4 groups with their IDs and member element IDs.',
    { ...commonParams },
    async ({ repoName, serverUrl }) => {
      const opts = buildRouteOpts({ repoName, serverUrl }, options);
      const result = await route('list_groups', { repoName }, opts);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'add_group',
    'Create a visual group for a set of C4 elements',
    {
      memberIds: z.array(z.string()).min(2).describe('Element IDs to include in the group (minimum 2)'),
      label: z.string().optional().describe('Optional label for the group'),
      ...commonParams,
    },
    async ({ memberIds, label, repoName, serverUrl }) => {
      const opts = buildRouteOpts({ repoName, serverUrl }, options);
      const result = await route('add_group', { memberIds, label }, opts);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'update_group',
    'Update the label or members of a group',
    {
      id: z.string().describe('Group ID to update'),
      label: z.string().nullable().optional().describe('New label (null to clear)'),
      memberIds: z.array(z.string()).min(2).optional().describe('New member list (minimum 2)'),
      ...commonParams,
    },
    async ({ id, label, memberIds, repoName, serverUrl }) => {
      const opts = buildRouteOpts({ repoName, serverUrl }, options);
      await route('update_group', { id, memberIds, label }, opts);
      return { content: [{ type: 'text' as const, text: `Updated group ${id}` }] };
    },
  );

  server.tool(
    'remove_group',
    'Remove a visual group (members are not deleted)',
    {
      id: z.string().describe('Group ID to remove'),
      ...commonParams,
    },
    async ({ id, repoName, serverUrl }) => {
      const opts = buildRouteOpts({ repoName, serverUrl }, options);
      await route('remove_group', { id }, opts);
      return { content: [{ type: 'text' as const, text: `Removed group ${id}` }] };
    },
  );

  // -------------------------------------------------------------------------
  //  Analyze pipeline tools (trigger VS Code extension via HTTP)
  // -------------------------------------------------------------------------

  server.tool(
    'analyze_current_code',
    'Run C4 / code graph analysis for the current workspace and persist results to Trail DB. Equivalent to "Anytime Trail: コード解析" command. Requires VS Code extension to be running. Returns 409 if another analysis is in progress. Subscribes to WebSocket progress events during the run and includes them in the response.',
    {
      ...commonParams,
      workspacePath: z.string().optional().describe('Absolute path to analyze (overrides anytimeTrail.workspace.path; defaults to extension current workspace)'),
      tsconfigPath: z.string().optional().describe('Specific tsconfig.json path to use. If omitted and multiple are found, the topmost (workspace root) is selected automatically'),
      includeProgress: z.boolean().optional().describe('Include WebSocket progress log in response (default: true)'),
    },
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

  server.tool(
    'analyze_release_code',
    'Run release-grouped C4 / code graph analysis (deletes existing release_code_graphs and regenerates). Equivalent to "Anytime Trail: リリース別コード解析" command.',
    { ...commonParams },
    async ({ serverUrl }) => {
      const opts = buildRouteOpts({ serverUrl }, options);
      const result = await route('analyze_release_code', {}, opts);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'analyze_all',
    'Import all Trail data (Claude Code JSONL sessions, commits, releases, coverage) from ~/.claude/projects. Equivalent to "Anytime Trail: 全データ解析" command.',
    { ...commonParams },
    async ({ serverUrl }) => {
      const opts = buildRouteOpts({ serverUrl }, options);
      const result = await route('analyze_all', {}, opts);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'get_analyze_status',
    'Check whether an analysis pipeline is currently in progress.',
    { ...commonParams },
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

  server.tool(
    'list_communities',
    'List code graph communities for a repo with their label / name / summary / mappings_json. Used by anytime-reverse-engineer skill for filtering and cache lookup.',
    { ...commonParams },
    async ({ repoName, serverUrl }) => {
      const opts = buildRouteOpts({ repoName, serverUrl }, options);
      const result = await route('list_communities', { repoName }, opts);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'upsert_community_summaries',
    'Upsert community name + summary pairs to current_code_graph_communities. Used by anytime-reverse-engineer skill after AI generation. mappings_json is preserved.',
    {
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
    },
    async ({ summaries, repoName, serverUrl }) => {
      const opts = buildRouteOpts({ repoName, serverUrl }, options);
      const result = await route('upsert_community_summaries', { summaries }, opts);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'upsert_community_mappings',
    'Upsert C4 element role mappings (mappings_json) per community. Used by anytime-reverse-engineer skill after role determination. name/summary are preserved.',
    {
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
    },
    async ({ mappings, repoName, serverUrl }) => {
      const opts = buildRouteOpts({ repoName, serverUrl }, options);
      const result = await route('upsert_community_mappings', { mappings }, opts);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // -------------------------------------------------------------------------
  //  Drift detection tools (memory-core)
  // -------------------------------------------------------------------------

  server.tool(
    'detect_drift',
    'Query persisted drift events with optional filters for severity, drift_type, subject entity, and time range',
    {
      unresolved_only: DetectDriftInputSchema.shape.unresolved_only,
      severity: DetectDriftInputSchema.shape.severity,
      drift_type: DetectDriftInputSchema.shape.drift_type,
      subject_id: DetectDriftInputSchema.shape.subject_id,
      since: DetectDriftInputSchema.shape.since,
      limit: DetectDriftInputSchema.shape.limit,
    },
    async (args) => {
      const result = await handleDetectDrift(args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'explain_drift',
    'Return the 5-source (conversation/spec/code/bug_history/review) evidence for a specific drift event',
    { event_id: ExplainDriftInputSchema.shape.event_id },
    async (args) => {
      const result = await handleExplainDrift(args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'resolve_drift',
    'Mark a drift event as resolved with a resolution note',
    {
      event_id: ResolveDriftInputSchema.shape.event_id,
      resolution_note: ResolveDriftInputSchema.shape.resolution_note,
      resolved_at: ResolveDriftInputSchema.shape.resolved_at,
    },
    async (args) => {
      const result = await handleResolveDrift(args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // -------------------------------------------------------------------------
  //  Review agent tools (memory-core)
  // -------------------------------------------------------------------------

  server.tool(
    'run_review_agent',
    'Register a review agent run request and return a run_id immediately (actual agent execution is delegated)',
    {
      trigger_kind: RunReviewAgentInputSchema.shape.trigger_kind,
      target_kind: RunReviewAgentInputSchema.shape.target_kind,
      target_refs: RunReviewAgentInputSchema.shape.target_refs,
      prompt_kind: RunReviewAgentInputSchema.shape.prompt_kind,
      model: RunReviewAgentInputSchema.shape.model,
    },
    async (args) => {
      const result = await handleRunReviewAgent(args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'get_review_run_status',
    'Get the status of a review agent run by run_id',
    { run_id: GetReviewRunStatusInputSchema.shape.run_id },
    async (args) => {
      const result = await handleGetReviewRunStatus(args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'list_review_runs',
    'List review agent runs with optional filters for trigger_kind, status, target_kind, model, and since',
    {
      trigger_kind: ListReviewRunsInputSchema.shape.trigger_kind,
      status: ListReviewRunsInputSchema.shape.status,
      target_kind: ListReviewRunsInputSchema.shape.target_kind,
      model: ListReviewRunsInputSchema.shape.model,
      since: ListReviewRunsInputSchema.shape.since,
      limit: ListReviewRunsInputSchema.shape.limit,
    },
    async (args) => {
      const result = await handleListReviewRuns(args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'list_review_target_hints',
    'List prioritized review target candidates based on drift events, recent bug fixes, and unreviewed files',
    { limit: ListReviewTargetHintsInputSchema.shape.limit },
    async (args) => {
      const result = await handleListReviewTargetHints(args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // -------------------------------------------------------------------------
  //  Bug history tools (memory-core)
  // -------------------------------------------------------------------------

  server.tool(
    'list_recurring_bugs',
    'List recurring bug groups filtered by package, file path, or root-cause entity within a time window',
    {
      package: ListRecurringBugsInputSchema.shape.package,
      file_path: ListRecurringBugsInputSchema.shape.file_path,
      caused_by_entity_id: ListRecurringBugsInputSchema.shape.caused_by_entity_id,
      windowDays: ListRecurringBugsInputSchema.shape.windowDays,
      minCount: ListRecurringBugsInputSchema.shape.minCount,
    },
    async (args) => {
      const result = await handleListRecurringBugs(args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'get_bug_history',
    'Retrieve bug fix history with affected file paths and root-cause entity references',
    {
      package: GetBugHistoryInputSchema.shape.package,
      file_path: GetBugHistoryInputSchema.shape.file_path,
      category: GetBugHistoryInputSchema.shape.category,
      limit: GetBugHistoryInputSchema.shape.limit,
    },
    async (args) => {
      const result = await handleGetBugHistory(args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // -------------------------------------------------------------------------
  //  Review tools (memory-core)
  // -------------------------------------------------------------------------

  server.tool(
    'list_unaddressed_review_findings',
    'List review findings that have not yet been addressed, with optional severity/age/category filters',
    {
      severity: ListUnaddressedReviewFindingsInputSchema.shape.severity,
      daysSinceMin: ListUnaddressedReviewFindingsInputSchema.shape.daysSinceMin,
      target_file_path: ListUnaddressedReviewFindingsInputSchema.shape.target_file_path,
      category: ListUnaddressedReviewFindingsInputSchema.shape.category,
      limit: ListUnaddressedReviewFindingsInputSchema.shape.limit,
    },
    async (args) => {
      const result = await handleListUnaddressedReviewFindings(args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'get_review_history',
    'Retrieve review history with findings, optionally including linked bug entities via precedes edges',
    {
      target_file_path: GetReviewHistoryInputSchema.shape.target_file_path,
      package: GetReviewHistoryInputSchema.shape.package,
      category: GetReviewHistoryInputSchema.shape.category,
      include_precedes_bugs: GetReviewHistoryInputSchema.shape.include_precedes_bugs,
      limit: GetReviewHistoryInputSchema.shape.limit,
    },
    async (args) => {
      const result = await handleGetReviewHistory(args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'link_review_to_commit',
    'Mark a review finding as addressed by a specific commit, inserting an addresses edge',
    {
      finding_id: LinkReviewToCommitInputSchema.shape.finding_id,
      commit_sha: LinkReviewToCommitInputSchema.shape.commit_sha,
      addressed_at: LinkReviewToCommitInputSchema.shape.addressed_at,
      override_auto: LinkReviewToCommitInputSchema.shape.override_auto,
    },
    async (args) => {
      const result = await handleLinkReviewToCommit(args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // -------------------------------------------------------------------------
  //  Memory graph search (memory-core)
  // -------------------------------------------------------------------------

  server.tool(
    'search_memory',
    'Search the memory graph for entities, relationships, and conversation episodes related to the query',
    {
      query: SearchMemoryInputSchema.shape.query,
      entity_types: SearchMemoryInputSchema.shape.entity_types,
      source_type: SearchMemoryInputSchema.shape.source_type,
      since: SearchMemoryInputSchema.shape.since,
      limit: SearchMemoryInputSchema.shape.limit,
      hops: SearchMemoryInputSchema.shape.hops,
    },
    async (args) => {
      const result = await handleSearchMemory(args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  return server;
}
