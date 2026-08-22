import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  planSkillInstall,
  installSkills,
  isSafeSkillName,
  SKILL_MARKER,
  OBSOLETE_SKILL_NAMES,
} from '../skillInstaller';

describe('planSkillInstall', () => {
  it('plans all skills as new when nothing is installed', () => {
    const plan = planSkillInstall({ a: 1, b: 2 }, {});
    expect(plan.map((p) => p.name).sort()).toEqual(['a', 'b']);
    expect(plan.every((p) => p.reason === 'new' && p.from === null)).toBe(true);
  });

  it('skips skills already at the bundled version', () => {
    const plan = planSkillInstall({ a: 1, b: 2 }, { a: 1 });
    expect(plan.map((p) => p.name)).toEqual(['b']);
  });

  it('plans an update when the bundled version is newer', () => {
    const plan = planSkillInstall({ a: 2 }, { a: 1 });
    expect(plan).toEqual([{ name: 'a', reason: 'update', from: 1, to: 2 }]);
  });

  it('does not downgrade when installed version is newer', () => {
    expect(planSkillInstall({ a: 1 }, { a: 2 })).toEqual([]);
  });
});

describe('installSkills', () => {
  function setupExtension(manifest: Record<string, number>): string {
    const ext = fs.mkdtempSync(path.join(os.tmpdir(), 'ext-'));
    const skillsDir = path.join(ext, 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });
    fs.writeFileSync(path.join(skillsDir, 'manifest.json'), JSON.stringify(manifest));
    for (const name of Object.keys(manifest)) {
      const d = path.join(skillsDir, name);
      fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(path.join(d, 'SKILL.md'), `# ${name}\n`);
    }
    return ext;
  }

  it('copies bundled skills into <workspace>/.claude/skills and writes a marker', () => {
    const ext = setupExtension({ 'anytime-mermaid': 1 });
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-'));
    try {
      const logs: string[] = [];
      const res = installSkills({ extensionFsPath: ext, workspaceFsPath: ws, log: (l, m) => logs.push(`${l}:${m}`) });
      expect(res.installed.map((i) => i.name)).toEqual(['anytime-mermaid']);
      const dest = path.join(ws, '.claude', 'skills', 'anytime-mermaid', 'SKILL.md');
      expect(fs.readFileSync(dest, 'utf8')).toContain('anytime-mermaid');
      const marker = JSON.parse(fs.readFileSync(path.join(ws, '.claude', 'skills', SKILL_MARKER), 'utf8'));
      expect(marker['anytime-mermaid']).toBe(1);
    } finally {
      fs.rmSync(ext, { recursive: true });
      fs.rmSync(ws, { recursive: true });
    }
  });

  it('copies reference subfiles (references/) alongside SKILL.md', () => {
    const ext = fs.mkdtempSync(path.join(os.tmpdir(), 'ext-'));
    const skillsDir = path.join(ext, 'skills');
    fs.mkdirSync(path.join(skillsDir, 'anytime-doc-authoring', 'references'), { recursive: true });
    fs.writeFileSync(path.join(skillsDir, 'manifest.json'), JSON.stringify({ 'anytime-doc-authoring': 1 }));
    fs.writeFileSync(path.join(skillsDir, 'anytime-doc-authoring', 'SKILL.md'), '# doc-authoring\n');
    fs.writeFileSync(
      path.join(skillsDir, 'anytime-doc-authoring', 'references', 'writing-standards.ja.md'),
      '# 文章規範\n',
    );
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-'));
    try {
      installSkills({ extensionFsPath: ext, workspaceFsPath: ws, log: () => {} });
      const ref = path.join(ws, '.claude', 'skills', 'anytime-doc-authoring', 'references', 'writing-standards.ja.md');
      expect(fs.existsSync(ref)).toBe(true);
      expect(fs.readFileSync(ref, 'utf8')).toContain('文章規範');
    } finally {
      fs.rmSync(ext, { recursive: true });
      fs.rmSync(ws, { recursive: true });
    }
  });

  it('is a no-op on the second run (idempotent by version)', () => {
    const ext = setupExtension({ 'anytime-mermaid': 1 });
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-'));
    try {
      installSkills({ extensionFsPath: ext, workspaceFsPath: ws, log: () => {} });
      const second = installSkills({ extensionFsPath: ext, workspaceFsPath: ws, log: () => {} });
      expect(second.installed).toEqual([]);
    } finally {
      fs.rmSync(ext, { recursive: true });
      fs.rmSync(ws, { recursive: true });
    }
  });

  it('re-copies with force even when versions match', () => {
    const ext = setupExtension({ 'anytime-mermaid': 1 });
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-'));
    try {
      installSkills({ extensionFsPath: ext, workspaceFsPath: ws, log: () => {} });
      const forced = installSkills({ extensionFsPath: ext, workspaceFsPath: ws, force: true, log: () => {} });
      expect(forced.installed.map((i) => i.name)).toEqual(['anytime-mermaid']);
    } finally {
      fs.rmSync(ext, { recursive: true });
      fs.rmSync(ws, { recursive: true });
    }
  });

  it('rejects unsafe skill names (path traversal) without copying outside the skills dir', () => {
    const ext = setupExtension({ 'anytime-mermaid': 1 });
    // 不正名を manifest に注入（同梱は信頼境界内だが defense-in-depth を検証）
    const manifestPath = path.join(ext, 'skills', 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify({ '../evil': 1, 'anytime-mermaid': 1 }));
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-'));
    try {
      const logs: Array<[string, string]> = [];
      const res = installSkills({ extensionFsPath: ext, workspaceFsPath: ws, log: (l, m) => logs.push([l, m]) });
      expect(res.installed.map((i) => i.name)).toEqual(['anytime-mermaid']);
      expect(logs.some(([l, m]) => l === 'error' && m.includes('../evil'))).toBe(true);
      expect(fs.existsSync(path.join(ws, 'evil'))).toBe(false);
    } finally {
      fs.rmSync(ext, { recursive: true });
      fs.rmSync(ws, { recursive: true });
    }
  });

  it('isSafeSkillName accepts plain names and rejects traversal', () => {
    expect(isSafeSkillName('anytime-mermaid')).toBe(true);
    expect(isSafeSkillName('../evil')).toBe(false);
    expect(isSafeSkillName('a/b')).toBe(false);
    expect(isSafeSkillName('')).toBe(false);
  });

  it('removes obsolete skill dirs and their marker entries', () => {
    const ext = setupExtension({ 'anytime-markdown-usage': 6 });
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-'));
    try {
      const skillsDest = path.join(ws, '.claude', 'skills');
      fs.mkdirSync(path.join(skillsDest, 'anytime-spec-lookup'), { recursive: true });
      fs.writeFileSync(path.join(skillsDest, 'anytime-spec-lookup', 'SKILL.md'), '# old\n');
      fs.writeFileSync(
        path.join(skillsDest, SKILL_MARKER),
        JSON.stringify({ 'anytime-spec-lookup': 3, 'anytime-markdown-usage': 5 }),
      );
      const res = installSkills({
        extensionFsPath: ext,
        workspaceFsPath: ws,
        obsoleteSkillNames: ['anytime-spec-lookup'],
        log: () => {},
      });
      expect(res.removedOld).toEqual(['anytime-spec-lookup']);
      expect(fs.existsSync(path.join(skillsDest, 'anytime-spec-lookup'))).toBe(false);
      const marker = JSON.parse(fs.readFileSync(path.join(skillsDest, SKILL_MARKER), 'utf8'));
      expect(marker['anytime-spec-lookup']).toBeUndefined();
      expect(marker['anytime-markdown-usage']).toBe(6);
    } finally {
      fs.rmSync(ext, { recursive: true });
      fs.rmSync(ws, { recursive: true });
    }
  });

  it('cleans obsolete marker entries even when no install is needed', () => {
    const ext = setupExtension({ 'anytime-markdown-usage': 6 });
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-'));
    try {
      const skillsDest = path.join(ws, '.claude', 'skills');
      fs.mkdirSync(skillsDest, { recursive: true });
      // dir は既に無く marker 残留だけがあるケース。install 計画も空（版数一致）。
      fs.writeFileSync(
        path.join(skillsDest, SKILL_MARKER),
        JSON.stringify({ 'anytime-spec-lookup': 3, 'anytime-markdown-usage': 6 }),
      );
      const res = installSkills({
        extensionFsPath: ext,
        workspaceFsPath: ws,
        obsoleteSkillNames: ['anytime-spec-lookup'],
        log: () => {},
      });
      expect(res.installed).toEqual([]);
      const marker = JSON.parse(fs.readFileSync(path.join(skillsDest, SKILL_MARKER), 'utf8'));
      expect(marker['anytime-spec-lookup']).toBeUndefined();
      expect(res.removedOld).toEqual([]);
    } finally {
      fs.rmSync(ext, { recursive: true });
      fs.rmSync(ws, { recursive: true });
    }
  });

  it('never removes an obsolete name that is still in the bundled manifest', () => {
    const ext = setupExtension({ 'anytime-markdown-usage': 6 });
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-'));
    try {
      const logs: Array<[string, string]> = [];
      installSkills({
        extensionFsPath: ext,
        workspaceFsPath: ws,
        obsoleteSkillNames: ['anytime-markdown-usage'],
        log: (l, m) => logs.push([l, m]),
      });
      const dest = path.join(ws, '.claude', 'skills', 'anytime-markdown-usage', 'SKILL.md');
      expect(fs.existsSync(dest)).toBe(true);
      expect(logs.some(([l, m]) => l === 'error' && m.includes('anytime-markdown-usage'))).toBe(true);
    } finally {
      fs.rmSync(ext, { recursive: true });
      fs.rmSync(ws, { recursive: true });
    }
  });

  it('applies the default obsolete list (anytime-spec-lookup) when the option is omitted', () => {
    expect(OBSOLETE_SKILL_NAMES).toContain('anytime-spec-lookup');
    const ext = setupExtension({ 'anytime-markdown-usage': 6 });
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-'));
    try {
      const skillsDest = path.join(ws, '.claude', 'skills');
      fs.mkdirSync(path.join(skillsDest, 'anytime-spec-lookup'), { recursive: true });
      fs.writeFileSync(path.join(skillsDest, 'anytime-spec-lookup', 'SKILL.md'), '# old\n');
      fs.writeFileSync(path.join(skillsDest, SKILL_MARKER), JSON.stringify({ 'anytime-spec-lookup': 3 }));
      const res = installSkills({ extensionFsPath: ext, workspaceFsPath: ws, log: () => {} });
      expect(res.removedOld).toEqual(['anytime-spec-lookup']);
      expect(fs.existsSync(path.join(skillsDest, 'anytime-spec-lookup'))).toBe(false);
    } finally {
      fs.rmSync(ext, { recursive: true });
      fs.rmSync(ws, { recursive: true });
    }
  });

  it('leaves an obsolete-named dir untouched when the marker has no record of installing it', () => {
    // 本拡張が配置した記録（marker エントリ）が無い同名 dir は、ユーザー自作や他経路の
    // 配置物とみなして削除しない。
    const ext = setupExtension({ 'anytime-markdown-usage': 6 });
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-'));
    try {
      const skillsDest = path.join(ws, '.claude', 'skills');
      fs.mkdirSync(path.join(skillsDest, 'anytime-spec-lookup'), { recursive: true });
      fs.writeFileSync(path.join(skillsDest, 'anytime-spec-lookup', 'SKILL.md'), '# hand-written\n');
      const res = installSkills({
        extensionFsPath: ext,
        workspaceFsPath: ws,
        obsoleteSkillNames: ['anytime-spec-lookup'],
        log: () => {},
      });
      expect(res.removedOld).toEqual([]);
      expect(fs.existsSync(path.join(skillsDest, 'anytime-spec-lookup', 'SKILL.md'))).toBe(true);
    } finally {
      fs.rmSync(ext, { recursive: true });
      fs.rmSync(ws, { recursive: true });
    }
  });

  it('does not print the up-to-date message when it only removed an obsolete skill', () => {
    const ext = setupExtension({ 'anytime-markdown-usage': 6 });
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-'));
    try {
      const skillsDest = path.join(ws, '.claude', 'skills');
      fs.mkdirSync(path.join(skillsDest, 'anytime-spec-lookup'), { recursive: true });
      fs.writeFileSync(path.join(skillsDest, 'anytime-spec-lookup', 'SKILL.md'), '# old\n');
      // usage は版数一致で install 計画なし・廃止削除だけが起きる状況
      fs.writeFileSync(
        path.join(skillsDest, SKILL_MARKER),
        JSON.stringify({ 'anytime-spec-lookup': 3, 'anytime-markdown-usage': 6 }),
      );
      const logs: string[] = [];
      installSkills({
        extensionFsPath: ext,
        workspaceFsPath: ws,
        obsoleteSkillNames: ['anytime-spec-lookup'],
        log: (_l, m) => logs.push(m),
      });
      expect(logs.some((m) => m.includes('最新です'))).toBe(false);
      expect(logs.some((m) => m.includes('廃止スキル削除'))).toBe(true);
    } finally {
      fs.rmSync(ext, { recursive: true });
      fs.rmSync(ws, { recursive: true });
    }
  });

  it('logs an error when the manifest is missing', () => {
    const ext = fs.mkdtempSync(path.join(os.tmpdir(), 'ext-'));
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-'));
    try {
      const logs: Array<[string, string]> = [];
      const res = installSkills({ extensionFsPath: ext, workspaceFsPath: ws, log: (l, m) => logs.push([l, m]) });
      expect(res.installed).toEqual([]);
      expect(logs.some(([l]) => l === 'error')).toBe(true);
    } finally {
      fs.rmSync(ext, { recursive: true });
      fs.rmSync(ws, { recursive: true });
    }
  });
});
