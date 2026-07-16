import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  EMERGENCY_SPOOL_MAX,
  appendEmergencySpool,
  drainEmergencySpool,
  emergencySpoolPath,
} from '../emergencySpool';
import type { EmergencySpoolEvent } from '../emergencySpool';

function event(reason: string): EmergencySpoolEvent {
  return {
    occurredAt: '2026-07-16T10:00:00.000Z',
    event: 'anomaly_detected',
    reason,
    actor: 'agent',
    sessionId: 'session-1',
    detailJson: '{"kind":"loop_detected"}',
  };
}

describe('emergency spool', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'emergency-spool-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('round-trips append and drain', () => {
    appendEmergencySpool(dir, event('first'));
    appendEmergencySpool(dir, event('second'));
    const drained = drainEmergencySpool(emergencySpoolPath(dir));
    expect(drained.map((e) => e.reason)).toEqual(['first', 'second']);
    // drain 後は空（ファイル消滅）
    expect(existsSync(emergencySpoolPath(dir))).toBe(false);
    expect(drainEmergencySpool(emergencySpoolPath(dir))).toEqual([]);
  });

  it('skips corrupted lines but keeps healthy ones, reporting via onError', () => {
    appendEmergencySpool(dir, event('ok-1'));
    appendFileSync(emergencySpoolPath(dir), '{broken json\n', 'utf8');
    appendEmergencySpool(dir, event('ok-2'));
    const errors: string[] = [];
    const drained = drainEmergencySpool(emergencySpoolPath(dir), (m) => errors.push(m));
    expect(drained.map((e) => e.reason)).toEqual(['ok-1', 'ok-2']);
    expect(errors.length).toBe(1);
  });

  it('rejects appends beyond EMERGENCY_SPOOL_MAX and reports via onError', () => {
    const lines = Array.from({ length: EMERGENCY_SPOOL_MAX }, (_, i) =>
      JSON.stringify(event(`e-${i}`)),
    );
    writeFileSync(emergencySpoolPath(dir), `${lines.join('\n')}\n`, 'utf8');
    const errors: string[] = [];
    appendEmergencySpool(dir, event('overflow'), (m) => errors.push(m));
    expect(errors.length).toBe(1);
    const drained = drainEmergencySpool(emergencySpoolPath(dir));
    expect(drained.length).toBe(EMERGENCY_SPOOL_MAX);
    expect(drained.at(-1)?.reason).toBe(`e-${EMERGENCY_SPOOL_MAX - 1}`);
  });

  it('drops rows whose required fields are missing or mistyped', () => {
    appendFileSync(
      emergencySpoolPath(dir),
      `${JSON.stringify({ occurredAt: 1, event: 'bogus' })}\n`,
      'utf8',
    );
    appendEmergencySpool(dir, event('valid'));
    const errors: string[] = [];
    const drained = drainEmergencySpool(emergencySpoolPath(dir), (m) => errors.push(m));
    expect(drained.map((e) => e.reason)).toEqual(['valid']);
    expect(errors.length).toBe(1);
  });

  it('accepts kill_switch_on events', () => {
    appendEmergencySpool(dir, { ...event('kill'), event: 'kill_switch_on' });
    const drained = drainEmergencySpool(emergencySpoolPath(dir));
    expect(drained[0]?.event).toBe('kill_switch_on');
  });

  it('recovers orphaned .draining-* files left by a crashed or failed drain', () => {
    const spool = emergencySpoolPath(dir);
    writeFileSync(`${spool}.draining-orphan1`, `${JSON.stringify(event('orphan'))}\n`, 'utf8');
    appendEmergencySpool(dir, event('current'));
    const drained = drainEmergencySpool(spool);
    expect(drained.map((e) => e.reason).sort()).toEqual(['current', 'orphan']);
    expect(existsSync(`${spool}.draining-orphan1`)).toBe(false);
  });

  it('keeps the draining file when it cannot be read (no event loss, retried next cycle)', () => {
    const spool = emergencySpoolPath(dir);
    // ディレクトリは readFileSync が EISDIR で失敗する = 読取失敗の再現（chmod 不要で root でも成立）
    const unreadable = `${spool}.draining-broken`;
    mkdirSync(unreadable, { recursive: true });
    appendEmergencySpool(dir, event('alive'));
    const errors: string[] = [];
    const drained = drainEmergencySpool(spool, (m) => errors.push(m));
    expect(drained.map((e) => e.reason)).toEqual(['alive']); // 読める分は取り込む
    expect(existsSync(unreadable)).toBe(true); // 読めないファイルは残置（削除しない）
    expect(errors.some((m) => m.includes('残置'))).toBe(true);
  });

  it('preserves the raw file content as one JSON object per line', () => {
    appendEmergencySpool(dir, event('line-check'));
    const raw = readFileSync(emergencySpoolPath(dir), 'utf8');
    expect(raw.endsWith('\n')).toBe(true);
    expect(JSON.parse(raw.trim()).reason).toBe('line-check');
  });
});
