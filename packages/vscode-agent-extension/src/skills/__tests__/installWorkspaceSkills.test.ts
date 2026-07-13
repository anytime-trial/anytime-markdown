import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { BUNDLED_STATIC_SKILLS } from '../bundledSkills';
import { installWorkspaceSkills } from '../installWorkspaceSkills';

/** 拡張の展開先＝このパッケージのルート（skills/ が同梱物の実体）。 */
const extensionPath = path.join(__dirname, '..', '..', '..');

describe('installWorkspaceSkills', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-skills-'));
  });

  afterEach(() => {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('.claude が無いワークスペースにも同梱スキルを配置する', () => {
    installWorkspaceSkills({
      workspaceRoot,
      extensionPath,
      noteStorageDir: path.join(workspaceRoot, '.anytime', 'notes'),
    });

    for (const skill of BUNDLED_STATIC_SKILLS) {
      const installed = path.join(workspaceRoot, '.claude', 'skills', skill.name, 'SKILL.md');
      expect(fs.existsSync(installed)).toBe(true);
    }
  });

  it('anytime-note はプレースホルダを展開して配置する', () => {
    const noteStorageDir = path.join(workspaceRoot, '.anytime', 'notes');
    installWorkspaceSkills({ workspaceRoot, extensionPath, noteStorageDir });

    const content = fs.readFileSync(
      path.join(workspaceRoot, '.claude', 'skills', 'anytime-note', 'SKILL.md'),
      'utf-8',
    );
    expect(content).toContain(noteStorageDir);
    expect(content).not.toContain('__NOTE_DIR__');
  });

  it('統合・改名で消えた旧スキル dir を掃除する', () => {
    const noteStorageDir = path.join(workspaceRoot, '.anytime', 'notes');
    const oldNames = BUNDLED_STATIC_SKILLS.flatMap((s) => s.oldNames ?? []);
    expect(oldNames).toContain('anytime-agent-rotation');
    expect(oldNames).toContain('anytime-delegation');
    expect(oldNames).toContain('codex-delegation');
    expect(oldNames).toContain('anytime-ollama-delegation');

    for (const oldName of oldNames) {
      const oldSkill = path.join(workspaceRoot, '.claude', 'skills', oldName, 'SKILL.md');
      fs.mkdirSync(path.dirname(oldSkill), { recursive: true });
      fs.writeFileSync(oldSkill, '旧スキル', 'utf-8');
    }

    installWorkspaceSkills({ workspaceRoot, extensionPath, noteStorageDir });

    for (const oldName of oldNames) {
      const oldDir = path.join(workspaceRoot, '.claude', 'skills', oldName);
      expect(fs.existsSync(oldDir)).toBe(false);
    }
  });

  it('ユーザーが編集したスキルは上書きしない', () => {
    const noteStorageDir = path.join(workspaceRoot, '.anytime', 'notes');
    const target = path.join(
      workspaceRoot,
      '.claude',
      'skills',
      'anytime-dev-cycle',
      'SKILL.md',
    );
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, 'ユーザーによる編集', 'utf-8');

    installWorkspaceSkills({ workspaceRoot, extensionPath, noteStorageDir });

    expect(fs.readFileSync(target, 'utf-8')).toBe('ユーザーによる編集');
  });
});
