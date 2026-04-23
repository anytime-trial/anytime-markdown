import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  resolveOptions,
  getC4Model,
  addElement,
  updateElement,
  removeElement,
  listRelationships,
  addRelationship,
  removeRelationship,
  listGroups,
  addGroup,
  updateGroup,
  removeGroup,
} from './client.js';

export interface McpTrailOptions {
  serverUrl?: string;
  repoName?: string;
}

const elementTypeEnum = z.enum(['person', 'system', 'container', 'component']);

const commonParams = {
  repoName: z.string().optional().describe('Repository name (default: basename of cwd)'),
  serverUrl: z.string().optional().describe('TrailDataServer URL (default: http://localhost:19841)'),
};

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
      const opts = resolveOptions({ serverUrl, repoName: repoName ?? options.repoName, ...options });
      const model = await getC4Model(opts.serverUrl, opts.repoName);
      return { content: [{ type: 'text' as const, text: JSON.stringify(model, null, 2) }] };
    },
  );

  server.tool(
    'list_elements',
    'List all C4 elements with their IDs, types, and names. Useful for finding element IDs before adding relationships.',
    { ...commonParams },
    async ({ repoName, serverUrl }) => {
      const opts = resolveOptions({ serverUrl, repoName: repoName ?? options.repoName, ...options });
      const payload = await getC4Model(opts.serverUrl, opts.repoName) as { model?: { elements?: unknown[] } };
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
      const opts = resolveOptions({ serverUrl, repoName: repoName ?? options.repoName, ...options });
      const result = await addElement(opts.serverUrl, opts.repoName, {
        type,
        name,
        external,
        parentId: parentId ?? null,
        ...(description ? { description } : {}),
        ...(serviceType ? { serviceType } : {}),
      });
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
      const opts = resolveOptions({ serverUrl, repoName: repoName ?? options.repoName, ...options });
      const changes: Record<string, unknown> = {};
      if (name !== undefined) changes.name = name;
      if (description !== undefined) changes.description = description;
      if (external !== undefined) changes.external = external;
      if (serviceType !== undefined) changes.serviceType = serviceType;
      const result = await updateElement(opts.serverUrl, opts.repoName, id, changes);
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
      const opts = resolveOptions({ serverUrl, repoName: repoName ?? options.repoName, ...options });
      await removeElement(opts.serverUrl, opts.repoName, id);
      return { content: [{ type: 'text' as const, text: `Removed element ${id}` }] };
    },
  );

  server.tool(
    'list_relationships',
    'List all manual C4 relationships with their IDs. Useful for finding relationship IDs before removing them.',
    { ...commonParams },
    async ({ repoName, serverUrl }) => {
      const opts = resolveOptions({ serverUrl, repoName: repoName ?? options.repoName, ...options });
      const relationships = await listRelationships(opts.serverUrl, opts.repoName);
      return { content: [{ type: 'text' as const, text: JSON.stringify(relationships, null, 2) }] };
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
      const opts = resolveOptions({ serverUrl, repoName: repoName ?? options.repoName, ...options });
      const result = await addRelationship(opts.serverUrl, opts.repoName, {
        fromId,
        toId,
        ...(label ? { label } : {}),
        ...(technology ? { technology } : {}),
      });
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
      const opts = resolveOptions({ serverUrl, repoName: repoName ?? options.repoName, ...options });
      await removeRelationship(opts.serverUrl, opts.repoName, id);
      return { content: [{ type: 'text' as const, text: `Removed relationship ${id}` }] };
    },
  );

  server.tool(
    'list_groups',
    'List all manual C4 groups with their IDs and member element IDs.',
    { ...commonParams },
    async ({ repoName, serverUrl }) => {
      const opts = resolveOptions({ serverUrl, repoName: repoName ?? options.repoName, ...options });
      const groups = await listGroups(opts.serverUrl, opts.repoName);
      return { content: [{ type: 'text' as const, text: JSON.stringify(groups, null, 2) }] };
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
      const opts = resolveOptions({ serverUrl, repoName: repoName ?? options.repoName, ...options });
      const result = await addGroup(opts.serverUrl, opts.repoName, {
        memberIds,
        ...(label ? { label } : {}),
      });
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
      const opts = resolveOptions({ serverUrl, repoName: repoName ?? options.repoName, ...options });
      await updateGroup(opts.serverUrl, opts.repoName, id, {
        ...(memberIds !== undefined ? { memberIds } : {}),
        ...(label !== undefined ? { label } : {}),
      });
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
      const opts = resolveOptions({ serverUrl, repoName: repoName ?? options.repoName, ...options });
      await removeGroup(opts.serverUrl, opts.repoName, id);
      return { content: [{ type: 'text' as const, text: `Removed group ${id}` }] };
    },
  );

  return server;
}
