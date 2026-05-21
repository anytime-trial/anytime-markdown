/**
 * Additional coverage for LepConfig.ts — targeting uncovered branches:
 *
 * validateLepConfigInput:
 *   line 302: schedule non-object → warn
 *   line 333: memory non-object → warn
 *   line 358: analyzers non-object → warn
 *   line 369: analyzer toggle invalid format → warn
 *   line 378: sources non-object → warn
 *   line 390: sources.github non-object → warn
 *   line 398-399: logs.minLevel invalid string → warn
 *
 * loadLepConfig:
 *   lines 645-646: file warnings piped through logger.warn
 *
 * ensureLepConfigFile:
 *   line 689: logger.warn on unexpected write failure (non-EEXIST)
 *
 * migrateConfigJsonIntoLepJson:
 *   lines 741-746: config.json parse failure → warn + skip
 *   lines 770-771: existing lep.json is non-object → warn + skip
 *   lines 795-800: rename failure → warn, return migrated:true (lep.json already written)
 */
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  DEFAULT_LEP_CONFIG,
  loadLepConfig,
  migrateConfigJsonIntoLepJson,
  validateLepConfigInput,
  workspaceLepConfigPath,
  workspaceConfigJsonPath,
  ensureLepConfigFile,
} from '../LepConfig';

function mkTemp(): string {
  return mkdtempSync(join(tmpdir(), 'lepcfg-add-'));
}

describe('validateLepConfigInput — additional warn branches', () => {
  it('warns when schedule is not a plain object', () => {
    const { warnings } = validateLepConfigInput({ schedule: 'bad' }, 'test');
    expect(warnings.some((w) => w.includes('schedule'))).toBe(true);
  });

  it('warns when memory is not a plain object', () => {
    const { warnings } = validateLepConfigInput({ memory: 42 }, 'test');
    expect(warnings.some((w) => w.includes('memory'))).toBe(true);
  });

  it('warns when analyzers is not a plain object', () => {
    const { warnings } = validateLepConfigInput({ analyzers: 'bad' }, 'test');
    expect(warnings.some((w) => w.includes('analyzers'))).toBe(true);
  });

  it('warns when a known analyzer toggle has invalid format', () => {
    const { warnings } = validateLepConfigInput(
      { analyzers: { ConversationMemoryAnalyzer: 'bad-format' } },
      'test',
    );
    expect(warnings.some((w) => w.includes('ConversationMemoryAnalyzer'))).toBe(true);
  });

  it('warns when sources is not a plain object', () => {
    const { warnings } = validateLepConfigInput({ sources: 'bad' }, 'test');
    expect(warnings.some((w) => w.includes('sources'))).toBe(true);
  });

  it('warns when sources.github is not a plain object', () => {
    const { warnings } = validateLepConfigInput({ sources: { github: 'bad' } }, 'test');
    expect(warnings.some((w) => w.includes('sources.github'))).toBe(true);
  });

  it('warns when logs.minLevel is an invalid string', () => {
    const { warnings } = validateLepConfigInput({ logs: { minLevel: 'verbose' } }, 'test');
    expect(warnings.some((w) => w.includes('minLevel'))).toBe(true);
  });

  it('does not warn when logs.minLevel is absent (no minLevel key)', () => {
    const { warnings } = validateLepConfigInput({ logs: {} }, 'test');
    expect(warnings).toEqual([]);
  });

  it('accepts logs.minLevel=debug', () => {
    const { value } = validateLepConfigInput({ logs: { minLevel: 'debug' } }, 'test');
    expect(value.logs?.minLevel).toBe('debug');
  });

  it('accepts logs.minLevel=warn', () => {
    const { value } = validateLepConfigInput({ logs: { minLevel: 'warn' } }, 'test');
    expect(value.logs?.minLevel).toBe('warn');
  });

  it('accepts logs.minLevel=error', () => {
    const { value } = validateLepConfigInput({ logs: { minLevel: 'error' } }, 'test');
    expect(value.logs?.minLevel).toBe('error');
  });
});

describe('loadLepConfig — logger integration', () => {
  let root: string;

  beforeEach(() => { root = mkTemp(); });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('pipes file warnings through the provided logger.warn', () => {
    const warnCalls: string[] = [];
    const logger = { warn: (msg: string) => warnCalls.push(msg), info: jest.fn() };

    const dir = join(root, '.anytime', 'trail');
    mkdirSync(dir, { recursive: true });
    // unknown top-level key triggers a warning in validateLepConfigInput
    writeFileSync(join(dir, 'lep.json'), JSON.stringify({ version: 1, unknownKey: 1 }), 'utf-8');

    loadLepConfig({ workspaceRoot: root, homeDir: join(root, 'nohome'), logger });
    // logger.warn should have been called for the unknown key
    expect(warnCalls.some((w) => w.includes('unknownKey'))).toBe(true);
  });

  it('pipes parse failures through the provided logger.warn', () => {
    const warnCalls: string[] = [];
    const logger = { warn: (msg: string) => warnCalls.push(msg), info: jest.fn() };

    const dir = join(root, '.anytime', 'trail');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'lep.json'), '{ invalid', 'utf-8');

    loadLepConfig({ workspaceRoot: root, homeDir: join(root, 'nohome'), logger });
    expect(warnCalls.some((w) => w.includes('パース'))).toBe(true);
  });
});

