import * as fs from 'node:fs';
import * as path from 'node:path';
import { mergeThresholds, DEFAULT_THRESHOLDS } from '@anytime-markdown/trail-core/domain/metrics';
import type { ThresholdsConfig } from '@anytime-markdown/trail-core/domain/metrics';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _log = { info: (m: string) => console.info(m), warn: (m: string) => console.warn(m), error: (m: string, e?: unknown) => console.error(m, e) };

// Minimal YAML parser for two-level key: scalar format.
// Supports:
//   metricId:
//     level: 1.0
// Does NOT support: arrays, quoted strings, anchors, multi-line.
function parseSimpleYaml(content: string): Record<string, Record<string, number>> {
  const result: Record<string, Record<string, number>> = {};
  let currentKey: string | null = null;

  for (const raw of content.split('\n')) {
    const line = raw.replace(/#.*$/, ''); // strip comments
    if (!line.trim()) continue;

    const topMatch = /^([a-zA-Z_]\w*):\s*$/.exec(line);
    if (topMatch) {
      currentKey = topMatch[1];
      result[currentKey] = {};
      continue;
    }

    const leafMatch = /^\s{2,}([a-zA-Z_]\w*):\s*([\d.eE+\-/]+)\s*$/.exec(line);
    if (leafMatch && currentKey) {
      const val = Number(leafMatch[2]);
      if (!Number.isNaN(val)) {
        result[currentKey][leafMatch[1]] = val;
      }
    }
  }
  return result;
}

function toThresholdsConfig(raw: Record<string, Record<string, number>>): Partial<ThresholdsConfig> {
  const partial: Partial<ThresholdsConfig> = {};

  const keys = ['deploymentFrequency', 'leadTimePerLoc', 'tokensPerLoc', 'changeFailureRate', 'aiFirstTrySuccessRate'] as const;
  for (const k of keys) {
    const src = raw[k];
    if (!src) continue;
    const elite = src['elite'];
    const high = src['high'];
    const medium = src['medium'];
    if (elite !== undefined && high !== undefined && medium !== undefined) {
      partial[k] = { elite, high, medium };
    }
  }
  return partial;
}

export class MetricsThresholdsLoader {
  private readonly filePath: string;

  constructor(workspaceRoot: string) {
    this.filePath = path.join(workspaceRoot, '.anytime', 'metrics-thresholds.yaml');
  }

  load(): ThresholdsConfig {
    if (!fs.existsSync(this.filePath)) {
      return DEFAULT_THRESHOLDS;
    }

    try {
      const content = fs.readFileSync(this.filePath, 'utf-8');
      const raw = parseSimpleYaml(content);
      const partial = toThresholdsConfig(raw);
      const merged = mergeThresholds(partial, DEFAULT_THRESHOLDS);
      _log.info(`MetricsThresholdsLoader: loaded from ${this.filePath}`);
      return merged;
    } catch (err) {
      _log.warn(
        `MetricsThresholdsLoader: failed to parse ${this.filePath}, using defaults. ${err instanceof Error ? err.message : String(err)}`,
      );
      return DEFAULT_THRESHOLDS;
    }
  }
}
