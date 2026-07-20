import {
  BARNES_HUT_LAYOUT_ALGORITHM_VERSION,
  barnesHutLayout,
  type CooccurrenceFile,
} from '@anytime-markdown/graph-core';
import { radiusForFrequency, normalize } from '../render/scales';

export interface LayoutResult {
  positions: Array<[number, number]>;
  specHash: string;
  algorithmVersion: string;
}

export interface LayoutJob {
  worker: Worker | null;
  promise: Promise<LayoutResult>;
  abort(): void;
}

type WorkerMessage =
  | { type: 'done'; positions: Array<[number, number]> }
  | { type: 'error'; message: string };

function isWorkerMessage(value: unknown): value is WorkerMessage {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  if (record.type === 'error') return typeof record.message === 'string';
  return record.type === 'done' && Array.isArray(record.positions);
}

function groupsFor(file: CooccurrenceFile): number[] {
  const groups = new Array<number>(file.spec.nodes.length).fill(-1);
  file.spec.clusters?.forEach((cluster, clusterIndex) => {
    cluster.members.forEach((member) => {
      if (member >= 0 && member < groups.length) groups[member] = clusterIndex;
    });
  });
  return groups;
}

export function computeLayoutSync(file: CooccurrenceFile, specHash: string): LayoutResult {
  const frequencies = file.spec.nodes.map((node) => node.frequency);
  const freqMin = frequencies.length > 0 ? Math.min(...frequencies) : 0;
  const freqMax = frequencies.length > 0 ? Math.max(...frequencies) : 0;
  const strengths = file.spec.links.map((link) => link[2]);
  const strengthMin = strengths.length > 0 ? Math.min(...strengths) : 0;
  const strengthMax = strengths.length > 0 ? Math.max(...strengths) : 0;
  const radii = file.spec.nodes.map((node) => radiusForFrequency(node.frequency, freqMin, freqMax));
  const links = file.spec.links.map((link) => ({
    source: link[0],
    target: link[1],
    weight: 0.3 + 0.7 * normalize(link[2], strengthMin, strengthMax),
  }));
  const positions = barnesHutLayout(file.spec.nodes.length, links, { groups: groupsFor(file), radii })
    .map((point): [number, number] => [Math.round(point.x * 10) / 10, Math.round(point.y * 10) / 10]);
  return { positions, specHash, algorithmVersion: BARNES_HUT_LAYOUT_ALGORITHM_VERSION };
}

export function startLayoutJob(file: CooccurrenceFile, specHash: string, createWorker?: () => Worker): LayoutJob {
  if (!createWorker) {
    return {
      worker: null,
      promise: Promise.resolve().then(() => computeLayoutSync(file, specHash)),
      abort: () => undefined,
    };
  }

  const worker = createWorker();
  let settled = false;
  const promise = new Promise<LayoutResult>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<unknown>) => {
      if (settled) return;
      if (!isWorkerMessage(event.data)) {
        settled = true;
        reject(new Error('layout worker returned an unknown message'));
        return;
      }
      if (event.data.type === 'error') {
        settled = true;
        reject(new Error(event.data.message));
        return;
      }
      settled = true;
      resolve({
        positions: event.data.positions,
        specHash,
        algorithmVersion: BARNES_HUT_LAYOUT_ALGORITHM_VERSION,
      });
    };
    worker.onerror = (event) => {
      if (settled) return;
      settled = true;
      reject(new Error(event.message));
    };
  });
  worker.postMessage({ type: 'layout', file, specHash, algorithmVersion: BARNES_HUT_LAYOUT_ALGORITHM_VERSION });
  return {
    worker,
    promise,
    abort: () => {
      settled = true;
      worker.terminate();
    },
  };
}
