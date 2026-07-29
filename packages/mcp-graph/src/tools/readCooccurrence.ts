import fs from 'node:fs/promises';
import { parseCoocFile, readLink } from '@anytime-markdown/graph-core/src/presets/cooccurrenceFile';
import { resolveSecurePath, validateCooccurrenceExtension } from '../utils/securePath';
import { directionNameOf, type CooccurrenceDirectionName } from './cooccurrenceDirection';
import {
  readCooccurrenceNote,
  type CooccurrenceNoteTarget,
} from '@anytime-markdown/graph-core/src/presets/cooccurrenceNotes';

export interface ReadCooccurrenceInput {
  path: string;
}

export interface ReadCooccurrenceResult {
  title?: string;
  subject?: string;
  terms: Array<{ label: string; frequency: number; note?: string }>;
  links: Array<{ source: string; target: string; strength: number; direction: CooccurrenceDirectionName; note?: string }>;
  clusters?: Array<{ label: string; members: string[]; note?: string }>;
}

export async function readCooccurrence(input: ReadCooccurrenceInput, rootDir: string): Promise<ReadCooccurrenceResult> {
  validateCooccurrenceExtension(input.path);
  const filePath = resolveSecurePath(rootDir, input.path);
  const file = parseCoocFile(await fs.readFile(filePath, 'utf-8'));
  const terms = file.spec.nodes.map((node, index) => ({
    label: node.label,
    frequency: node.frequency,
    ...noteField(file, 'nodes', index),
  }));
  const result: ReadCooccurrenceResult = {
    terms,
    links: file.spec.links.map((link, index) => {
      const view = readLink(link);
      return {
        source: file.spec.nodes[view.source].label,
        target: file.spec.nodes[view.target].label,
        strength: view.strength,
        direction: directionNameOf(view.direction),
        ...noteField(file, 'links', index),
      };
    }),
  };
  if (file.spec.title !== undefined) result.title = file.spec.title;
  if (file.spec.subject !== undefined) result.subject = file.spec.nodes[file.spec.subject].label;
  if (file.spec.clusters !== undefined) {
    result.clusters = file.spec.clusters.map((cluster, index) => ({
      label: cluster.label,
      members: cluster.members.map((member) => file.spec.nodes[member].label),
      ...noteField(file, 'clusters', index),
    }));
  }
  return result;
}

/** メモが無い対象では `note` を書かない（省略とメモなしを同じ形で返す）。 */
function noteField(
  file: { spec: { notes?: Parameters<typeof readCooccurrenceNote>[0]['notes'] } },
  target: CooccurrenceNoteTarget,
  index: number,
): { note?: string } {
  const note = readCooccurrenceNote(file.spec, target, index);
  return note === undefined ? {} : { note };
}
