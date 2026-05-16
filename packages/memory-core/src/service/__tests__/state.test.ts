import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { readState, writeState, defaultState, STATE_SCHEMA_VERSION } from '../state';
import type { MemoryCoreServiceStatus } from '../types';

describe('memory-core service state', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'memcore-state-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  describe('defaultState', () => {
    it('returns paused=false with schemaVersion 1 and zero counters', () => {
      const s = defaultState();
      expect(s.schemaVersion).toBe(STATE_SCHEMA_VERSION);
      expect(s.paused).toBe(false);
      expect(s.pausedAt).toBeNull();
      expect(s.pausedBy).toBeNull();
      expect(s.lastRunAt).toBeNull();
      expect(s.lastDurationMs).toBeNull();
      expect(s.lastReason).toBeNull();
      expect(s.lastError).toBeNull();
      expect(s.ticksRun).toBe(0);
      expect(s.ticksSkipped).toBe(0);
      expect(s.running).toBe(false);
    });
  });

  describe('readState', () => {
    it('returns default state when file does not exist', () => {
      const path = join(dir, 'missing.json');
      const s = readState(path);
      expect(s).toEqual(defaultState());
    });

    it('returns default state and warns when JSON is invalid', () => {
      const path = join(dir, 'broken.json');
      writeFileSync(path, '{ not json', 'utf-8');
      const warnings: string[] = [];
      const s = readState(path, { onWarning: (m) => warnings.push(m) });
      expect(s).toEqual(defaultState());
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0]).toMatch(/parse/i);
    });

    it('returns default state and warns when schemaVersion mismatches', () => {
      const path = join(dir, 'old.json');
      writeFileSync(
        path,
        JSON.stringify({ ...defaultState(), schemaVersion: 999 }),
        'utf-8',
      );
      const warnings: string[] = [];
      const s = readState(path, { onWarning: (m) => warnings.push(m) });
      expect(s).toEqual(defaultState());
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0]).toMatch(/schemaVersion/i);
    });

    it('returns persisted state and forces running=false on load', () => {
      const path = join(dir, 'state.json');
      const stored: MemoryCoreServiceStatus = {
        schemaVersion: STATE_SCHEMA_VERSION,
        paused: true,
        pausedAt: '2026-05-13T10:00:00.000Z',
        pausedBy: 'cli',
        lastRunAt: '2026-05-13T09:30:00.000Z',
        lastDurationMs: 1234,
        lastReason: 'periodic',
        lastError: null,
        ticksRun: 5,
        ticksSkipped: 2,
        running: true, // stale flag should be reset on load
      };
      writeFileSync(path, JSON.stringify(stored), 'utf-8');
      const s = readState(path);
      expect(s.paused).toBe(true);
      expect(s.pausedBy).toBe('cli');
      expect(s.ticksRun).toBe(5);
      expect(s.running).toBe(false);
    });

    it('returns default state and warns when content is not an object', () => {
      const path = join(dir, 'array.json');
      writeFileSync(path, '[1, 2, 3]', 'utf-8');
      const warnings: string[] = [];
      const s = readState(path, { onWarning: (m) => warnings.push(m) });
      expect(s).toEqual(defaultState());
      expect(warnings.length).toBeGreaterThan(0);
    });
  });

  describe('writeState', () => {
    it('writes JSON via atomic rename (no .tmp file remains)', () => {
      const path = join(dir, 'out.json');
      const state: MemoryCoreServiceStatus = {
        ...defaultState(),
        paused: true,
        pausedBy: 'http-api',
        pausedAt: '2026-05-13T11:00:00.000Z',
        ticksRun: 1,
      };
      writeState(path, state);
      expect(existsSync(path)).toBe(true);
      const round = JSON.parse(readFileSync(path, 'utf-8'));
      expect(round.paused).toBe(true);
      expect(round.pausedBy).toBe('http-api');
      expect(round.schemaVersion).toBe(STATE_SCHEMA_VERSION);

      const tmps = require('node:fs')
        .readdirSync(dir)
        .filter((f: string) => f.includes('.tmp.'));
      expect(tmps).toHaveLength(0);
    });

    it('creates parent directory if missing', () => {
      const path = join(dir, 'nested', 'deeper', 'state.json');
      writeState(path, defaultState());
      expect(existsSync(path)).toBe(true);
    });

    it('overwrites existing file (last writer wins)', () => {
      const path = join(dir, 'out.json');
      writeState(path, { ...defaultState(), ticksRun: 1 });
      writeState(path, { ...defaultState(), ticksRun: 2 });
      const round = JSON.parse(readFileSync(path, 'utf-8'));
      expect(round.ticksRun).toBe(2);
    });
  });
});
