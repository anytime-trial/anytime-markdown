/**
 * GitStateService coverage tests
 *
 * Target uncovered lines:
 *   line 17  — filePath() private method (called via readState/writeState)
 *   lines 24–25 — getCurrentHead catch block (returns null on git error)
 *   lines 30–34 — readState catch block (returns null when file missing)
 *   lines 37–44 — writeState (creates stateDir, writes JSON)
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { GitStateService } from '../GitStateService';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'trail-gitstate-cov-'));
}

describe('GitStateService — getCurrentHead error path (line 24–25)', () => {
  it('returns null when cwd is a non-git directory', () => {
    const tmpDir = makeTmpDir();
    try {
      const service = new GitStateService(path.join(tmpDir, '.state'));
      // tmpDir is not a git repo → git rev-parse HEAD exits non-zero → catch → null
      const result = service.getCurrentHead(tmpDir);
      expect(result).toBeNull();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('returns null when cwd does not exist', () => {
    const service = new GitStateService('/tmp/.nonexistent-state-dir');
    const result = service.getCurrentHead('/tmp/does-not-exist-trail-cov-test');
    expect(result).toBeNull();
  });
});

describe('GitStateService — readState error path (lines 30–34)', () => {
  it('returns null when state file does not exist', () => {
    const stateDir = path.join(os.tmpdir(), 'trail-gitstate-nofile-' + Date.now());
    const service = new GitStateService(stateDir);
    // File was never written → readFileSync throws ENOENT → catch → null
    const result = service.readState('session-123');
    expect(result).toBeNull();
  });

  it('returns null when state file contains invalid JSON', () => {
    const stateDir = makeTmpDir();
    try {
      fs.mkdirSync(stateDir, { recursive: true });
      // Write malformed JSON to the expected path
      const filePath = path.join(stateDir, 'claude-code-git-state-session-bad.json');
      fs.writeFileSync(filePath, 'NOT_VALID_JSON{{{');

      const service = new GitStateService(stateDir);
      // JSON.parse throws → catch → null
      const result = service.readState('session-bad');
      expect(result).toBeNull();
    } finally {
      fs.rmSync(stateDir, { recursive: true, force: true });
    }
  });
});

describe('GitStateService — writeState (lines 37–44) + readState round-trip (line 17)', () => {
  it('creates stateDir and writes a readable JSON file', () => {
    // stateDir does not exist yet — writeState must call mkdirSync
    const baseDir = makeTmpDir();
    const stateDir = path.join(baseDir, 'nested', 'state');
    try {
      const service = new GitStateService(stateDir);
      // stateDir does not exist before this call → exercises line 38 mkdirSync
      service.writeState('sess-abc', 'deadbeef1234567890abcdef1234567890abcdef');

      expect(fs.existsSync(stateDir)).toBe(true);
      const filePath = path.join(stateDir, 'claude-code-git-state-sess-abc.json');
      expect(fs.existsSync(filePath)).toBe(true);

      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(parsed.sessionId).toBe('sess-abc');
      expect(parsed.lastHead).toBe('deadbeef1234567890abcdef1234567890abcdef');
      expect(typeof parsed.updatedAt).toBe('string');
    } finally {
      fs.rmSync(baseDir, { recursive: true, force: true });
    }
  });

  it('writeState then readState returns the persisted GitStateFile', () => {
    const stateDir = makeTmpDir();
    try {
      const service = new GitStateService(stateDir);
      service.writeState('sess-xyz', 'abc123');

      // Exercises readState success path (readFileSync + JSON.parse)
      // and filePath() private method (line 17) used by both writeState and readState
      const state = service.readState('sess-xyz');
      expect(state).not.toBeNull();
      expect(state!.sessionId).toBe('sess-xyz');
      expect(state!.lastHead).toBe('abc123');
      expect(state!.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    } finally {
      fs.rmSync(stateDir, { recursive: true, force: true });
    }
  });

  it('overwrites an existing state file on second write', () => {
    const stateDir = makeTmpDir();
    try {
      const service = new GitStateService(stateDir);
      service.writeState('sess-dup', 'oldhash');
      service.writeState('sess-dup', 'newhash');

      const state = service.readState('sess-dup');
      expect(state!.lastHead).toBe('newhash');
    } finally {
      fs.rmSync(stateDir, { recursive: true, force: true });
    }
  });
});
