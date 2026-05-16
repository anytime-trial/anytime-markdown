import { resolveDbPath } from './dbPath';
import { resolveRepoName } from './repoName';
import { probeServerAlive } from './probe';
import { openTrailDb } from './sqlite/openDb';
import * as readDirect from './sqlite/read';
import * as writeDirect from './sqlite/write';
import * as httpClient from './client';

export interface RouteOpts {
  serverUrl: string;
  repoName?: string;
  workspacePath?: string;
  forceDirect?: boolean;
}

const READ_TOOLS = new Set([
  'get_c4_model',
  'list_elements',
  'list_relationships',
  'list_groups',
  'list_communities',
  'list_community_nodes',
]);

const WRITE_TOOLS = new Set([
  'add_element',
  'update_element',
  'remove_element',
  'add_group',
  'update_group',
  'remove_group',
  'add_relationship',
  'remove_relationship',
  'upsert_community_summaries',
  'upsert_community_mappings',
]);

const ANALYZE_TOOLS = new Set([
  'analyze_current_code',
  'analyze_release_code',
  'analyze_all',
  'get_analyze_status',
]);

export async function route(
  toolName: string,
  args: Record<string, unknown>,
  opts: RouteOpts,
): Promise<unknown> {
  if (ANALYZE_TOOLS.has(toolName)) {
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
      case 'list_relationships':
        return readDirect.listRelationshipsDirect(opened.db, repoName);
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
      case 'add_element':
        result = writeDirect.addElementDirect(opened.db, repoName, {
          type: args.type as string,
          name: args.name as string,
          external: (args.external as boolean) ?? false,
          parentId: (args.parentId as string | null) ?? null,
          ...(args.description !== undefined ? { description: args.description as string } : {}),
          ...(args.serviceType !== undefined ? { serviceType: args.serviceType as string } : {}),
        });
        break;
      case 'update_element':
        writeDirect.updateElementDirect(
          opened.db,
          repoName,
          args.id as string,
          args as Parameters<typeof writeDirect.updateElementDirect>[3],
        );
        result = { id: args.id };
        break;
      case 'remove_element':
        writeDirect.removeElementDirect(opened.db, repoName, args.id as string);
        result = { id: args.id };
        break;
      case 'add_group':
        result = writeDirect.addGroupDirect(opened.db, repoName, {
          memberIds: args.memberIds as string[],
          ...(args.label !== undefined ? { label: args.label as string } : {}),
        });
        break;
      case 'update_group':
        writeDirect.updateGroupDirect(
          opened.db,
          repoName,
          args.id as string,
          args as Parameters<typeof writeDirect.updateGroupDirect>[3],
        );
        result = { id: args.id };
        break;
      case 'remove_group':
        writeDirect.removeGroupDirect(opened.db, repoName, args.id as string);
        result = { id: args.id };
        break;
      case 'add_relationship':
        result = writeDirect.addRelationshipDirect(opened.db, repoName, {
          fromId: args.fromId as string,
          toId: args.toId as string,
          ...(args.label !== undefined ? { label: args.label as string } : {}),
          ...(args.technology !== undefined ? { technology: args.technology as string } : {}),
        });
        break;
      case 'remove_relationship':
        writeDirect.removeRelationshipDirect(opened.db, repoName, args.id as string);
        result = { id: args.id };
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
    case 'list_relationships':
      return httpClient.listRelationships(serverUrl, repoName);
    case 'list_groups':
      return httpClient.listGroups(serverUrl, repoName);
    case 'list_communities':
      return httpClient.listCommunities(serverUrl, repoName);
    case 'add_element':
      return httpClient.addElement(
        serverUrl,
        repoName,
        args as Parameters<typeof httpClient.addElement>[2],
      );
    case 'update_element': {
      const { id, ...changes } = args as { id: string } & Parameters<typeof httpClient.updateElement>[3];
      return httpClient.updateElement(serverUrl, repoName, id, changes);
    }
    case 'remove_element': {
      await httpClient.removeElement(serverUrl, repoName, (args as { id: string }).id);
      return { id: (args as { id: string }).id };
    }
    case 'add_group':
      return httpClient.addGroup(
        serverUrl,
        repoName,
        args as Parameters<typeof httpClient.addGroup>[2],
      );
    case 'update_group': {
      const { id, ...body } = args as { id: string } & Parameters<typeof httpClient.updateGroup>[3];
      await httpClient.updateGroup(serverUrl, repoName, id, body);
      return { id };
    }
    case 'remove_group': {
      await httpClient.removeGroup(serverUrl, repoName, (args as { id: string }).id);
      return { id: (args as { id: string }).id };
    }
    case 'add_relationship':
      return httpClient.addRelationship(
        serverUrl,
        repoName,
        args as Parameters<typeof httpClient.addRelationship>[2],
      );
    case 'remove_relationship': {
      await httpClient.removeRelationship(serverUrl, repoName, (args as { id: string }).id);
      return { id: (args as { id: string }).id };
    }
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
        args as Parameters<typeof httpClient.analyzeCurrentCode>[1],
      );
    case 'analyze_release_code':
      return httpClient.analyzeReleaseCode(serverUrl);
    case 'analyze_all':
      return httpClient.analyzeAll(serverUrl);
    case 'get_analyze_status':
      return httpClient.getAnalyzeStatus(serverUrl);
    default:
      throw new Error(`Unhandled HTTP tool: ${toolName}`);
  }
}
