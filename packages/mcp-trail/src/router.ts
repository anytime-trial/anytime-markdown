import * as httpClient from './client';
import { resolveDbPath } from './dbPath';
import { probeServerAlive } from './probe';
import { resolveRepoName } from './repoName';
import { openTrailDb } from './sqlite/openDb';
import * as readDirect from './sqlite/read';
import * as writeDirect from './sqlite/write';

export interface RouteOpts {
  serverUrl: string;
  repoName?: string;
  workspacePath?: string;
  forceDirect?: boolean;
}

const READ_TOOLS = new Set([
  'get_c4_model',
  'list_elements',
  'list_groups',
  'list_communities',
  'list_community_nodes',
]);

const WRITE_TOOLS = new Set([
  'upsert_community_summaries',
  'upsert_community_mappings',
]);

const ANALYZE_TOOLS = new Set([
  'analyze_current_code',
  'analyze_release_code',
  'get_analyze_status',
]);

const DISCOVERY_TOOLS = new Set([
  'get_code_dependencies',
  'get_important_files',
  'query_code_graph',
  'find_code_path',
  'get_cochange_partners',
  'check_alignment',
]);

const HTTP_ONLY_TOOLS = new Set([...ANALYZE_TOOLS, ...DISCOVERY_TOOLS]);

export async function route(
  toolName: string,
  args: Record<string, unknown>,
  opts: RouteOpts,
): Promise<unknown> {
  if (HTTP_ONLY_TOOLS.has(toolName)) {
    const alive = opts.forceDirect ? false : await probeServerAlive(opts.serverUrl);
    if (!alive) {
      throw new Error(
        'TrailDataServer not running. Start "Anytime Trail" sidebar in VS Code or run "Anytime Trail: コード解析" command first.',
      );
    }
    return invokeHttp(toolName, args, opts);
  }

  if (READ_TOOLS.has(toolName)) {
    return invokeDirectRead(toolName, args, opts);
  }

  if (WRITE_TOOLS.has(toolName)) {
    const alive = opts.forceDirect ? false : await probeServerAlive(opts.serverUrl);
    if (alive) {
      return invokeHttp(toolName, args, opts);
    }
    return invokeDirectWrite(toolName, args, opts);
  }

  throw new Error(`Unknown tool: ${toolName}`);
}

async function invokeDirectRead(
  toolName: string,
  _args: Record<string, unknown>,
  opts: RouteOpts,
): Promise<unknown> {
  const dbPath = resolveDbPath({ workspacePath: opts.workspacePath });
  const opened = await openTrailDb(dbPath, 'readonly');
  try {
    const repoName = resolveRepoName(
      { repoName: opts.repoName, workspacePath: opts.workspacePath },
      opened.db,
    );
    switch (toolName) {
      case 'get_c4_model':
        return readDirect.getC4ModelDirect(opened.db, repoName);
      case 'list_elements':
        return readDirect.listElementsDirect(opened.db, repoName);
      case 'list_groups':
        return readDirect.listGroupsDirect(opened.db, repoName);
      case 'list_communities':
        return readDirect.listCommunitiesDirect(opened.db, repoName);
      case 'list_community_nodes':
        return readDirect.listCommunityNodesDirect(opened.db, repoName);
      default:
        throw new Error(`Unhandled read tool: ${toolName}`);
    }
  } finally {
    opened.close();
  }
}

async function invokeDirectWrite(
  toolName: string,
  args: Record<string, unknown>,
  opts: RouteOpts,
): Promise<unknown> {
  const dbPath = resolveDbPath({ workspacePath: opts.workspacePath });
  const opened = await openTrailDb(dbPath, 'readwrite');
  try {
    const repoName = resolveRepoName(
      { repoName: opts.repoName, workspacePath: opts.workspacePath },
      opened.db,
    );
    let result: unknown;
    switch (toolName) {
      case 'upsert_community_summaries':
        result = writeDirect.upsertCommunitySummariesDirect(
          opened.db,
          repoName,
          args.summaries as Parameters<typeof writeDirect.upsertCommunitySummariesDirect>[2],
        );
        break;
      case 'upsert_community_mappings':
        result = writeDirect.upsertCommunityMappingsDirect(
          opened.db,
          repoName,
          args.mappings as Parameters<typeof writeDirect.upsertCommunityMappingsDirect>[2],
        );
        break;
      default:
        throw new Error(`Unhandled write tool: ${toolName}`);
    }
    opened.save();
    return result;
  } finally {
    opened.close();
  }
}

async function invokeHttp(
  toolName: string,
  args: Record<string, unknown>,
  opts: RouteOpts,
): Promise<unknown> {
  const { serverUrl } = opts;
  const repoName = opts.repoName ?? '';
  switch (toolName) {
    case 'get_c4_model':
      return httpClient.getC4Model(serverUrl, repoName);
    case 'list_elements': {
      const payload = (await httpClient.getC4Model(serverUrl, repoName)) as {
        model?: { elements?: Array<{ id: string; type: string; name: string; external?: boolean; manual?: boolean }> };
      };
      return (payload?.model?.elements ?? []).map((e) => ({
        id: e.id,
        type: e.type,
        name: e.name,
        ...(e.external ? { external: true } : {}),
        ...(e.manual ? { manual: true } : {}),
      }));
    }
    case 'list_groups':
      return httpClient.listGroups(serverUrl, repoName);
    case 'list_communities':
      return httpClient.listCommunities(serverUrl, repoName);
    case 'upsert_community_summaries':
      return httpClient.upsertCommunitySummaries(
        serverUrl,
        repoName,
        (args as { summaries: Parameters<typeof httpClient.upsertCommunitySummaries>[2] }).summaries,
      );
    case 'upsert_community_mappings':
      return httpClient.upsertCommunityMappings(
        serverUrl,
        repoName,
        (args as { mappings: Parameters<typeof httpClient.upsertCommunityMappings>[2] }).mappings,
      );
    case 'analyze_current_code':
      return httpClient.analyzeCurrentCode(
        serverUrl,
        args,
      );
    case 'analyze_release_code':
      return httpClient.analyzeReleaseCode(
        serverUrl,
        args as { tags?: readonly string[] },
      );
    case 'get_analyze_status':
      return httpClient.getAnalyzeStatus(serverUrl);
    case 'get_code_dependencies':
      return httpClient.getCodeGraphExplain(
        serverUrl,
        (args as { nodeId: string }).nodeId,
        repoName,
      );
    case 'get_important_files':
      return httpClient.getFileAnalysis(serverUrl, repoName);
    case 'query_code_graph':
      return httpClient.getCodeGraphQuery(
        serverUrl,
        (args as { q: string }).q,
        repoName,
        (args as { depth?: number }).depth,
      );
    case 'find_code_path':
      return httpClient.getCodeGraphPath(
        serverUrl,
        (args as { from: string }).from,
        (args as { to: string }).to,
        repoName,
      );
    case 'get_cochange_partners':
      return httpClient.getTemporalCoupling(
        serverUrl,
        repoName,
        (args as { opts?: { windowDays?: number; topK?: number; granularity?: string } }).opts ?? {},
      );
    case 'check_alignment':
      return httpClient.getAlignmentReport(serverUrl, args as unknown as httpClient.AlignmentQuery);
    default:
      throw new Error(`Unhandled HTTP tool: ${toolName}`);
  }
}
