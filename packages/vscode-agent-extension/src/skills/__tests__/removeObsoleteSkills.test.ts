import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { AGENT_SKILL_MARKER, BUNDLED_STATIC_SKILLS, OBSOLETE_AGENT_SKILL_NAMES } from '../bundledSkills';
import { installWorkspaceSkills, removeObsoleteSkills } from '../installWorkspaceSkills';

const extensionPath = path.join(__dirname, '..', '..', '..');

/**
 * 廃止スキル掃除の契約。
 *
 * oldNames（installStaticSkillDir）は marker を見ずに毎 activate で rmSync するため、廃止に流用すると
 * ユーザー自作や git 追跡の同名 dir まで消す（stock-cooccurrence で確認済みの罠）。廃止は本拡張が
 * 配置した記録（marker エントリ）がある dir だけを消し、消したら記録も外す。
 */
describe('removeObsoleteSkills', () => {
  let claudeDir: string;
  const skillsDir = () => path.join(claudeDir, 'skills');
  const markerPath = () => path.join(skillsDir(), AGENT_SKILL_MARKER);
  const seedSkill = (name: string): string => {
    const dir = path.join(skillsDir(), name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), `# ${name}\n`, 'utf-8');
    return dir;
  };
  const writeMarker = (m: Record<string, number>): void => {
    fs.mkdirSync(skillsDir(), { recursive: true });
    fs.writeFileSync(markerPath(), JSON.stringify(m), 'utf-8');
  };
  const readMarker = (): Record<string, number> =>
    JSON.parse(fs.readFileSync(markerPath(), 'utf-8')) as Record<string, number>;

  beforeEach(() => {
    claudeDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'agent-obsolete-')), '.claude');
  });

  afterEach(() => {
    fs.rmSync(path.dirname(claudeDir), { recursive: true, force: true });
  });

  it('marker に配置記録がある廃止スキルは dir を消し、記録も外す', () => {
    const dir = seedSkill('retired-skill');
    writeMarker({ 'retired-skill': 3, 'kept-skill': 1 });

    const removed = removeObsoleteSkills({ claudeDir, names: ['retired-skill'], bundled: {} });

    expect(removed).toEqual(['retired-skill']);
    expect(fs.existsSync(dir)).toBe(false);
    expect(readMarker()).toEqual({ 'kept-skill': 1 });
  });

  it('marker に記録が無い同名 dir はユーザー自作とみなして残す', () => {
    const dir = seedSkill('retired-skill');
    writeMarker({ 'kept-skill': 1 });

    const removed = removeObsoleteSkills({ claudeDir, names: ['retired-skill'], bundled: {} });

    expect(removed).toEqual([]);
    expect(fs.existsSync(dir)).toBe(true);
  });

  it('同梱 manifest にも載っている名前は消さない（廃止リストとの矛盾）', () => {
    const dir = seedSkill('retired-skill');
    writeMarker({ 'retired-skill': 3 });

    const removed = removeObsoleteSkills({ claudeDir, names: ['retired-skill'], bundled: { 'retired-skill': 4 } });

    expect(removed).toEqual([]);
    expect(fs.existsSync(dir)).toBe(true);
    expect(readMarker()).toEqual({ 'retired-skill': 3 });
  });

  it('dir が既に無くても記録だけ外す', () => {
    writeMarker({ 'retired-skill': 3 });

    removeObsoleteSkills({ claudeDir, names: ['retired-skill'], bundled: {} });

    expect(readMarker()).toEqual({});
  });

  it.each([
    ['不正な JSON', '{ broken'],
    ['配列', '["retired-skill"]'],
  ])('marker が壊れている（%s）ときは何も消さない', (_label, raw) => {
    const dir = seedSkill('retired-skill');
    fs.writeFileSync(markerPath(), raw, 'utf-8');

    const removed = removeObsoleteSkills({ claudeDir, names: ['retired-skill'], bundled: {} });

    expect(removed).toEqual([]);
    expect(fs.existsSync(dir)).toBe(true);
    expect(fs.readFileSync(markerPath(), 'utf-8')).toBe(raw);
  });

  it('削除対象が無ければ marker も他拡張の marker も書き換えない', () => {
    writeMarker({ 'kept-skill': 1 });
    const otherMarker = path.join(skillsDir(), '.anytime-skills.json');
    fs.writeFileSync(otherMarker, JSON.stringify({ 'retired-skill': 2 }), 'utf-8');
    const before = fs.readFileSync(markerPath(), 'utf-8');

    removeObsoleteSkills({ claudeDir, names: ['retired-skill'], bundled: {} });

    expect(fs.readFileSync(markerPath(), 'utf-8')).toBe(before);
    expect(JSON.parse(fs.readFileSync(otherMarker, 'utf-8'))).toEqual({ 'retired-skill': 2 });
  });

  it('パス区切りを含む名前は skills/ の外を指し得るため無視する', () => {
    const outside = path.join(claudeDir, 'outside');
    fs.mkdirSync(outside, { recursive: true });
    writeMarker({ '../outside': 1 });

    const removed = removeObsoleteSkills({ claudeDir, names: ['../outside'], bundled: {} });

    expect(removed).toEqual([]);
    expect(fs.existsSync(outside)).toBe(true);
  });
});

describe('OBSOLETE_AGENT_SKILL_NAMES', () => {
  it('同梱スキル（旧名を含む）と重複しない', () => {
    const live = new Set(BUNDLED_STATIC_SKILLS.flatMap((s) => [s.name, ...(s.oldNames ?? [])]));
    live.add('anytime-note');
    for (const name of OBSOLETE_AGENT_SKILL_NAMES) expect(live.has(name)).toBe(false);
  });

  it('activate 時に配置記録のある anytime-build-webapp を掃除する', () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-obsolete-ws-'));
    try {
      const skills = path.join(workspaceRoot, '.claude', 'skills');
      fs.mkdirSync(path.join(skills, 'anytime-build-webapp'), { recursive: true });
      fs.writeFileSync(path.join(skills, 'anytime-build-webapp', 'SKILL.md'), '# old\n', 'utf-8');
      fs.writeFileSync(path.join(skills, AGENT_SKILL_MARKER), JSON.stringify({ 'anytime-build-webapp': 10 }), 'utf-8');

      installWorkspaceSkills({ workspaceRoot, extensionPath, noteStorageDir: path.join(workspaceRoot, 'notes') });

      expect(fs.existsSync(path.join(skills, 'anytime-build-webapp'))).toBe(false);
      const marker = JSON.parse(fs.readFileSync(path.join(skills, AGENT_SKILL_MARKER), 'utf-8')) as Record<string, number>;
      expect(marker['anytime-build-webapp']).toBeUndefined();
    } finally {
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });
});
