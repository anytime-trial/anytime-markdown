import fs from 'node:fs/promises';
import { parseCoocFile, readLink } from '@anytime-markdown/graph-core/src/presets/cooccurrenceFile';
import { resolveSecurePath, validateCooccurrenceExtension } from '../utils/securePath';
import { directionNameOf, type CooccurrenceDirectionName } from './cooccurrenceDirection';

export interface ReadCooccurrenceInput {
  path: string;
}

export interface ReadCooccurrenceResult {
  title?: string;
  subject?: string;
  terms: Array<{ label: string; frequency: number }>;
  links: Array<{ source: string; target: string; strength: number; direction: CooccurrenceDirectionName }>;
  clusters?: Array<{ label: string; members: string[] }>;
}

export async function readCooccurrence(input: ReadCooccurrenceInput, rootDir: string): Promise<ReadCooccurrenceResult> {
  validateCooccurrenceExtension(input.path);
  const filePath = resolveSecurePath(rootDir, input.path);
  const file = parseCoocFile(await fs.readFile(filePath, 'utf-8'));
  const terms = file.spec.nodes.map((node) => ({ label: node.label, frequency: node.frequency }));
  const result: ReadCooccurrenceResult = {
    terms,
    links: file.spec.links.map((link) => {
      const view = readLink(link);
      return {
        source: file.spec.nodes[view.source].label,
        target: file.spec.nodes[view.target].label,
        strength: view.strength,
        direction: directionNameOf(view.direction),
      };
    }),
  };
  if (file.spec.title !== undefined) result.title = file.spec.title;
  if (file.spec.subject !== undefined) result.subject = file.spec.nodes[file.spec.subject].label;
  if (file.spec.clusters !== undefined) {
    result.clusters = file.spec.clusters.map((cluster) => ({
      label: cluster.label,
      members: cluster.members.map((member) => file.spec.nodes[member].label),
    }));
  }
  return result;
}
