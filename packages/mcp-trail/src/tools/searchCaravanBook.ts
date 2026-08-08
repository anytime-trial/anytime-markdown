import { z } from 'zod';
import { workspacePathParam } from './workspaceParam';
import {
  searchCaravanBook,
  openCaravanBookDb,
} from '@anytime-markdown/trail-caravan-book/query';
import type { SearchResult } from '@anytime-markdown/trail-caravan-book/query';
import { createOllamaClient } from '@anytime-markdown/agent-core';
import { resolveCaravanDbPath } from '../dbPath';

export const SearchCaravanBookInputSchema = z.object({
  workspacePath: workspacePathParam,
  query: z.string().describe('Search query'),
  entity_types: z.array(z.string()).optional().describe('Filter by entity types'),
  source_type: z.string().optional().describe('Filter by source type'),
  since: z.string().optional().describe('ISO 8601 date filter'),
  limit: z.number().optional().describe('Max results (default 20)'),
  hops: z.number().optional().describe('Graph traversal hops (0 or 1)'),
});

export type SearchCaravanBookInput = z.infer<typeof SearchCaravanBookInputSchema>;

export async function handleSearchCaravanBook(input: SearchCaravanBookInput): Promise<SearchResult> {
  const ollamaBaseUrl = process.env['OLLAMA_BASE_URL'];

  const memHandle = await openCaravanBookDb(resolveCaravanDbPath({ workspacePath: input.workspacePath }));

  try {
    const ollama = createOllamaClient(ollamaBaseUrl ? { baseUrl: ollamaBaseUrl } : {});
    return await searchCaravanBook({
      db: memHandle.db,
      ollama,
      input,
    });
  } finally {
    memHandle.close();
  }
}
