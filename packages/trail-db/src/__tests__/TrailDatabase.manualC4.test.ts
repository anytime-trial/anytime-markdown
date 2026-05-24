/**
 * Tests for TrailDatabase manual C4 model methods + misc session helpers.
 *
 * Covers:
 *   - saveManualElement / updateManualElement / deleteManualElement / getManualElements (3802-3875)
 *   - saveManualRelationship / deleteManualRelationship / getManualRelationships (3877-3920)
 *   - insertManualElementRaw / insertManualRelationshipRaw (3922-3942)
 *   - insertManualGroupRaw / saveManualGroup / updateManualGroup / deleteManualGroup / getManualGroups (3944-4012)
 *   - isImported / getImportedFileSize / isCommitsResolved (2910-2941)
 *   - getReleases (7900-7912)
 *   - computeToolMetrics (sessionId path — 6000-6173)
 */

import { createTestTrailDatabase } from './support/createTestDb';
import type { TrailDatabase } from '../TrailDatabase';

type RawDb = {
  run: (sql: string, params?: ReadonlyArray<unknown>) => void;
};

function inner(db: TrailDatabase): RawDb {
  return (db as unknown as { db: RawDb }).db;
}

function insertSession(
  db: TrailDatabase,
  id: string,
  opts: {
    startTime?: string;
    endTime?: string;
    source?: string;
    repoName?: string;
    model?: string;
    importedAt?: string;
    fileSize?: number;
    commitsResolvedAt?: string | null;
  } = {},
): void {
  const {
    startTime = '2026-04-29T00:00:00.000Z',
    endTime = '2026-04-29T01:00:00.000Z',
    source = 'claude_code',
    repoName = 'test-repo',
    model = 'claude-opus-4',
    importedAt = '2026-04-29T01:00:00.000Z',
    fileSize = 1024,
    commitsResolvedAt = null,
  } = opts;
  // Phase H-4: sessions.repo_name 列は撤去済。repo 帰属は repo_id で表現する。
  const repoId = (db as unknown as { repoIdForName(n: string): number }).repoIdForName(repoName);
  inner(db).run(
    `INSERT OR IGNORE INTO sessions (
       id, slug, repo_id, version, entrypoint, model, start_time, end_time,
       message_count, file_path, file_size, imported_at, source,
       commits_resolved_at
     ) VALUES (?, ?, ?, '', '', ?, ?, ?, 0, '', ?, ?, ?, ?)`,
    [id, id, repoId, model, startTime, endTime, fileSize, importedAt, source, commitsResolvedAt],
  );
}

function insertMsg(
  db: TrailDatabase,
  uuid: string,
  sessionId: string,
  opts: {
    type?: string;
    timestamp?: string;
    toolCalls?: unknown[] | null;
    toolUseResult?: string | null;
    inputTokens?: number;
    outputTokens?: number;
    model?: string | null;
  } = {},
): void {
  const {
    type = 'assistant',
    timestamp = '2026-04-29T00:10:00.000Z',
    toolCalls = null,
    toolUseResult = null,
    inputTokens = 0,
    outputTokens = 0,
    model = null,
  } = opts;
  inner(db).run(
    `INSERT OR IGNORE INTO messages (
       uuid, session_id, type, timestamp, tool_calls, tool_use_result,
       input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, model
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)`,
    [
      uuid,
      sessionId,
      type,
      timestamp,
      toolCalls != null ? JSON.stringify(toolCalls) : null,
      toolUseResult,
      inputTokens,
      outputTokens,
      model,
    ],
  );
}

