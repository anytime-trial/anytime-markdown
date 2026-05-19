import * as fs from 'node:fs';
import * as nodeos from 'node:os';
import * as path from 'node:path';
import type * as http from 'node:http';

// We need to control what os.homedir() returns per test.
// jest.mock factory is hoisted so we cannot reference a runtime variable directly.
// Instead we expose a mutable holder object that the factory closure can reference.
const homedirHolder = { value: nodeos.tmpdir() };

jest.mock('node:os', () => {
  const actual = jest.requireActual<typeof nodeos>('node:os');
  return { ...actual, homedir: () => homedirHolder.value };
});

import { scanPromptFiles, PromptsApiHandler } from '../PromptsApiHandler';

function makeMockRes() {
  let statusCode = 0;
  let body = '';
  const res = {
    writeHead: jest.fn((code: number) => { statusCode = code; }),
    end: jest.fn((data?: string) => { body = data ?? ''; }),
    get statusCode() { return statusCode; },
    get body() { return body; },
    parsedBody() { return JSON.parse(body); },
  } as unknown as http.ServerResponse & { statusCode: number; body: string; parsedBody(): unknown };
  return res;
}

function makeLogger() {
  return {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    child: jest.fn(),
  };
}

// ---------------------------------------------------------------------------
// Helpers: create a temp home so all file I/O stays isolated
// ---------------------------------------------------------------------------

let tmpHome: string;

function setupTmpHome(): void {
  tmpHome = fs.mkdtempSync(path.join(nodeos.tmpdir(), 'prompts-home-'));
  homedirHolder.value = tmpHome;
  fs.mkdirSync(path.join(tmpHome, '.claude'));
}

function teardownTmpHome(): void {
  homedirHolder.value = nodeos.tmpdir();
  fs.rmSync(tmpHome, { recursive: true });
}

function claudeDir(): string {
  return path.join(tmpHome, '.claude');
}

// ---------------------------------------------------------------------------
// scanPromptFiles
// ---------------------------------------------------------------------------