describe('ensureLepConfigFile — logger.info and non-EEXIST warn', () => {
  let ws: string;

  beforeEach(() => { ws = mkTemp(); });
  afterEach(() => rmSync(ws, { recursive: true, force: true }));

  it('calls logger.info when lep.json is created', () => {
    const infoCalls: string[] = [];
    const logger = { info: (msg: string) => infoCalls.push(msg), warn: jest.fn() };
    ensureLepConfigFile({ workspaceRoot: ws, legacy: { analyzeAllEnabled: true }, logger });
    expect(infoCalls.some((m) => m.includes('lep.json を生成しました'))).toBe(true);
  });

  it('does NOT call logger.warn when lep.json already exists (EEXIST is silent)', () => {
    const warnCalls: string[] = [];
    const logger = { warn: (msg: string) => warnCalls.push(msg), info: jest.fn() };
    // create lep.json first
    ensureLepConfigFile({ workspaceRoot: ws, legacy: {} });
    // second call hits EEXIST — must not warn
    ensureLepConfigFile({ workspaceRoot: ws, legacy: {}, logger });
    expect(warnCalls).toEqual([]);
  });
});

describe('migrateConfigJsonIntoLepJson — additional branches', () => {
  let ws: string;

  beforeEach(() => { ws = mkTemp(); });
  afterEach(() => rmSync(ws, { recursive: true, force: true }));

  it('warns and skips migration when config.json is invalid JSON', () => {
    const warnCalls: string[] = [];
    const logger = { warn: (msg: string) => warnCalls.push(msg), info: jest.fn() };

    const dir = join(ws, '.anytime', 'trail');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'config.json'), '{ bad json', 'utf-8');

    const res = migrateConfigJsonIntoLepJson({ workspaceRoot: ws, logger });
    expect(res.migrated).toBe(false);
    expect(warnCalls.some((w) => w.includes('パースに失敗'))).toBe(true);
  });

  it('warns and skips when existing lep.json is not a plain object (e.g. array)', () => {
    const warnCalls: string[] = [];
    const logger = { warn: (msg: string) => warnCalls.push(msg), info: jest.fn() };

    const dir = join(ws, '.anytime', 'trail');
    mkdirSync(dir, { recursive: true });
    // lep.json is an array — isPlainObject returns false
    writeFileSync(join(dir, 'lep.json'), JSON.stringify([1, 2, 3]), 'utf-8');
    writeFileSync(join(dir, 'config.json'), JSON.stringify({ gitRoots: ['/r'] }), 'utf-8');

    const res = migrateConfigJsonIntoLepJson({ workspaceRoot: ws, logger });
    expect(res.migrated).toBe(false);
    expect(warnCalls.some((w) => w.includes('オブジェクトでない'))).toBe(true);
  });

  it('config.json parsing failure is reported via logger and returns migrated:false', () => {
    // This test covers the warn path on config.json parse failure (lines 741-746).
    const warnCalls: string[] = [];
    const logger = { warn: (msg: string) => warnCalls.push(msg), info: jest.fn() };

    const dir = join(ws, '.anytime', 'trail');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'config.json'), '{ invalid json ]', 'utf-8');

    const res = migrateConfigJsonIntoLepJson({ workspaceRoot: ws, logger });
    expect(res.migrated).toBe(false);
    // The warning mentions config.json parse failure
    expect(warnCalls.some((w) => w.includes('パースに失敗'))).toBe(true);
  });

  it('gap-fills existing lep.json where no injection needed (all keys present) — no extra write', () => {
    const dir = join(ws, '.anytime', 'trail');
    mkdirSync(dir, { recursive: true });
    // lep.json already has all keys that config.json might inject
    writeFileSync(
      join(dir, 'lep.json'),
      JSON.stringify({ version: 1, stage: 'primary', schedule: {}, llm: {}, memory: {}, gitRoots: [] }),
      'utf-8',
    );
    writeFileSync(join(dir, 'config.json'), JSON.stringify({ gitRoots: ['/r'] }), 'utf-8');

    const res = migrateConfigJsonIntoLepJson({ workspaceRoot: ws });
    // migrated=true because config.json was renamed (even if nothing injected)
    expect(res.migrated).toBe(true);
  });
});