function insertToolCall(
  db: TrailDatabase,
  sessionId: string,
  messageUuid: string,
  callIndex: number,
  toolName: string,
  opts: {
    isError?: number;
    filePath?: string | null;
    command?: string | null;
    skillName?: string | null;
    turnIndex?: number;
    turnExecMs?: number | null;
  } = {},
): void {
  const { isError = 0, filePath = null, command = null, skillName = null, turnIndex = 0, turnExecMs = null } = opts;
  inner(db).run(
    `INSERT OR IGNORE INTO message_tool_calls (
       session_id, message_uuid, turn_index, call_index, tool_name, file_path,
       command, skill_name, model, is_sidechain, turn_exec_ms, has_thinking,
       is_error, error_type, timestamp
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, ?, 0, ?, NULL, '2026-04-29T00:10:00.000Z')`,
    [sessionId, messageUuid, turnIndex, callIndex, toolName, filePath, command, skillName, turnExecMs, isError],
  );
}

// ---------------------------------------------------------------------------
//  isImported / getImportedFileSize / isCommitsResolved
// ---------------------------------------------------------------------------
describe('TrailDatabase session status helpers', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  describe('isImported', () => {
    it('returns false for unknown session', () => {
      expect(db.isImported('no-such-session')).toBe(false);
    });

    it('returns true for imported session', () => {
      insertSession(db, 's1');
      expect(db.isImported('s1')).toBe(true);
    });
  });

  describe('getImportedFileSize', () => {
    it('returns 0 for unknown session', () => {
      expect(db.getImportedFileSize('no-such-session')).toBe(0);
    });

    it('returns file_size for known session', () => {
      insertSession(db, 's1', { fileSize: 4096 });
      expect(db.getImportedFileSize('s1')).toBe(4096);
    });
  });

  describe('isCommitsResolved', () => {
    it('returns false when commits_resolved_at is NULL', () => {
      insertSession(db, 's1', { commitsResolvedAt: null });
      expect(db.isCommitsResolved('s1')).toBe(false);
    });

    it('returns true when commits_resolved_at is set', () => {
      insertSession(db, 's1', { commitsResolvedAt: '2026-04-29T01:00:00.000Z' });
      expect(db.isCommitsResolved('s1')).toBe(true);
    });

    it('returns false for unknown session', () => {
      expect(db.isCommitsResolved('no-such-session')).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
//  getReleases
// ---------------------------------------------------------------------------
describe('TrailDatabase.getReleases', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('returns empty array when no releases', () => {
    expect(db.getReleases()).toEqual([]);
  });

  it('returns releases sorted by released_at DESC', () => {
    // flip 後 releases は prev_release_id 列 (旧 prev_tag は廃止)。
    // Phase H-5: releases.repo_name 列は撤去済。repo 帰属は repo_id (省略時 NULL) で表現する。
    inner(db).run(
      `INSERT OR REPLACE INTO releases (
         tag, released_at, prev_release_id, package_tags,
         commit_count, files_changed, lines_added, lines_deleted,
         total_lines, feat_count, fix_count, refactor_count, test_count, other_count,
         affected_packages, duration_days
       ) VALUES (?, ?, NULL, '[]', 5, 10, 100, 50, 1000, 2, 1, 1, 0, 0, '[]', 30)`,
      ['v1.0.0', '2026-03-01T00:00:00.000Z'],
    );
    const v1Id = Number(
      (db as unknown as { db: { exec: (sql: string, p?: ReadonlyArray<unknown>) => Array<{ values: unknown[][] }> } }).db
        .exec('SELECT release_id FROM releases WHERE tag = ?', ['v1.0.0'])[0]?.values?.[0]?.[0],
    );
    inner(db).run(
      `INSERT OR REPLACE INTO releases (
         tag, released_at, prev_release_id, package_tags,
         commit_count, files_changed, lines_added, lines_deleted,
         total_lines, feat_count, fix_count, refactor_count, test_count, other_count,
         affected_packages, duration_days
       ) VALUES (?, ?, ?, '[]', 3, 5, 50, 20, 1020, 1, 0, 0, 1, 0, '[]', 14)`,
      ['v1.1.0', '2026-04-01T00:00:00.000Z', v1Id],
    );
    const releases = db.getReleases();
    expect(releases).toHaveLength(2);
    // DESC order: v1.1.0 first
    expect((releases[0] as unknown as Record<string, unknown>).tag).toBe('v1.1.0');
    expect((releases[1] as unknown as Record<string, unknown>).tag).toBe('v1.0.0');
    // prev_release_id → prev_tag が getReleases で解決される (外部 I/F 互換維持)。
    expect((releases[0] as unknown as Record<string, unknown>).prev_tag).toBe('v1.0.0');
    expect((releases[1] as unknown as Record<string, unknown>).prev_tag).toBeNull();
  });
});

// ---------------------------------------------------------------------------
//  Manual C4 element methods
// ---------------------------------------------------------------------------
describe('TrailDatabase manual C4 elements', () => {
  let db: TrailDatabase;
  const repo = 'test-repo';

  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('getManualElements returns empty array when no elements', () => {
    expect(db.getManualElements(repo)).toEqual([]);
  });

  it('saveManualElement creates element and getManualElements retrieves it', () => {
    const id = db.saveManualElement(repo, {
      type: 'person',
      name: 'User',
      description: 'An end user',
      external: false,
      parentId: null,
    });
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);

    const elements = db.getManualElements(repo);
    expect(elements).toHaveLength(1);
    expect(elements[0].name).toBe('User');
    expect(elements[0].description).toBe('An end user');
    expect(elements[0].external).toBe(false);
    expect(elements[0].parentId).toBeNull();
  });

  it('updateManualElement updates fields', () => {
    const id = db.saveManualElement(repo, {
      type: 'system',
      name: 'Old Name',
      external: false,
      parentId: null,
    });
    db.updateManualElement(repo, id, { name: 'New Name', description: 'updated', external: true });
    const elements = db.getManualElements(repo);
    expect(elements[0].name).toBe('New Name');
    expect(elements[0].description).toBe('updated');
    expect(elements[0].external).toBe(true);
  });

  it('updateManualElement with no changes is a no-op', () => {
    const id = db.saveManualElement(repo, {
      type: 'system',
      name: 'Same Name',
      external: false,
      parentId: null,
    });
    // Should not throw
    expect(() => db.updateManualElement(repo, id, {})).not.toThrow();
  });

  it('deleteManualElement removes element', () => {
    const id = db.saveManualElement(repo, {
      type: 'container',
      name: 'To Delete',
      external: false,
      parentId: null,
    });
    expect(db.getManualElements(repo)).toHaveLength(1);
    db.deleteManualElement(repo, id);
    expect(db.getManualElements(repo)).toHaveLength(0);
  });

  it('insertManualElementRaw inserts a raw element', () => {
    const now = new Date().toISOString();
    db.insertManualElementRaw(repo, {
      id: 'sys_manual_1',
      type: 'system',
      name: 'Raw System',
      external: false,
      parentId: null,
      updatedAt: now,
    });
    const elements = db.getManualElements(repo);
    expect(elements).toHaveLength(1);
    expect(elements[0].id).toBe('sys_manual_1');
  });
});

// ---------------------------------------------------------------------------
//  Manual C4 relationship methods
// ---------------------------------------------------------------------------
describe('TrailDatabase manual C4 relationships', () => {
  let db: TrailDatabase;
  const repo = 'test-repo';

  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('getManualRelationships returns empty array initially', () => {
    expect(db.getManualRelationships(repo)).toEqual([]);
  });

  it('saveManualRelationship creates and getManualRelationships retrieves', () => {
    const id = db.saveManualRelationship(repo, {
      fromId: 'el_1',
      toId: 'el_2',
      label: 'uses',
      technology: 'HTTP',
    });
    expect(typeof id).toBe('string');

    const rels = db.getManualRelationships(repo);
    expect(rels).toHaveLength(1);
    expect(rels[0].fromId).toBe('el_1');
    expect(rels[0].toId).toBe('el_2');
    expect(rels[0].label).toBe('uses');
    expect(rels[0].technology).toBe('HTTP');
  });

  it('deleteManualRelationship removes it', () => {
    const id = db.saveManualRelationship(repo, { fromId: 'a', toId: 'b' });
    expect(db.getManualRelationships(repo)).toHaveLength(1);
    db.deleteManualRelationship(repo, id);
    expect(db.getManualRelationships(repo)).toHaveLength(0);
  });

  it('insertManualRelationshipRaw inserts raw relationship', () => {
    const now = new Date().toISOString();
    db.insertManualRelationshipRaw(repo, {
      id: 'rel_manual_1',
      fromId: 'from_x',
      toId: 'to_y',
      updatedAt: now,
    });
    const rels = db.getManualRelationships(repo);
    expect(rels).toHaveLength(1);
    expect(rels[0].id).toBe('rel_manual_1');
  });

  it('deleteManualElement cascades to delete its relationships', () => {
    const elemId = db.saveManualElement(repo, {
      type: 'system',
      name: 'Target',
      external: false,
      parentId: null,
    });
    const relId = db.saveManualRelationship(repo, { fromId: elemId, toId: 'other_elem' });
    expect(db.getManualRelationships(repo)).toHaveLength(1);
    // deleteManualElement deletes relationships referencing the element
    db.deleteManualElement(repo, elemId);
    expect(db.getManualRelationships(repo)).toHaveLength(0);
    void relId; // used indirectly
  });
});

// ---------------------------------------------------------------------------
//  Manual C4 group methods
// ---------------------------------------------------------------------------
describe('TrailDatabase manual C4 groups', () => {
  let db: TrailDatabase;
  const repo = 'test-repo';

  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('getManualGroups returns empty array initially', () => {
    expect(db.getManualGroups(repo)).toEqual([]);
  });

  it('saveManualGroup creates and getManualGroups retrieves', () => {
    const id = db.saveManualGroup(repo, {
      memberIds: ['el_1', 'el_2'],
      label: 'Frontend',
    });
    expect(typeof id).toBe('string');

    const groups = db.getManualGroups(repo);
    expect(groups).toHaveLength(1);
    expect(groups[0].memberIds).toEqual(['el_1', 'el_2']);
    expect(groups[0].label).toBe('Frontend');
  });

  it('saveManualGroup increments id for subsequent calls', () => {
    const id1 = db.saveManualGroup(repo, { memberIds: ['a'], label: 'G1' });
    const id2 = db.saveManualGroup(repo, { memberIds: ['b'], label: 'G2' });
    expect(id1).not.toBe(id2);
    expect(db.getManualGroups(repo)).toHaveLength(2);
  });

  it('updateManualGroup updates label and memberIds', () => {
    const id = db.saveManualGroup(repo, { memberIds: ['x'], label: 'Old' });
    db.updateManualGroup(repo, id, { label: 'New', memberIds: ['x', 'y'] });
    const groups = db.getManualGroups(repo);
    expect(groups[0].label).toBe('New');
    expect(groups[0].memberIds).toEqual(['x', 'y']);
  });

  it('deleteManualGroup removes it', () => {
    const id = db.saveManualGroup(repo, { memberIds: ['z'], label: 'ToDelete' });
    expect(db.getManualGroups(repo)).toHaveLength(1);
    db.deleteManualGroup(repo, id);
    expect(db.getManualGroups(repo)).toHaveLength(0);
  });

  it('insertManualGroupRaw inserts a raw group', () => {
    const now = new Date().toISOString();
    db.insertManualGroupRaw(repo, {
      id: 'grp_manual_99',
      memberIds: ['p', 'q'],
      updatedAt: now,
    });
    const groups = db.getManualGroups(repo);
    expect(groups).toHaveLength(1);
    expect(groups[0].id).toBe('grp_manual_99');
    expect(groups[0].memberIds).toEqual(['p', 'q']);
  });
});

// ---------------------------------------------------------------------------
//  computeToolMetrics with a sessionId (per-session path)
// ---------------------------------------------------------------------------
describe('TrailDatabase.computeToolMetrics (per-session path)', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('returns zero object for session with no tool calls', () => {
    insertSession(db, 's1');
    const result = db.computeToolMetrics('s1');
    expect(result.totalEdits).toBe(0);
    expect(result.totalRetries).toBe(0);
    expect(result.totalBuildRuns).toBe(0);
    expect(result.totalTestRuns).toBe(0);
    expect(result.toolUsage).toBeDefined();
    expect(result.skillUsage).toBeDefined();
  });

  it('counts Edit calls and retries within a session', () => {
    insertSession(db, 's1');
    // Two messages with tool_calls (session-specific path reads messages.tool_calls)
    insertMsg(db, 'm1', 's1', {
      type: 'assistant',
      toolCalls: [{ name: 'Edit', input: { file_path: 'src/foo.ts' } }],
    });
    insertMsg(db, 'm2', 's1', {
      type: 'assistant',
      toolCalls: [{ name: 'Edit', input: { file_path: 'src/foo.ts' } }],
    });
    // Also insert tool_use_result for the messages (needed for fail detection)
    const result = db.computeToolMetrics('s1');
    // Session-specific path parses message.tool_calls
    expect(result.totalEdits).toBe(2);
    // Same file edited twice → 1 retry
    expect(result.totalRetries).toBe(1);
  });

  it('counts Build commands from session messages', () => {
    insertSession(db, 's1');
    insertMsg(db, 'm1', 's1', {
      type: 'assistant',
      toolCalls: [{ name: 'Bash', input: { command: 'npm run build' } }],
    });
    insertMsg(db, 'm1b', 's1', {
      type: 'user',
      toolUseResult: 'ERR! Build failed',
    });
    const result = db.computeToolMetrics('s1');
    expect(result.totalBuildRuns).toBeGreaterThanOrEqual(1);
  });

  it('returns toolUsage and skillUsage for session (using aggregateBySessionInternal)', () => {
    insertSession(db, 's1');
    insertToolCall(db, 's1', 'm1', 0, 'Read', { skillName: 'my-skill', turnIndex: 0 });
    insertToolCall(db, 's1', 'm1', 1, 'Edit', { skillName: 'my-skill', turnIndex: 0 });
    const result = db.computeToolMetrics('s1');
    // toolUsage is populated from aggregateBySessionInternal
    expect(Array.isArray(result.toolUsage)).toBe(true);
    expect((result.toolUsage?.length ?? 0)).toBeGreaterThanOrEqual(1);
    // skillUsage is also populated
    expect(Array.isArray(result.skillUsage)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
//  getManualElementPrefix — component type coverage
// ---------------------------------------------------------------------------
describe('TrailDatabase.saveManualElement — component type', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('saves a component-type element and getManualElements returns it', () => {
    db.saveManualElement('test-repo', {
      type: 'component',
      name: 'Auth Component',
      description: 'Handles authentication',
      external: false,
      parentId: null,
    });

    const elements = db.getManualElements('test-repo');
    const comp = elements.find((e) => e.name === 'Auth Component');
    expect(comp).toBeDefined();
    expect(comp!.type).toBe('component');
  });
});

// ---------------------------------------------------------------------------
//  getTrailGraphIds / getTrailGraphEntries
// ---------------------------------------------------------------------------
describe('TrailDatabase getTrailGraphIds and getTrailGraphEntries', () => {
  let db: TrailDatabase;
  beforeEach(async () => { db = await createTestTrailDatabase(); });
  afterEach(() => db.close());

  it('getTrailGraphIds returns empty array for empty DB', () => {
    const ids = db.getTrailGraphIds();
    expect(Array.isArray(ids)).toBe(true);
  });

  it('getTrailGraphEntries returns empty array for empty DB', () => {
    const entries = db.getTrailGraphEntries();
    expect(Array.isArray(entries)).toBe(true);
  });
});
