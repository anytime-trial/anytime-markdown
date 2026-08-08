import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DEFAULT_STATE_SCHEMA_VERSION, defaultState, readState, writeState } from '../state';
import type { RunnerStatus } from '../types';

describe('runner/state', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'runner-state-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true });
  });

  describe('defaultState', () => {
    it('returns initial state with schemaVersion 1', () => {
      const s = defaultState();
      expect(s.schemaVersion).toBe(DEFAULT_STATE_SCHEMA_VERSION);
      expect(s.paused).toBe(false);
      expect(s.pausedAt).toBeNull();
      expect(s.pausedBy).toBeNull();
      expect(s.lastRunAt).toBeNull();
      expect(s.lastReason).toBeNull();
      expect(s.lastError).toBeNull();
      expect(s.ticksRun).toBe(0);
      expect(s.ticksSkipped).toBe(0);
      expect(s.running).toBe(false);
    });

    it('accepts custom schemaVersion', () => {
      expect(defaultState(2).schemaVersion).toBe(2);
    });
  });

  describe('readState', () => {
    it('returns defaults when file missing', () => {
      const s = readState(join(dir, 'missing.json'));
      expect(s).toEqual(defaultState());
    });

    it('returns defaults on JSON parse error and emits warning', () => {
      const p = join(dir, 's.json');
      writeFileSync(p, '{ not json');
      const warnings: string[] = [];
      const s = readState(p, { onWarning: (m) => warnings.push(m) });
      expect(s).toEqual(defaultState());
      expect(warnings[0]).toContain('failed to parse');
    });

    it('returns defaults on schema mismatch and emits warning', () => {
      const p = join(dir, 's.json');
      writeFileSync(p, JSON.stringify({ schemaVersion: 999, paused: true }));
      const warnings: string[] = [];
      const s = readState(p, { onWarning: (m) => warnings.push(m) });
      expect(s.paused).toBe(false); // defaults
      expect(warnings[0]).toContain('schemaVersion mismatch');
    });

    it('returns defaults when payload is not an object', () => {
      const p = join(dir, 's.json');
      writeFileSync(p, JSON.stringify([1, 2, 3]));
      const warnings: string[] = [];
      const s = readState(p, { onWarning: (m) => warnings.push(m) });
      expect(s).toEqual(defaultState());
      expect(warnings[0]).toContain('not an object');
    });

    it('always resets running to false even if persisted as true', () => {
      const p = join(dir, 's.json');
      writeFileSync(p, JSON.stringify({ ...defaultState(), running: true }));
      const s = readState(p);
      expect(s.running).toBe(false);
    });

    it('honors expectedSchemaVersion option', () => {
      const p = join(dir, 's.json');
      writeFileSync(p, JSON.stringify({ ...defaultState(2), paused: true }));
      const s = readState(p, { expectedSchemaVersion: 2 });
      expect(s.schemaVersion).toBe(2);
      expect(s.paused).toBe(true);
    });
  });

  describe('writeState', () => {
    it('writes JSON state and creates parent directory', () => {
      const p = join(dir, 'nested', 'deep', 's.json');
      const state: RunnerStatus = { ...defaultState(), paused: true, pausedBy: 'cli' };
      writeState(p, state);
      expect(existsSync(p)).toBe(true);
      const round = JSON.parse(readFileSync(p, 'utf-8')) as RunnerStatus;
      expect(round.paused).toBe(true);
      expect(round.pausedBy).toBe('cli');
    });

    it('does not leave tmp file behind on success', () => {
      const p = join(dir, 's.json');
      writeState(p, defaultState());
      const files = require('node:fs').readdirSync(dir) as string[];
      expect(files).toEqual(['s.json']);
    });
  });
});
