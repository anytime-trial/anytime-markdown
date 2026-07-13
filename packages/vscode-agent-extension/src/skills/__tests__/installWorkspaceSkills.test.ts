import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { AGENT_SKILL_MARKER, BUNDLED_STATIC_SKILLS } from '../bundledSkills';
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

  /**
   * 版数ゲートの契約。
   *
   * 旧実装は「配置済みと差分があれば常に preserve」だったため、スキルを更新しても配布済み
   * コピーへ二度と届かず恒久 stale 化した（anytime-cross-review が旧 references パスを指したまま
   * 参照切れを起こした）。marker 未記録＝旧実装で配られた既存ワークスペースなので、
   * 一度だけ上書きして stale を治し、以後は版数が据え置かれている間だけローカル編集を保持する。
   */
  describe('版数ゲート', () => {
    const markerPath = () =>
      path.join(workspaceRoot, '.claude', 'skills', AGENT_SKILL_MARKER);
    const skillPath = () =>
      path.join(workspaceRoot, '.claude', 'skills', 'anytime-dev-cycle', 'SKILL.md');

    const seedDeployedSkill = (content: string): void => {
      fs.mkdirSync(path.dirname(skillPath()), { recursive: true });
      fs.writeFileSync(skillPath(), content, 'utf-8');
    };

    const readMarker = (): Record<string, number> =>
      JSON.parse(fs.readFileSync(markerPath(), 'utf-8')) as Record<string, number>;

    it('marker 未記録（旧実装で配られた既存ワークスペース）は stale を上書きして治す', () => {
      const noteStorageDir = path.join(workspaceRoot, '.anytime', 'notes');
      seedDeployedSkill('# 旧バージョンの stale なコピー\n');

      installWorkspaceSkills({ workspaceRoot, extensionPath, noteStorageDir });

      const bundled = fs.readFileSync(
        path.join(extensionPath, 'skills', 'anytime-dev-cycle', 'SKILL.md'),
        'utf-8',
      );
      expect(fs.readFileSync(skillPath(), 'utf-8')).toBe(bundled);
      expect(readMarker()['anytime-dev-cycle']).toBeGreaterThanOrEqual(1);
    });

    it('版数が据え置きならユーザーの編集を保持する', () => {
      const noteStorageDir = path.join(workspaceRoot, '.anytime', 'notes');

      // 1 回目: 正規配布を済ませて marker に版数を記録させる
      installWorkspaceSkills({ workspaceRoot, extensionPath, noteStorageDir });
      const recorded = readMarker()['anytime-dev-cycle'];
      expect(recorded).toBeGreaterThanOrEqual(1);

      // ユーザーがローカル編集し、版数を上げずに再 activate する
      fs.writeFileSync(skillPath(), 'ユーザーによる編集', 'utf-8');
      installWorkspaceSkills({ workspaceRoot, extensionPath, noteStorageDir });

      expect(fs.readFileSync(skillPath(), 'utf-8')).toBe('ユーザーによる編集');
      expect(readMarker()['anytime-dev-cycle']).toBe(recorded);
    });
  });
});
