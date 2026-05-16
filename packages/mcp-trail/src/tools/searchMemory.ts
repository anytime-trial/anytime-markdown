import { z } from 'zod';
import {
  searchMemory,
  openMemoryCoreDb,
} from '@anytime-markdown/memory-core';
import type { SearchResult } from '@anytime-markdown/memory-core';
import { createOllamaClient } from '@anytime-markdown/ollama-core';

export const SearchMemoryInputSchema = z.object({
  query: z.string().describe('Search query'),
  entity_types: z.array(z.string()).optional().describe('Filter by entity types'),
  source_type: z.string().optional().describe('Filter by source type'),
  since: z.string().optional().describe('ISO 8601 date filter'),
  limit: z.number().optional().describe('Max results (default 20)'),
  hops: z.number().optional().describe('Graph traversal hops (0 or 1)'),
});

export type SearchMemoryInput = z.infer<typeof SearchMemoryInputSchema>;

export async function handleSearchMemory(input: SearchMemoryInput): Promise<SearchResult> {
  const ollamaBaseUrl = process.env['OLLAMA_BASE_URL'];

  const memHandle = await openMemoryCoreDb();

  try {
    const ollama = createOllamaClient(ollamaBaseUrl ? { baseUrl: ollamaBaseUrl } : {});
    return await searchMemory({
      db: memHandle.db,
      ollama,
      input,
    });
  } finally {
    memHandle.close();
  }
}
