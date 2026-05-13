import { existsSync, readFileSync } from 'node:fs';

export interface PeriodicImportConfig {
  intervalSec: number;
  runOnStart: boolean;
  startupDelaySec: number;
}

export interface SchedulerConfig {
  periodicImport: PeriodicImportConfig;
}

export interface TrailServerConfig {
  schemaVersion: number;
  gitRoots: string[];
  docsPath?: string;
  scheduler: SchedulerConfig;
}

const DEFAULT_CONFIG: TrailServerConfig = {
  schemaVersion: 1,
  gitRoots: [],
  scheduler: {
    periodicImport: { intervalSec: 60, runOnStart: true, startupDelaySec: 5 },
  },
};

export function loadConfig(path: string): TrailServerConfig {
  if (!existsSync(path)) return DEFAULT_CONFIG;
  try {
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw) as Partial<TrailServerConfig>;
    return mergeConfig(DEFAULT_CONFIG, parsed);
  } catch {
    return DEFAULT_CONFIG;
  }
}

function mergeConfig(defaults: TrailServerConfig, overrides: Partial<TrailServerConfig>): TrailServerConfig {
  return {
    schemaVersion: overrides.schemaVersion ?? defaults.schemaVersion,
    gitRoots: overrides.gitRoots ?? defaults.gitRoots,
    docsPath: overrides.docsPath ?? defaults.docsPath,
    scheduler: {
      periodicImport: {
        intervalSec: overrides.scheduler?.periodicImport?.intervalSec ?? defaults.scheduler.periodicImport.intervalSec,
        runOnStart: overrides.scheduler?.periodicImport?.runOnStart ?? defaults.scheduler.periodicImport.runOnStart,
        startupDelaySec: overrides.scheduler?.periodicImport?.startupDelaySec ?? defaults.scheduler.periodicImport.startupDelaySec,
      },
    },
  };
}
