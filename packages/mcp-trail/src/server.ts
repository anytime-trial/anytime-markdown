import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { analyzeCurrentCodeWithProgress } from './client.js';
import { probeServerAlive } from './probe.js';
import type { RouteOpts } from './router.js';
import { route } from './router.js';
import { DetectDriftInputSchema, handleDetectDrift } from './tools/detectDrift.js';
import {
  capDependencies,
  capQueryResult,
  filterCochangePartners,
  filterCommunityNodes,
  projectCommunities,
  type RawCommunity,
  toSummaryRows,
} from './tools/discoveryShaping.js';
import {
  EvaluateReverseSpecInputSchema,
  handleEvaluateReverseSpec,
} from './tools/evaluateReverseSpec.js';
import { ExplainDriftInputSchema, handleExplainDrift } from './tools/explainDrift.js';
import { GetBugHistoryInputSchema, handleGetBugHistory } from './tools/getBugHistory.js';
import { GetReviewHistoryInputSchema, handleGetReviewHistory } from './tools/getReviewHistory.js';
import { GetReviewRunStatusInputSchema, handleGetReviewRunStatus } from './tools/getReviewRunStatus.js';
import { type FileAnalysisEntry, type ImportantFilesFilter,selectImportantFiles } from './tools/importantFiles.js';
import { handleLinkReviewToCommit,LinkReviewToCommitInputSchema } from './tools/linkReviewToCommit.js';
import { handleListRecurringBugs,ListRecurringBugsInputSchema } from './tools/listRecurringBugs.js';
import { handleListReviewRuns,ListReviewRunsInputSchema } from './tools/listReviewRuns.js';
import { handleListReviewTargetHints,ListReviewTargetHintsInputSchema } from './tools/listReviewTargetHints.js';
import { handleListUnaddressedReviewFindings,ListUnaddressedReviewFindingsInputSchema } from './tools/listUnaddressedReviewFindings.js';
import { toCodeGraphNodeId } from './tools/nodeId.js';
import { handleResolveDrift,ResolveDriftInputSchema } from './tools/resolveDrift.js';
import { handleRecordDoctrineJudgment, RecordDoctrineJudgmentInputSchema } from './tools/recordDoctrineJudgment.js';
import { handleRecordHumanDecision, RecordHumanDecisionInputSchema } from './tools/recordHumanDecision.js';
import {
  handleListOpenInstructions,
  handleRecordInstruction,
  ListOpenInstructionsInputSchema,
  RecordInstructionInputSchema,
} from './tools/recordInstruction.js';
import { handleRecordDelegatedApproval, RecordDelegatedApprovalInputSchema } from './tools/recordDelegatedApproval.js';
import {
  handleGetOddPolicy,
  handleEvaluateApprovalPolicy,
  GetOddPolicyInputSchema,
  EvaluateApprovalPolicyInputSchema,
} from './tools/oddPolicy.js';
import { handleGetDoctrineAgreement, GetDoctrineAgreementInputSchema } from './tools/getDoctrineAgreement.js';
import { handleGetThreatFramework, GetThreatFrameworkInputSchema } from './tools/getThreatFramework.js';
import { handleGetAcceptanceReview, GetAcceptanceReviewInputSchema } from './tools/getAcceptanceReview.js';
import { handleListBoundaryDrift, ListBoundaryDriftInputSchema } from './tools/listBoundaryDrift.js';
import { handleRunReviewAgent,RunReviewAgentInputSchema } from './tools/runReviewAgent.js';
import { handleSearchCaravanBook,SearchCaravanBookInputSchema } from './tools/searchCaravanBook.js';
import {
  handleListCaravanCommunities,
  ListCaravanCommunitiesInputSchema,
  handleUpsertCaravanCommunitySummaries,
  UpsertCaravanCommunitySummariesInputSchema,
} from './tools/caravanCommunities.js';
import { GetVerificationStatusInputSchema, handleGetVerificationStatus } from './tools/verificationStatus.js';

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
    {
      description:
        'Run release-grouped C4 / code graph analysis. Without "tags" this deletes ALL existing activity_release_code_graphs and regenerates every release. With "tags" only those releases are deleted and regenerated, leaving other cached graphs intact. Equivalent to "Anytime Trail: リリース別コード解析" command.',
      inputSchema: {
        ...commonParams,
        tags: z
          .array(z.string().min(1))
          .optional()
          .describe('Release tags to regenerate (e.g. ["v1.19.1"]). Omit to rewash all releases.'),
      },
    },
    async ({ serverUrl, tags }) => {
      const opts = buildRouteOpts({ serverUrl }, options);
      const result = await route('analyze_release_code', { tags }, opts);
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
    { description: 'Upsert community name + summary pairs to activity_current_code_graph_communities. Used by anytime-reverse-engineer skill after AI generation. mappings_json is preserved.', inputSchema: {
      summaries: z
        .array(
          z.object({
            communityId: z.number().int().describe('community_id from activity_current_code_graphs.graph_json'),
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
                  elementId: z.string().describe('C4 element id (e.g. pkg_trail-activity/coverage)'),
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
  //  Drift detection tools (trail-caravan-book)
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
      workspacePath: DetectDriftInputSchema.shape.workspacePath,
    }, },
    async (args) => {
      const result = await handleDetectDrift(args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    'explain_drift',
    { description: 'Return the 5-source (conversation/spec/code/bug_history/review) evidence for a specific drift event', inputSchema: { event_id: ExplainDriftInputSchema.shape.event_id, workspacePath: ExplainDriftInputSchema.shape.workspacePath } },
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
      workspacePath: ResolveDriftInputSchema.shape.workspacePath,
    }, },
    async (args) => {
      const result = await handleResolveDrift(args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // -------------------------------------------------------------------------
  //  Doctrine judgment tools (D1 並走記録: activity.db 直書き)
  // -------------------------------------------------------------------------

  server.registerTool(
    'record_doctrine_judgment',
    { description: 'Record the agent\'s doctrine-grounded judgment BEFORE asking a human for an intermediate (What) approval. Citations are resolution-checked (file exists + verbatim quote matches) and the per-citation result is stored; unresolved citations do not reject the record (D1 measures hallucinated-citation frequency). The coverage gate (DCT-10..12) evaluates whether the judgment may be delegated and stores the verdict; omitting target_paths, severity or operation_kind makes the verdict escalate (fail-closed), so always declare all three. Also declare underspecified_points (DCT-14): the points the human\'s instruction does not determine. Leaving it empty is a positive claim that the instruction alone fixes the outcome, and a non-empty array escalates — an approval whose content you had to invent is not delegable no matter how well grounded it is. D2 is ACTIVE (since 2026-08-05): act on the returned gate.verdict — if it is "delegable" AND your judgment is "approve", proceed WITHOUT asking the human and immediately call record_delegated_approval; otherwise ask the human and then call record_human_decision. Package add/update, destructive operations, remote push and production release always escalate — declare them via operation_kind so the gate enforces it rather than relying on prose. Re-recording the same session_id + subject overwrites and resets any recorded human decision and delegation.', inputSchema: {
      session_id: RecordDoctrineJudgmentInputSchema.shape.session_id,
      subject: RecordDoctrineJudgmentInputSchema.shape.subject,
      judgment: RecordDoctrineJudgmentInputSchema.shape.judgment,
      coverage: RecordDoctrineJudgmentInputSchema.shape.coverage,
      citations: RecordDoctrineJudgmentInputSchema.shape.citations,
      target_paths: RecordDoctrineJudgmentInputSchema.shape.target_paths,
      severity: RecordDoctrineJudgmentInputSchema.shape.severity,
      operation_kind: RecordDoctrineJudgmentInputSchema.shape.operation_kind,
      underspecified_points: RecordDoctrineJudgmentInputSchema.shape.underspecified_points,
      judged_at: RecordDoctrineJudgmentInputSchema.shape.judged_at,
      workspacePath: RecordDoctrineJudgmentInputSchema.shape.workspacePath,
    }, },
    async (args) => {
      const result = await handleRecordDoctrineJudgment(args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // -------------------------------------------------------------------------
  //  Flight Record: 指示（instruction）の宣言
  // -------------------------------------------------------------------------

  server.registerTool(
    'list_open_instructions',
    { description: 'List instructions that are still open in this workspace, newest first. Call this at the start of a session, BEFORE record_instruction, to see whether the work you are about to do continues an existing instruction (a "keep going" / "next one" style prompt almost always does). Returns instruction_id, its one-line summary, the human\'s opening prompt and how many sessions it already spans.', inputSchema: {
      limit: ListOpenInstructionsInputSchema.shape.limit,
      workspacePath: ListOpenInstructionsInputSchema.shape.workspacePath,
    }, },
    async (args) => {
      const result = await handleListOpenInstructions(args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    'record_instruction',
    { description: 'Declare which instruction (unit of work the human asked for) this session belongs to. Flight Record groups its rows by instruction, not by session, and ONLY this declaration creates that grouping — nothing infers it from the prompt text. Call it once per session, before doing the work: mode="continue" with the instruction_id from list_open_instructions when the session carries on earlier work, otherwise mode="new" with a one-line summary of what was asked. A session that never declares is shown as its own single-session instruction, so forgetting splits the work across rows rather than losing it. Use mode="close" when the instruction is finished so it stops being offered as a candidate. One session belongs to exactly one instruction; re-declaring moves it.', inputSchema: {
      mode: RecordInstructionInputSchema.shape.mode,
      session_id: RecordInstructionInputSchema.shape.session_id,
      instruction_id: RecordInstructionInputSchema.shape.instruction_id,
      summary: RecordInstructionInputSchema.shape.summary,
      origin_prompt: RecordInstructionInputSchema.shape.origin_prompt,
      workspacePath: RecordInstructionInputSchema.shape.workspacePath,
    }, },
    async (args) => {
      const result = await handleRecordInstruction(args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    'record_human_decision',
    { description: "Record the human's actual decision for a previously recorded doctrine judgment (lookup by id, or by session_id + subject) and return the agreement result. Errors if no matching judgment exists.", inputSchema: {
      id: RecordHumanDecisionInputSchema.shape.id,
      session_id: RecordHumanDecisionInputSchema.shape.session_id,
      subject: RecordHumanDecisionInputSchema.shape.subject,
      decision: RecordHumanDecisionInputSchema.shape.decision,
      decided_at: RecordHumanDecisionInputSchema.shape.decided_at,
      workspacePath: RecordHumanDecisionInputSchema.shape.workspacePath,
    }, },
    async (args) => {
      const result = await handleRecordHumanDecision(args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    'get_odd_policy',
    { description: "Resolve the ODD (Operational Design Domain) policy registry for the workspace and report where it came from: 'registry' (.anytime/trail/odd.json parsed), 'derived' (no registry file — built-in default, identical to pre-registry behaviour), or 'invalid' (the file exists but is broken). An invalid registry is NOT silently replaced by the default: a protection someone tried to add must not disappear because of a syntax error. Returns both `registry` (the resolved internal shape) and `registrySource` (the same policy in odd.json file format). Use `registrySource` — not `registry` — when seeding or editing .anytime/trail/odd.json: the internal shape differs at `narrowing` and `godNodePercentile`, and copying it produces a registry that is either rejected as invalid or silently falls back to the default percentile.", inputSchema: {
      workspacePath: GetOddPolicyInputSchema.shape.workspacePath,
    }, },
    async (args) => {
      const result = handleGetOddPolicy(args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    'get_threat_framework',
    { description: "Return the agentic threat framework (5 tactics, 17 techniques ADR.T0001-T0017) ported from Uber's ADR (Apache-2.0). Read-only static data compiled into trail-activity — no DB or network access. Use it to ground threat analysis of agent sessions: pass `tactic` to narrow to one tactic's techniques, omit it for the full framework. Each technique carries id / name / jaName / description.", inputSchema: {
      tactic: GetThreatFrameworkInputSchema.shape.tactic,
    }, },
    async (args) => {
      const result = handleGetThreatFramework(args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    'evaluate_approval_policy',
    { description: "Evaluate whether an operation is allow / confirm / deny under the ODD policy registry (Phase 7-A Approval Rule Engine). Rules, in order: broken registry, ODD boundary / restricted area, language outside ODD, dynamic narrowing (release freeze / incident), God Node impact, then the declared per-operation policy. An operation kind with no declared policy resolves to confirm, never allow. declaredVerdict reports what the registry said even when a higher rule overrode it.", inputSchema: {
      operation_kind: EvaluateApprovalPolicyInputSchema.shape.operation_kind,
      target_paths: EvaluateApprovalPolicyInputSchema.shape.target_paths,
      language: EvaluateApprovalPolicyInputSchema.shape.language,
      is_god_node: EvaluateApprovalPolicyInputSchema.shape.is_god_node,
      workspacePath: EvaluateApprovalPolicyInputSchema.shape.workspacePath,
    }, },
    async (args) => {
      const result = handleEvaluateApprovalPolicy(args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    'record_delegated_approval',
    { description: "Record that the agent delegated (auto-approved) a What approval under D2, instead of asking the human. Refuses unless the stored coverage gate verdict is 'delegable', the agent judgment is 'approve', and no human decision exists yet — a delegation record that could be fabricated after the fact would make both the agreement rate and the delegation rate useless for audit. The timestamp is always server-side now and cannot be supplied by the caller. Calling again on an already-delegated judgment is a no-op that returns the original timestamp (alreadyDelegated: true). A human may still record a decision afterwards as a sampling audit.", inputSchema: {
      id: RecordDelegatedApprovalInputSchema.shape.id,
      session_id: RecordDelegatedApprovalInputSchema.shape.session_id,
      subject: RecordDelegatedApprovalInputSchema.shape.subject,
      workspacePath: RecordDelegatedApprovalInputSchema.shape.workspacePath,
    }, },
    async (args) => {
      const result = await handleRecordDelegatedApproval(args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    'get_doctrine_agreement',
    { description: 'Aggregate doctrine judgment metrics: agreement rate (covered + human-decided, escalate excluded), escalation rate, citation resolution rate, canon-grounded rate (covered judgments citing at least one approved clause), delegable rate (coverage gate verdicts that would have allowed delegation), delegated / delegatedAudited counts (D2 delegations and their sampling audits), and pending (neither decided nor delegated) count. Also instructionGapRate / underspecified (DCT-14 declarations of points the instruction did not determine; denominator = all judgments) and unreadableDeclarations. Judgments recorded before 2026-08-07 were backfilled as empty declarations and stay in the agreement-rate denominator, so pass since="2026-08-07" when reading instructionGapRate as a live signal. A non-zero unreadableDeclarations means the other two rates are not yet interpretable.', inputSchema: {
      since: GetDoctrineAgreementInputSchema.shape.since,
      until: GetDoctrineAgreementInputSchema.shape.until,
      workspacePath: GetDoctrineAgreementInputSchema.shape.workspacePath,
    }, },
    async (args) => {
      const result = await handleGetDoctrineAgreement(args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    'get_acceptance_review',
    { description: 'Assemble the acceptance-review material for a session (DCT-13): the delegated judgments, the doctrine clauses each judgment cited (verbatim quote + approval state + resolution result), the artifact diff, and the escalations with their reasons. Returns both structured data and a Markdown rendering meant to be pasted into the completion report. Read-only. The diff is taken from git directly (not the lagging activity_session_commits import); a git failure degrades to available=false with a reason instead of failing the whole call.', inputSchema: {
      session_id: GetAcceptanceReviewInputSchema.shape.session_id,
      base_ref: GetAcceptanceReviewInputSchema.shape.base_ref,
      head_ref: GetAcceptanceReviewInputSchema.shape.head_ref,
      include_diff: GetAcceptanceReviewInputSchema.shape.include_diff,
      workspacePath: GetAcceptanceReviewInputSchema.shape.workspacePath,
    }, },
    async (args) => {
      const result = await handleGetAcceptanceReview(args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    'list_boundary_drift',
    { description: 'List architectural boundary drift warnings: communities that span many packages (boundary_spanning) or packages split across many communities (package_fragmentation). Sorted by severity. Defaults to each repository latest detection run. An empty result carries a reason: no-warnings (analyzed and healthy) vs no-detection (never analyzed).', inputSchema: {
      repoName: ListBoundaryDriftInputSchema.shape.repoName,
      kind: ListBoundaryDriftInputSchema.shape.kind,
      minSeverity: ListBoundaryDriftInputSchema.shape.minSeverity,
      includeHistory: ListBoundaryDriftInputSchema.shape.includeHistory,
      limit: ListBoundaryDriftInputSchema.shape.limit,
      workspacePath: ListBoundaryDriftInputSchema.shape.workspacePath,
    }, },
    async (args) => {
      const result = await handleListBoundaryDrift(args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // -------------------------------------------------------------------------
  //  Review agent tools (trail-caravan-book)
  // -------------------------------------------------------------------------

  server.registerTool(
    'run_review_agent',
    { description: 'Register a review agent run request and return a run_id immediately (actual agent execution is delegated)', inputSchema: {
      trigger_kind: RunReviewAgentInputSchema.shape.trigger_kind,
      target_kind: RunReviewAgentInputSchema.shape.target_kind,
      target_refs: RunReviewAgentInputSchema.shape.target_refs,
      prompt_kind: RunReviewAgentInputSchema.shape.prompt_kind,
      model: RunReviewAgentInputSchema.shape.model,
      workspacePath: RunReviewAgentInputSchema.shape.workspacePath,
    }, },
    async (args) => {
      const result = await handleRunReviewAgent(args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    'get_review_run_status',
    { description: 'Get the status of a review agent run by run_id', inputSchema: { run_id: GetReviewRunStatusInputSchema.shape.run_id, workspacePath: GetReviewRunStatusInputSchema.shape.workspacePath } },
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
      workspacePath: ListReviewRunsInputSchema.shape.workspacePath,
    }, },
    async (args) => {
      const result = await handleListReviewRuns(args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    'list_review_target_hints',
    { description: 'List prioritized review target candidates based on drift events, recent bug fixes, and unreviewed files', inputSchema: { limit: ListReviewTargetHintsInputSchema.shape.limit, workspacePath: ListReviewTargetHintsInputSchema.shape.workspacePath } },
    async (args) => {
      const result = await handleListReviewTargetHints(args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // -------------------------------------------------------------------------
  //  Bug history tools (trail-caravan-book)
  // -------------------------------------------------------------------------

  server.registerTool(
    'list_recurring_bugs',
    { description: 'List recurring bug groups filtered by package, file path, or root-cause entity within a time window', inputSchema: {
      package: ListRecurringBugsInputSchema.shape.package,
      file_path: ListRecurringBugsInputSchema.shape.file_path,
      caused_by_entity_id: ListRecurringBugsInputSchema.shape.caused_by_entity_id,
      windowDays: ListRecurringBugsInputSchema.shape.windowDays,
      minCount: ListRecurringBugsInputSchema.shape.minCount,
      workspacePath: ListRecurringBugsInputSchema.shape.workspacePath,
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
      workspacePath: GetBugHistoryInputSchema.shape.workspacePath,
    }, },
    async (args) => {
      const result = await handleGetBugHistory(args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // -------------------------------------------------------------------------
  //  Review tools (trail-caravan-book)
  // -------------------------------------------------------------------------

  server.registerTool(
    'list_unaddressed_review_findings',
    { description: 'List review findings that have not yet been addressed, with optional severity/age/category filters', inputSchema: {
      severity: ListUnaddressedReviewFindingsInputSchema.shape.severity,
      daysSinceMin: ListUnaddressedReviewFindingsInputSchema.shape.daysSinceMin,
      target_file_path: ListUnaddressedReviewFindingsInputSchema.shape.target_file_path,
      category: ListUnaddressedReviewFindingsInputSchema.shape.category,
      checklist_ref: ListUnaddressedReviewFindingsInputSchema.shape.checklist_ref,
      limit: ListUnaddressedReviewFindingsInputSchema.shape.limit,
      workspacePath: ListUnaddressedReviewFindingsInputSchema.shape.workspacePath,
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
      workspacePath: GetReviewHistoryInputSchema.shape.workspacePath,
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
      workspacePath: LinkReviewToCommitInputSchema.shape.workspacePath,
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
  //  CaravanBook graph search (trail-caravan-book)
  // -------------------------------------------------------------------------

  server.registerTool(
    'search_caravan_book',
    { description: 'Search the memory graph for entities, relationships, and conversation episodes related to the query', inputSchema: {
      query: SearchCaravanBookInputSchema.shape.query,
      entity_types: SearchCaravanBookInputSchema.shape.entity_types,
      source_type: SearchCaravanBookInputSchema.shape.source_type,
      since: SearchCaravanBookInputSchema.shape.since,
      limit: SearchCaravanBookInputSchema.shape.limit,
      hops: SearchCaravanBookInputSchema.shape.hops,
      workspacePath: SearchCaravanBookInputSchema.shape.workspacePath,
    }, },
    async (args) => {
      const result = await handleSearchCaravanBook(args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    'list_caravan_communities',
    { description: 'List knowledge-graph (caravan-book) Louvain communities of the current layout with stable_key, member count and representative members. Use before assigning names/summaries (T-22 staged assignment; default min_size 10)', inputSchema: {
      min_size: ListCaravanCommunitiesInputSchema.shape.min_size,
      unsummarized_only: ListCaravanCommunitiesInputSchema.shape.unsummarized_only,
      sample_size: ListCaravanCommunitiesInputSchema.shape.sample_size,
      limit: ListCaravanCommunitiesInputSchema.shape.limit,
      workspacePath: ListCaravanCommunitiesInputSchema.shape.workspacePath,
    }, },
    async (args) => {
      const result = await handleListCaravanCommunities(args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    'upsert_caravan_community_summaries',
    { description: 'Assign names/summaries to caravan-book knowledge-graph communities (idempotent upsert keyed by stable_key from list_caravan_communities). Keys not present in the current layout are skipped and reported', inputSchema: {
      summaries: UpsertCaravanCommunitySummariesInputSchema.shape.summaries,
      workspacePath: UpsertCaravanCommunitySummariesInputSchema.shape.workspacePath,
    }, },
    async (args) => {
      const result = await handleUpsertCaravanCommunitySummaries(args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    'get_verification_status',
    {
      description:
        'Check the verification ledger (activity.db, table activity_verification_runs): which verification kinds (unit/build/next-build/typecheck/lint/e2e/manual) already have a pass record for the current clean commit. Ledger answers "what has been run", never "what must run" — missing/dirty/no-db always falls back to needsRun. Records are written by scripts/run-verified.mjs.',
      inputSchema: {
        package: GetVerificationStatusInputSchema.shape.package,
        kinds: GetVerificationStatusInputSchema.shape.kinds,
        workspacePath: GetVerificationStatusInputSchema.shape.workspacePath,
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      const result = await handleGetVerificationStatus(args);
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
    'check_alignment',
    {
      description:
        'Check whether spec documents kept up with code changes (Architectural Alignment). Maps changed files to C4 elements, reverse-looks-up the spec documents that declare those elements in c4Scope, and reports whether those specs were updated in the same change unit. Returns { scope, checkedFiles, skippedMinor, findings[] } where each finding is { status: stale|ok|undocumented|unknown, elementId, specPath, changedFiles, reason }. stale = code changed but its spec did not. undocumented = no spec declares that element. unknown = the spec repository commits needed for the judgement are not ingested into activity.db, so staleness cannot be determined (do not read this as an update omission; fix ingestion instead). scope: worktree (default; uncommitted changes) | session (sessionId required) | range (fromRef/toRef required). Repository paths come from the server (gitRoot and lep.json sources.docs.root) and cannot be passed in.',
      inputSchema: {
        scope: z
          .enum(['worktree', 'session', 'range'])
          .default('worktree')
          .describe('Comparison basis (default: worktree = uncommitted changes)'),
        sessionId: z.string().optional().describe('Required when scope=session'),
        fromRef: z.string().optional().describe('Required when scope=range'),
        toRef: z.string().optional().describe('Required when scope=range'),
        minAddedLines: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe('Minimum added lines for a change to count as substantial (default 20)'),
        ...commonParams,
      },
      annotations: { readOnlyHint: true },
    },
    async ({ scope, sessionId, fromRef, toRef, minAddedLines, repoName, serverUrl }) => {
      const opts = buildRouteOpts({ repoName, serverUrl }, options);
      const report = await route(
        'check_alignment',
        {
          scope,
          ...(sessionId ? { sessionId } : {}),
          ...(fromRef ? { fromRef } : {}),
          ...(toRef ? { toRef } : {}),
          ...(minAddedLines === undefined ? {} : { minAddedLines }),
        },
        opts,
      );
      return { content: [{ type: 'text' as const, text: JSON.stringify(report, null, 2) }] };
    },
  );

  server.registerTool(
    'query_code_graph',
    {
      description:
        'Search the code graph for nodes whose id/label matches a keyword, ranked by importance. Use to LOCATE where a symbol/file lives. For dependency expansion use get_code_dependencies / find_code_path instead. Returns: summary (default) → { nodes, nodeTotal, truncated }; full → { nodes, edges, nodeTotal, edgeTotal, truncated }. detail=summary (default) returns matched nodes only (no edges); detail=full adds the induced edges among returned nodes. depth>0 expands neighbors (default 0 = matches only); nodes capped at `limit` (default 30).',
      inputSchema: {
        q: z.string().describe('Keyword to match against node id/label'),
        detail: z.enum(['summary', 'full']).default('summary').describe('summary = nodes only; full = include induced edges'),
        depth: z.number().int().min(0).max(3).default(0).describe('Neighbor hops (default 0 = matches only)'),
        limit: z.number().int().min(1).max(200).default(30).describe('Max nodes (default 30)'),
        ...commonParams,
      },
      annotations: { readOnlyHint: true },
    },
    async ({ q, detail, depth, limit, repoName, serverUrl }) => {
      const opts = buildRouteOpts({ repoName, serverUrl }, options);
      const raw = (await route('query_code_graph', { q, depth }, opts)) as {
        nodes?: string[];
        edges?: Array<{ source: string; target: string }>;
      };
      const capped = capQueryResult(raw, limit);
      const result =
        detail === 'full'
          ? capped
          : { nodes: capped.nodes, nodeTotal: capped.nodeTotal, truncated: capped.truncated };
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
