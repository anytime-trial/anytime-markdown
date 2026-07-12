import * as fs from 'node:fs';
import * as path from 'node:path';
import { BUNDLED_STATIC_SKILLS } from '../bundledSkills';

/** テンプレート展開のため installTemplatedSkill 側で扱うスキル（静的展開の対象外）。 */
const TEMPLATED_SKILLS = new Set(['anytime-note']);

const skillsDir = path.join(__dirname, '..', '..', '..', 'skills');

/**
 * 同梱 dir と配線リストのドリフトを検知する。
 *
 * skills/ に置いただけで配線を忘れると、vsix には入るのに配置されないスキルができる。
 * 逆に配線だけして同梱を忘れると、installStaticSkillDir が sourceMissing で無言の no-op になる。
 */
describe('BUNDLED_STATIC_SKILLS', () => {
  it('配線した全スキルが skills/<name>/SKILL.md として同梱されている', () => {
    for (const skill of BUNDLED_STATIC_SKILLS) {
      const skillMd = path.join(skillsDir, skill.name, 'SKILL.md');
      expect(fs.existsSync(skillMd)).toBe(true);
    }
  });

  it('同梱した全スキルが配線されている（テンプレート展開スキルを除く）', () => {
    const bundled = fs
      .readdirSync(skillsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !TEMPLATED_SKILLS.has(e.name))
      .map((e) => e.name)
      .sort();
    const wired = BUNDLED_STATIC_SKILLS.map((s) => s.name).sort();
    expect(wired).toEqual(bundled);
  });
});
