import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  KILL_CONSECUTIVE,
  LOOP_WINDOW,
  OSCILLATION_WINDOW,
  WARN_CONSECUTIVE,
  emptyLoopState,
  evaluateLoop,
  loopStatePath,
  readLoopState,
  toolSignature,
  writeLoopState,
} from '../loopDetector';
import type { LoopState, LoopVerdict } from '../loopDetector';

/** signature 列を順に流し、最後の verdict と状態を返す。 */
function run(signatures: string[]): { state: LoopState; verdict: LoopVerdict } {
  let state = emptyLoopState();
  let verdict: LoopVerdict = { kind: 'none' };
  for (const sig of signatures) {
    const r = evaluateLoop(state, sig);
    state = r.state;
    verdict = r.verdict;
  }
  return { state, verdict };
}

describe('toolSignature', () => {
  it('is insensitive to object key order (canonical JSON)', () => {
    expect(toolSignature('Bash', { command: 'ls', timeout: 5 })).toBe(
      toolSignature('Bash', { timeout: 5, command: 'ls' }),
    );
  });

  it('differs by tool name and by input', () => {
    expect(toolSignature('Bash', { command: 'ls' })).not.toBe(
      toolSignature('Read', { command: 'ls' }),
    );
    expect(toolSignature('Bash', { command: 'ls' })).not.toBe(
      toolSignature('Bash', { command: 'pwd' }),
    );
  });

  it('sorts keys recursively in nested objects', () => {
    expect(toolSignature('Edit', { a: { x: 1, y: 2 }, b: [1, 2] })).toBe(
      toolSignature('Edit', { b: [1, 2], a: { y: 2, x: 1 } }),
    );
  });

  it('preserves array order (different order = different signature)', () => {
    expect(toolSignature('T', { list: [1, 2] })).not.toBe(toolSignature('T', { list: [2, 1] }));
  });
});

describe('evaluateLoop: consecutive detection', () => {
  it('stays none below the warn threshold', () => {
    const { verdict } = run(Array(WARN_CONSECUTIVE - 1).fill('A'));
    expect(verdict.kind).toBe('none');
  });

  it('warns at exactly WARN_CONSECUTIVE', () => {
    const { verdict } = run(Array(WARN_CONSECUTIVE).fill('A'));
    expect(verdict).toMatchObject({ kind: 'warn', pattern: 'consecutive', count: WARN_CONSECUTIVE });
  });

  it('suppresses repeated warns while the same run continues', () => {
    const { verdict } = run(Array(KILL_CONSECUTIVE - 1).fill('A')); // 9 連続
    expect(verdict.kind).toBe('none');
  });

  it('kills at exactly KILL_CONSECUTIVE', () => {
    const { verdict } = run(Array(KILL_CONSECUTIVE).fill('A'));
    expect(verdict).toMatchObject({ kind: 'kill', pattern: 'consecutive', count: KILL_CONSECUTIVE });
  });

  it('resets the run when a different signature intervenes (TDD loop stays silent)', () => {
    // A x4, B, A x4 — どちらの run も閾値未満
    const { verdict } = run([...Array(4).fill('A'), 'B', ...Array(4).fill('A')]);
    expect(verdict.kind).toBe('none');
  });

  it('warns again for a fresh run after an intervening call', () => {
    const seq = [...Array(WARN_CONSECUTIVE).fill('A'), 'B', ...Array(WARN_CONSECUTIVE).fill('A')];
    const { verdict } = run(seq);
    expect(verdict).toMatchObject({ kind: 'warn', pattern: 'consecutive' });
  });
});

describe('evaluateLoop: oscillation detection', () => {
  const abab = Array.from({ length: OSCILLATION_WINDOW }, (_, i) => (i % 2 === 0 ? 'A' : 'B'));

  it('warns when the last OSCILLATION_WINDOW calls contain <= 2 unique signatures', () => {
    const { verdict } = run(abab);
    expect(verdict).toMatchObject({ kind: 'warn', pattern: 'oscillation' });
  });

  it('suppresses repeated oscillation warns while the pattern continues', () => {
    const { verdict } = run([...abab, 'A']);
    expect(verdict.kind).toBe('none');
  });

  it('stays none when a third signature is present in the window', () => {
    const seq = [...abab.slice(0, OSCILLATION_WINDOW - 1), 'C'];
    const { verdict } = run(seq);
    expect(verdict.kind).toBe('none');
  });

  it('does not oscillation-warn below the window length', () => {
    const { verdict } = run(abab.slice(0, OSCILLATION_WINDOW - 2));
    expect(verdict.kind).toBe('none');
  });
});

describe('loop state persistence', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'loop-detector-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('round-trips write and read', () => {
    const state: LoopState = {
      signatures: ['A', 'B'],
      lastWarnedKey: 'warn:A',
      updatedAt: '2026-07-16T10:00:00.000Z',
    };
    writeLoopState(dir, 'session-1', state);
    expect(readLoopState(dir, 'session-1')).toEqual(state);
  });

  it('returns the empty state for a missing file', () => {
    expect(readLoopState(dir, 'no-such-session').signatures).toEqual([]);
  });

  it('returns the empty state for corrupted JSON (fail-open)', () => {
    writeLoopState(dir, 's', emptyLoopState());
    writeFileSync(loopStatePath(dir, 's'), '{broken', 'utf8');
    expect(readLoopState(dir, 's').signatures).toEqual([]);
  });

  it('caps stored signatures at LOOP_WINDOW', () => {
    let state = emptyLoopState();
    for (let i = 0; i < LOOP_WINDOW + 10; i++) {
      state = evaluateLoop(state, `sig-${i}`).state;
    }
    expect(state.signatures.length).toBe(LOOP_WINDOW);
    writeLoopState(dir, 's', state);
    expect(readLoopState(dir, 's').signatures.length).toBe(LOOP_WINDOW);
  });

  it('sanitizes session ids so paths cannot escape the loop-state dir', () => {
    writeLoopState(dir, '../../evil', emptyLoopState());
    // dir の外にファイルが作られていないこと + loop-state 配下に収まっていること
    expect(existsSync(join(dir, '..', 'evil.json'))).toBe(false);
    const files = readdirSync(join(dir, 'loop-state'));
    expect(files.length).toBe(1);
    expect(files[0]).not.toContain('..');
  });

  it('prunes stale state files older than 24h on write', () => {
    writeLoopState(dir, 'old-session', emptyLoopState());
    const oldPath = loopStatePath(dir, 'old-session');
    const past = new Date(Date.now() - 25 * 60 * 60 * 1000);
    utimesSync(oldPath, past, past);
    writeLoopState(dir, 'new-session', emptyLoopState());
    expect(existsSync(oldPath)).toBe(false);
    expect(existsSync(loopStatePath(dir, 'new-session'))).toBe(true);
  });
});
