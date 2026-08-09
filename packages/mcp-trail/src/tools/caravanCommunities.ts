import { z } from 'zod';
import { workspacePathParam } from './workspaceParam';
import {
  listCaravanCommunities,
  upsertCaravanCommunitySummaries,
  openCaravanBookDb,
} from '@anytime-markdown/trail-caravan-book/query';
import type {
  CaravanCommunity,
  UpsertCommunitySummariesResult,
} from '@anytime-markdown/trail-caravan-book/query';
import { resolveCaravanDbPath } from '../dbPath';

export const ListCaravanCommunitiesInputSchema = z.object({
  workspacePath: workspacePathParam,
  min_size: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Minimum community size (default 10 = first staged-assignment target)'),
  unsummarized_only: z
    .boolean()
    .optional()
    .describe('Only communities that do not have a name/summary yet'),
  sample_size: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .describe('Representative members per community, ordered by degree (default 8)'),
  limit: z.number().int().min(1).optional().describe('Max communities to return (default 50)'),
});

export type ListCaravanCommunitiesInput = z.infer<typeof ListCaravanCommunitiesInputSchema>;

export interface ListCaravanCommunitiesResult {
  graph_version: string | null;
  total: number;
  communities: CaravanCommunity[];
}

export async function handleListCaravanCommunities(
  input: ListCaravanCommunitiesInput,
): Promise<ListCaravanCommunitiesResult> {
  const memHandle = await openCaravanBookDb(
    resolveCaravanDbPath({ workspacePath: input.workspacePath }),
  );
  try {
    const communities = listCaravanCommunities(memHandle.db, {
      minSize: input.min_size,
      unsummarizedOnly: input.unsummarized_only,
      sampleSize: input.sample_size,
    });
    const limit = input.limit ?? 50;
    return {
      graph_version: communities[0]?.graph_version ?? null,
      total: communities.length,
      communities: communities.slice(0, limit),
    };
  } finally {
    memHandle.close();
  }
}

export const UpsertCaravanCommunitySummariesInputSchema = z.object({
  workspacePath: workspacePathParam,
  summaries: z
    .array(
      z.object({
        stable_key: z.string().min(1).describe('stable_key from list_caravan_communities'),
        name: z.string().min(1).describe('Short community name (a few words)'),
        summary: z.string().describe('1-3 sentence description of what connects the members'),
      }),
    )
    .min(1)
    .describe('Summaries to upsert (idempotent, keyed by stable_key)'),
});

export type UpsertCaravanCommunitySummariesInput = z.infer<
  typeof UpsertCaravanCommunitySummariesInputSchema
>;

export async function handleUpsertCaravanCommunitySummaries(
  input: UpsertCaravanCommunitySummariesInput,
): Promise<UpsertCommunitySummariesResult> {
  const memHandle = await openCaravanBookDb(
    resolveCaravanDbPath({ workspacePath: input.workspacePath }),
  );
  try {
    return upsertCaravanCommunitySummaries(memHandle.db, input.summaries);
  } finally {
    memHandle.close();
  }
}
