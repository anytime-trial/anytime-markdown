import fs from 'node:fs/promises';
import { parseCoocFile, readLink } from '@anytime-markdown/graph-core/src/presets/cooccurrenceFile';
import { resolveSecurePath, validateCooccurrenceExtension } from '../utils/securePath';
import { directionNameOf, type CooccurrenceDirectionName } from './cooccurrenceDirection';
import {
  readCooccurrenceNote,
  type CooccurrenceNoteTarget,
} from '@anytime-markdown/graph-core/src/presets/cooccurrenceNotes';
import type { CooccurrenceSlice } from '@anytime-markdown/graph-core/src/presets/cooccurrenceTimeline';
import { sliceValuesField, type CooccurrenceSliceValueInput } from './writeCooccurrence';

export interface ReadCooccurrenceInput {
  path: string;
}

export interface ReadCooccurrenceResult {
  title?: string;
  subject?: string;
  /** 時間軸のスライス。時間軸を持たない図では書かない。 */
  slices?: CooccurrenceSlice[];
  terms: Array<{ label: string; frequency: number; note?: string; sliceValues?: CooccurrenceSliceValueInput }>;
  links: Array<{
    source: string;
    target: string;
    strength: number;
    direction: CooccurrenceDirectionName;
    note?: string;
    sliceValues?: CooccurrenceSliceValueInput;
  }>;
  clusters?: Array<{
    label: string;
    members: string[];
    /** クラスタの中の細分（要件書「サブクラスタ」§2.6）。細分が無ければ省く。 */
    subclusters?: Array<{ label: string; members: string[] }>;
    note?: string;
  }>;
}

export async function readCooccurrence(input: ReadCooccurrenceInput, rootDir: string): Promise<ReadCooccurrenceResult> {
  validateCooccurrenceExtension(input.path);
  const filePath = resolveSecurePath(rootDir, input.path);
  const file = parseCoocFile(await fs.readFile(filePath, 'utf-8'));
  const terms = file.spec.nodes.map((node, index) => ({
    label: node.label,
    frequency: node.frequency,
    ...noteField(file, 'nodes', index),
    ...sliceValuesField(file, 'nodes', index),
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
        ...sliceValuesField(file, 'links', index),
      };
    }),
  };
  if (file.spec.timeline !== undefined) {
    result.slices = file.spec.timeline.slices.map((slice) =>
      slice.at === undefined ? { label: slice.label } : { label: slice.label, at: slice.at },
    );
  }
  if (file.spec.title !== undefined) result.title = file.spec.title;
  if (file.spec.subject !== undefined) result.subject = file.spec.nodes[file.spec.subject].label;
  if (file.spec.clusters !== undefined) {
    result.clusters = file.spec.clusters.map((cluster, index) => ({
      label: cluster.label,
      members: cluster.members.map((member) => file.spec.nodes[member].label),
      ...(cluster.subclusters === undefined
        ? {}
        : {
            subclusters: cluster.subclusters.map((subcluster) => ({
              label: subcluster.label,
              members: subcluster.members.map((member) => file.spec.nodes[member].label),
            })),
          }),
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