describe('scanPromptFiles', () => {
  beforeEach(setupTmpHome);
  afterEach(teardownTmpHome);

  it('returns empty array when no files exist', () => {
    const result = scanPromptFiles();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it('reads CLAUDE.md as "main" tag entry', () => {
    fs.writeFileSync(path.join(claudeDir(), 'CLAUDE.md'), '# Global\n', 'utf-8');

    const result = scanPromptFiles();
    expect(result).toHaveLength(1);
    expect(result[0].tags).toContain('main');
    expect(result[0].name).toBe('CLAUDE');
    expect(result[0].content).toBe('# Global\n');
  });

  it('reads rules directory .md files as "rule" tag', () => {
    const rulesDir = path.join(claudeDir(), 'rules');
    fs.mkdirSync(rulesDir);
    fs.writeFileSync(path.join(rulesDir, 'code-quality.md'), '# Code Quality\n', 'utf-8');
    fs.writeFileSync(path.join(rulesDir, 'other.md'), '# Other\n', 'utf-8');

    const result = scanPromptFiles();
    const ruleEntries = result.filter((e) => e.tags.includes('rule'));
    expect(ruleEntries).toHaveLength(2);
  });

  it('reads project CLAUDE.md files as "project" tag', () => {
    const projDir = path.join(claudeDir(), 'projects', 'my-project');
    fs.mkdirSync(projDir, { recursive: true });
    fs.writeFileSync(path.join(projDir, 'CLAUDE.md'), '# Project\n', 'utf-8');

    const result = scanPromptFiles();
    const projEntry = result.find((e) => e.tags.includes('project'));
    expect(projEntry).toBeDefined();
    expect(projEntry?.tags).toContain('my-project');
  });

  it('reads memory .md files as "memory" tag', () => {
    const memDir = path.join(claudeDir(), 'projects', 'my-project', 'memory');
    fs.mkdirSync(memDir, { recursive: true });
    fs.writeFileSync(path.join(memDir, 'MEMORY.md'), '# Memory\n', 'utf-8');

    const result = scanPromptFiles();
    const memEntry = result.find((e) => e.tags.includes('memory'));
    expect(memEntry).toBeDefined();
    expect(memEntry?.tags).toContain('my-project');
  });

  it('reads skills SKILL.md files as "skill" tag', () => {
    const skillDir = path.join(claudeDir(), 'skills', 'my-skill');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Skill\n', 'utf-8');

    const result = scanPromptFiles();
    const skillEntry = result.find((e) => e.tags.includes('skill'));
    expect(skillEntry).toBeDefined();
    expect(skillEntry?.tags).toContain('my-skill');
  });

  it('reads scripts files as "script" tag', () => {
    const scriptsDir = path.join(claudeDir(), 'scripts');
    fs.mkdirSync(scriptsDir);
    fs.writeFileSync(path.join(scriptsDir, 'validate.sh'), '#!/bin/bash\n', 'utf-8');

    const result = scanPromptFiles();
    const scriptEntry = result.find((e) => e.tags.includes('script'));
    expect(scriptEntry).toBeDefined();
  });

  it('reads settings.json as "config" tag', () => {
    fs.writeFileSync(path.join(claudeDir(), 'settings.json'), '{"permissions":[]}', 'utf-8');

    const result = scanPromptFiles();
    const settingsEntry = result.find((e) => e.id === 'settings-json');
    expect(settingsEntry).toBeDefined();
    expect(settingsEntry?.tags).toContain('config');
    expect(settingsEntry?.name).toBe('settings.json');
    expect(JSON.parse(settingsEntry!.content)).toEqual({ permissions: [] });
  });

  it('assigns incrementing version numbers', () => {
    fs.writeFileSync(path.join(claudeDir(), 'CLAUDE.md'), '# A\n', 'utf-8');
    fs.writeFileSync(path.join(claudeDir(), 'settings.json'), '{}', 'utf-8');

    const result = scanPromptFiles();
    const versions = result.map((e) => e.version);
    expect(new Set(versions).size).toBe(versions.length);
  });

  it('generates correct id from relative path', () => {
    fs.writeFileSync(path.join(claudeDir(), 'CLAUDE.md'), '# A\n', 'utf-8');

    const result = scanPromptFiles();
    expect(result[0].id).toBe('claude-md');
  });

  it('skips non-file entries in scripts dir (subdirectory)', () => {
    const scriptsDir = path.join(claudeDir(), 'scripts');
    fs.mkdirSync(scriptsDir);
    fs.mkdirSync(path.join(scriptsDir, 'subdir'));

    expect(() => scanPromptFiles()).not.toThrow();
    const result = scanPromptFiles();
    const scriptEntries = result.filter((e) => e.tags.includes('script'));
    expect(scriptEntries).toHaveLength(0);
  });

  it('handles missing skills directory gracefully', () => {
    // skills dir doesn't exist — should not throw
    expect(() => scanPromptFiles()).not.toThrow();
  });

  it('skips project memory when it is a file instead of directory', () => {
    const projDir = path.join(claudeDir(), 'projects', 'p1');
    fs.mkdirSync(projDir, { recursive: true });
    fs.writeFileSync(path.join(projDir, 'memory'), 'not-a-dir', 'utf-8');

    expect(() => scanPromptFiles()).not.toThrow();
    const result = scanPromptFiles();
    const memEntries = result.filter((e) => e.tags.includes('memory'));
    expect(memEntries).toHaveLength(0);
  });

  it('includes rules files and ignores non-.md files in rules dir', () => {
    const rulesDir = path.join(claudeDir(), 'rules');
    fs.mkdirSync(rulesDir);
    fs.writeFileSync(path.join(rulesDir, 'rule.md'), '# Rule\n', 'utf-8');
    fs.writeFileSync(path.join(rulesDir, 'not-a-rule.txt'), 'text file', 'utf-8');

    const result = scanPromptFiles();
    const ruleEntries = result.filter((e) => e.tags.includes('rule'));
    expect(ruleEntries).toHaveLength(1);
    expect(ruleEntries[0].name).toBe('rule');
  });
});

// ---------------------------------------------------------------------------
// PromptsApiHandler
// ---------------------------------------------------------------------------

describe('PromptsApiHandler.handleGet', () => {
  beforeEach(setupTmpHome);
  afterEach(teardownTmpHome);

  it('returns prompts list on success', () => {
    const handler = new PromptsApiHandler(makeLogger());
    const res = makeMockRes();
    handler.handleGet(res as unknown as http.ServerResponse);
    expect(res.statusCode).toBe(200);
    const body = res.parsedBody() as { prompts: unknown[] };
    expect(Array.isArray(body.prompts)).toBe(true);
  });

  it('returns cached result on second call (same TTL window)', () => {
    fs.writeFileSync(path.join(claudeDir(), 'CLAUDE.md'), '# A\n', 'utf-8');

    const handler = new PromptsApiHandler(makeLogger());
    const res1 = makeMockRes();
    handler.handleGet(res1 as unknown as http.ServerResponse);
    const first = (res1.parsedBody() as { prompts: unknown[] }).prompts;

    // Remove the file — cached result should still be returned
    fs.unlinkSync(path.join(claudeDir(), 'CLAUDE.md'));

    const res2 = makeMockRes();
    handler.handleGet(res2 as unknown as http.ServerResponse);
    const second = (res2.parsedBody() as { prompts: unknown[] }).prompts;

    expect(res1.statusCode).toBe(200);
    expect(res2.statusCode).toBe(200);
    expect(second).toEqual(first);
  });

  it('re-scans after TTL expires', () => {
    fs.writeFileSync(path.join(claudeDir(), 'CLAUDE.md'), '# A\n', 'utf-8');

    const handler = new PromptsApiHandler(makeLogger());
    const res1 = makeMockRes();
    handler.handleGet(res1 as unknown as http.ServerResponse);
    expect((res1.parsedBody() as { prompts: { name: string }[] }).prompts).toHaveLength(1);

    // Expire the cache
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (handler as any).cache.expiresAt = Date.now() - 1;

    // Remove the file so the second scan returns 0 entries
    fs.unlinkSync(path.join(claudeDir(), 'CLAUDE.md'));

    const res2 = makeMockRes();
    handler.handleGet(res2 as unknown as http.ServerResponse);
    expect((res2.parsedBody() as { prompts: unknown[] }).prompts).toHaveLength(0);
  });

  it('returns 500 on unexpected error from cache access', () => {
    const logger = makeLogger();
    const handler = new PromptsApiHandler(logger);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (handler as any).cache = {
      get value(): never { throw new Error('cache read error'); },
      expiresAt: Date.now() + 60_000,
    };
    const res = makeMockRes();
    handler.handleGet(res as unknown as http.ServerResponse);
    expect(res.statusCode).toBe(500);
    expect(logger.error).toHaveBeenCalledWith('[/api/trail/prompts] failed', expect.any(Error));
  });
});
