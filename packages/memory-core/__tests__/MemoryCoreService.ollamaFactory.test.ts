import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MemoryCoreService } from '../src/service/MemoryCoreService';
import type { OllamaClient } from '@anytime-markdown/agent-core';

describe('MemoryCoreService — ollamaFactory plumbing', () => {
  it('forwards ollamaFactory into the pipeline context', () => {
    const sentinel = (): OllamaClient => ({
      generate: async () => ({ response: '' }),
      embeddings: async () => ({ embedding: new Float32Array(1024) }),
    });
    const svc = new MemoryCoreService({
      logSink: { appendLine: () => {} },
      trailDbPath: join(tmpdir(), 'throttle-plumbing-trail.db'),
      statePath: join(tmpdir(), 'throttle-plumbing-state.json'),
      ollamaFactory: sentinel,
    });
    const ctx = svc.buildPipelineContext();
    expect(ctx.ollamaFactory).toBe(sentinel);
  });
});
