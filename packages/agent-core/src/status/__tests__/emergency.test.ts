import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  clearEmergencyState,
  evaluateEmergencyGate,
  readEmergencyState,
  writeEmergencyState,
} from '../emergency';
import type { EmergencyState } from '../emergency';

const STATE: EmergencyState = {
  active: true,
  reason: 'runaway loop detected',
  triggeredBy: 'human',
  triggeredAt: '2026-07-16T10:00:00.000Z',
};

describe('emergency state ledger', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'emergency-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns null when the ledger file does not exist', () => {
    expect(readEmergencyState(dir)).toBeNull();
  });

  it('round-trips write and read', () => {
    writeEmergencyState(dir, STATE);
    const state = readEmergencyState(dir);
    expect(state).toEqual(STATE);
    expect(JSON.parse(readFileSync(join(dir, 'emergency.json'), 'utf8')).active).toBe(true);
  });

  it('returns null for a corrupted ledger (fail-open)', () => {
    writeFileSync(join(dir, 'emergency.json'), '{broken', 'utf8');
    expect(readEmergencyState(dir)).toBeNull();
  });

  it('returns null when required fields are missing (fail-open)', () => {
    writeFileSync(join(dir, 'emergency.json'), JSON.stringify({ reason: 'x' }), 'utf8');
    expect(readEmergencyState(dir)).toBeNull();
  });

  it('clearEmergencyState removes the ledger and tolerates absence', () => {
    writeEmergencyState(dir, STATE);
    clearEmergencyState(dir);
    expect(existsSync(join(dir, 'emergency.json'))).toBe(false);
    expect(() => clearEmergencyState(dir)).not.toThrow();
  });
});

describe('evaluateEmergencyGate', () => {
  it('passes when state is null (no ledger / fail-open)', () => {
    expect(evaluateEmergencyGate(null, '/ws/.git/anytime')).toEqual({ kind: 'pass' });
  });

  it('passes when kill switch is inactive', () => {
    expect(
      evaluateEmergencyGate({ ...STATE, active: false }, '/ws/.git/anytime'),
    ).toEqual({ kind: 'pass' });
  });

  it('denies when kill switch is active, with reason and release instructions', () => {
    const verdict = evaluateEmergencyGate(STATE, '/ws/.git/anytime');
    expect(verdict.kind).toBe('deny');
    if (verdict.kind === 'deny') {
      expect(verdict.reason).toContain('runaway loop detected');
      expect(verdict.reason).toContain('Kill Switch');
      expect(verdict.reason).toContain(join('/ws/.git/anytime', 'emergency.json'));
    }
  });
});
