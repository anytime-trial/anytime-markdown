import { extractSkillName } from '../skillModels';

describe('extractSkillName', () => {
  it('Skill tool call からスキル名を抽出する', () => {
    const json = JSON.stringify([{ name: 'Skill', input: { skill: 'resolve-issues' } }]);
    expect(extractSkillName(json)).toBe('resolve-issues');
  });

  it('Skill tool call がない場合 null を返す', () => {
    const json = JSON.stringify([{ name: 'Read', input: { file_path: '/foo' } }]);
    expect(extractSkillName(json)).toBeNull();
  });

  it('null 入力に対して null を返す', () => {
    expect(extractSkillName(null)).toBeNull();
  });
});
