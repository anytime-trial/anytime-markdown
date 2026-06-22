import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { planSkillInstall, installSkills, SKILL_MARKER } from '../skillInstaller';

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
