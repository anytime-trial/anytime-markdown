import { BARNES_HUT_LAYOUT_ALGORITHM_VERSION } from '@anytime-markdown/graph-core';
import { computeLayoutSync } from '../layout/runLayout';

type LayoutWorkerRequest = {
  type: 'layout';
  file: Parameters<typeof computeLayoutSync>[0];
  specHash: string;
  algorithmVersion: string;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

self.onmessage = (event: MessageEvent<unknown>) => {
  try {
    const data = event.data as Partial<LayoutWorkerRequest>;
    if (data.type !== 'layout') {
      throw new Error('layout worker received an unknown message type');
    }
    if (data.algorithmVersion !== BARNES_HUT_LAYOUT_ALGORITHM_VERSION) {
      throw new Error('layout worker received an unsupported algorithm version');
    }
    if (!data.file || typeof data.specHash !== 'string') {
      throw new Error('layout worker received an invalid layout request');
    }
    const result = computeLayoutSync(data.file, data.specHash);
    self.postMessage({ type: 'done', positions: result.positions });
  } catch (error) {
    self.postMessage({ type: 'error', message: errorMessage(error) });
  }
};
