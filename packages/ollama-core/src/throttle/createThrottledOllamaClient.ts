import type { OllamaClient } from '../client';
import type { OllamaThrottleGovernor } from './OllamaThrottleGovernor';

/**
 * 背景パイプライン用に OllamaClient を governor で包む。
 * generate / embeddings の双方を governor.run() に通し、直列化・COOLING 待機・
 * レイテンシ計測を適用する。対話系 (chatBridge / searchMemory) には使わない。
 */
export function createThrottledOllamaClient(
  inner: OllamaClient,
  governor: OllamaThrottleGovernor,
): OllamaClient {
  return {
    generate: (o) => governor.run('generate', o.model, () => inner.generate(o)),
    embeddings: (o) => governor.run('embeddings', o.model, () => inner.embeddings(o)),
  };
}
