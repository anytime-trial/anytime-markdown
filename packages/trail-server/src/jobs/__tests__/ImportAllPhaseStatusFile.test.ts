import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ImportAllPhaseStatusWriter,
  readImportAllPhaseStatus,
} from '../ImportAllPhaseStatusFile';

describe('ImportAllPhaseStatusWriter / readImportAllPhaseStatus', () => {
  let dir: string;
  let filePath: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'importall-status-'));
    filePath = path.join(dir, 'importall-phase-status.json');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('initialize() flushes empty phases with run_id', () => {
    const writer = new ImportAllPhaseStatusWriter(filePath, 'run-1');
    writer.initialize();

    const file = readImportAllPhaseStatus(filePath);
    expect(file).not.toBeNull();
    expect(file?.run_id).toBe('run-1');
    expect(file?.phases).toEqual({});
    expect(typeof file?.updated_at).toBe('string');
  });

  it('applyEvent("start") sets state=running with startedAt', () => {
    const writer = new ImportAllPhaseStatusWriter(filePath, 'run-1');
    writer.applyEvent({ phase: 'import_sessions', action: 'start' });

    const file = readImportAllPhaseStatus(filePath);
    expect(file?.phases.import_sessions?.state).toBe('running');
    expect(file?.phases.import_sessions?.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('applyEvent("finish") preserves startedAt and adds count', () => {
    const writer = new ImportAllPhaseStatusWriter(filePath, 'run-1');
    writer.applyEvent({ phase: 'resolve_releases', action: 'start' });
    writer.applyEvent({ phase: 'resolve_releases', action: 'finish', count: 5 });

    const file = readImportAllPhaseStatus(filePath);
    const entry = file?.phases.resolve_releases;
    expect(entry?.state).toBe('success');
    expect(entry?.count).toBe(5);
    expect(entry?.startedAt).toBeDefined();
    expect(entry?.finishedAt).toBeDefined();
  });

  it('applyEvent("skip") sets skipped state + message', () => {
    const writer = new ImportAllPhaseStatusWriter(filePath, 'run-1');
    writer.applyEvent({ phase: 'analyze_releases', action: 'skip', message: 'no gitRoot' });

    const entry = readImportAllPhaseStatus(filePath)?.phases.analyze_releases;
    expect(entry?.state).toBe('skipped');
    expect(entry?.message).toBe('no gitRoot');
  });

  it('applyEvent("error") sets error state + message', () => {
    const writer = new ImportAllPhaseStatusWriter(filePath, 'run-1');
    writer.applyEvent({ phase: 'backfill', action: 'start' });
    writer.applyEvent({ phase: 'backfill', action: 'error', message: 'git not found' });

    const entry = readImportAllPhaseStatus(filePath)?.phases.backfill;
    expect(entry?.state).toBe('error');
    expect(entry?.message).toBe('git not found');
  });

  it('複数 phase の混在を保持する', () => {
    const writer = new ImportAllPhaseStatusWriter(filePath, 'run-1');
    writer.applyEvent({ phase: 'import_sessions', action: 'finish', count: 10 });
    writer.applyEvent({ phase: 'resolve_releases', action: 'finish', count: 3 });
    writer.applyEvent({ phase: 'rebuild_costs', action: 'start' });

    const phases = readImportAllPhaseStatus(filePath)?.phases ?? {};
    expect(phases.import_sessions?.state).toBe('success');
    expect(phases.resolve_releases?.state).toBe('success');
    expect(phases.rebuild_costs?.state).toBe('running');
  });

  it('readImportAllPhaseStatus returns null if file missing', () => {
    expect(readImportAllPhaseStatus(filePath)).toBeNull();
  });

  it('readImportAllPhaseStatus returns null if file is broken JSON', () => {
    fs.writeFileSync(filePath, 'not json {{{');
    expect(readImportAllPhaseStatus(filePath)).toBeNull();
  });

  it('atomic write: tmp file is renamed', () => {
    const writer = new ImportAllPhaseStatusWriter(filePath, 'run-1');
    writer.applyEvent({ phase: 'import_sessions', action: 'start' });
    // tmp file should be cleaned up after rename
    expect(fs.existsSync(`${filePath}.tmp`)).toBe(false);
    expect(fs.existsSync(filePath)).toBe(true);
  });
});
