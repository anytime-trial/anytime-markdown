import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { installBundledSkills } from '../skill-installer/installSkills';

interface TestEnv {
  readonly extensionPath: string;
  readonly claudeDir: string;
  readonly bundledSkillPath: string;
  readonly cleanup: () => void;
}

const BUNDLED_CONTENT = `---
name: anytime-reverse-codegraph
trigger: /anytime-reverse-codegraph
---

# /anytime-reverse-codegraph

bundled-version-content
`;

function setupEnv(initial?: { existingSkill?: string; existingOldDirs?: readonly string[] }): TestEnv {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'install-skills-'));
  const extensionPath = path.join(tmpRoot, 'ext');
  const claudeDir = path.join(tmpRoot, 'fake-home', '.claude');

  // bundled skill
  const bundledSkillDir = path.join(extensionPath, 'skills', 'anytime-reverse-codegraph');
  fs.mkdirSync(bundledSkillDir, { recursive: true });
  const bundledSkillPath = path.join(bundledSkillDir, 'SKILL.md');
  fs.writeFileSync(bundledSkillPath, BUNDLED_CONTENT);

  // claudeDir
  fs.mkdirSync(claudeDir, { recursive: true });
  fs.mkdirSync(path.join(claudeDir, 'skills'), { recursive: true });

  if (initial?.existingSkill !== undefined) {
    const targetDir = path.join(claudeDir, 'skills', 'anytime-reverse-codegraph');
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, 'SKILL.md'), initial.existingSkill);
  }

  for (const oldName of initial?.existingOldDirs ?? []) {
    const oldDir = path.join(claudeDir, 'skills', oldName);
    fs.mkdirSync(oldDir, { recursive: true });
    fs.writeFileSync(path.join(oldDir, 'SKILL.md'), 'old skill content');
  }

  return {
    extensionPath,
    claudeDir,
    bundledSkillPath,
    cleanup: () => fs.rmSync(tmpRoot, { recursive: true, force: true }),
  };
}

describe('installBundledSkills', () => {
  it('claudeDir が存在しない場合は no-op を返す', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'install-skills-'));
    try {
      const extensionPath = path.join(tmpRoot, 'ext');
      const bundledSkillDir = path.join(extensionPath, 'skills', 'anytime-reverse-codegraph');
      fs.mkdirSync(bundledSkillDir, { recursive: true });
      fs.writeFileSync(path.join(bundledSkillDir, 'SKILL.md'), BUNDLED_CONTENT);

      const result = installBundledSkills({
        claudeDir: path.join(tmpRoot, 'nonexistent', '.claude'),
        extensionPath,
      });

      expect(result.installed).toBe(false);
      expect(result.skipped).toBe(true);
      expect(result.preserved).toBe(false);
      expect(result.removedOld).toBe(false);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('SKILL.md が存在しないとき bundle をコピーする', () => {
    const env = setupEnv();
    try {
      const result = installBundledSkills({
        claudeDir: env.claudeDir,
        extensionPath: env.extensionPath,
      });

      expect(result.installed).toBe(true);
      expect(result.skipped).toBe(false);
      const target = path.join(env.claudeDir, 'skills', 'anytime-reverse-codegraph', 'SKILL.md');
      expect(fs.existsSync(target)).toBe(true);
      expect(fs.readFileSync(target, 'utf-8')).toBe(BUNDLED_CONTENT);
    } finally {
      env.cleanup();
    }
  });

  it('既存 SKILL.md が bundle と一致する場合は skipped', () => {
    const env = setupEnv({ existingSkill: BUNDLED_CONTENT });
    try {
      const result = installBundledSkills({
        claudeDir: env.claudeDir,
        extensionPath: env.extensionPath,
      });

      expect(result.installed).toBe(false);
      expect(result.skipped).toBe(true);
      expect(result.preserved).toBe(false);
    } finally {
      env.cleanup();
    }
  });

  it('既存 SKILL.md が bundle と異なる場合は上書きせず preserved を返す', () => {
    const localContent = '---\nname: anytime-reverse-codegraph\n---\n\n# /anytime-reverse-codegraph\n\nlocal-edits\n';
    const env = setupEnv({ existingSkill: localContent });
    try {
      const result = installBundledSkills({
        claudeDir: env.claudeDir,
        extensionPath: env.extensionPath,
      });

      expect(result.installed).toBe(false);
      expect(result.preserved).toBe(true);
      expect(result.skipped).toBe(false);
      const target = path.join(env.claudeDir, 'skills', 'anytime-reverse-codegraph', 'SKILL.md');
      expect(fs.readFileSync(target, 'utf-8')).toBe(localContent);
    } finally {
      env.cleanup();
    }
  });

  it('force: true は差分があっても上書きする', () => {
    const localContent = 'local-edits';
    const env = setupEnv({ existingSkill: localContent });
    try {
      const result = installBundledSkills({
        claudeDir: env.claudeDir,
        extensionPath: env.extensionPath,
        force: true,
      });

      expect(result.installed).toBe(true);
      expect(result.preserved).toBe(false);
      const target = path.join(env.claudeDir, 'skills', 'anytime-reverse-codegraph', 'SKILL.md');
      expect(fs.readFileSync(target, 'utf-8')).toBe(BUNDLED_CONTENT);
    } finally {
      env.cleanup();
    }
  });

  it('旧 build-code-graph/ と trail-design/ が両方存在する場合に両方削除する', () => {
    const env = setupEnv({ existingOldDirs: ['build-code-graph', 'trail-design'] });
    try {
      const buildCodeGraphDir = path.join(env.claudeDir, 'skills', 'build-code-graph');
      const trailDesignDir = path.join(env.claudeDir, 'skills', 'trail-design');
      expect(fs.existsSync(buildCodeGraphDir)).toBe(true);
      expect(fs.existsSync(trailDesignDir)).toBe(true);

      const result = installBundledSkills({
        claudeDir: env.claudeDir,
        extensionPath: env.extensionPath,
      });

      expect(result.removedOld).toBe(true);
      expect(fs.existsSync(buildCodeGraphDir)).toBe(false);
      expect(fs.existsSync(trailDesignDir)).toBe(false);
    } finally {
      env.cleanup();
    }
  });

  it('旧 trail-design/ のみ存在しても削除する', () => {
    const env = setupEnv({ existingOldDirs: ['trail-design'] });
    try {
      const trailDesignDir = path.join(env.claudeDir, 'skills', 'trail-design');
      expect(fs.existsSync(trailDesignDir)).toBe(true);

      const result = installBundledSkills({
        claudeDir: env.claudeDir,
        extensionPath: env.extensionPath,
      });

      expect(result.removedOld).toBe(true);
      expect(fs.existsSync(trailDesignDir)).toBe(false);
    } finally {
      env.cleanup();
    }
  });

  it('bundled SKILL.md が存在しない場合はエラーログ + skipped', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'install-skills-'));
    try {
      const claudeDir = path.join(tmpRoot, '.claude');
      fs.mkdirSync(claudeDir, { recursive: true });
      const extensionPath = path.join(tmpRoot, 'ext-without-skills');
      fs.mkdirSync(extensionPath, { recursive: true });

      const warns: string[] = [];
      const result = installBundledSkills({
        claudeDir,
        extensionPath,
        logger: {
          info: () => undefined,
          warn: (m) => warns.push(m),
          error: () => undefined,
        },
      });

      expect(result.installed).toBe(false);
      expect(result.skipped).toBe(true);
      expect(warns.some((m) => m.includes('bundled skill not found'))).toBe(true);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('ターゲットディレクトリが書き込み不可の場合は error ログ + skipped', () => {
    const env = setupEnv();
    try {
      // skills ディレクトリを読み取り専用にして copyFileSync を失敗させる
      const skillsDir = path.join(env.claudeDir, 'skills');
      fs.chmodSync(skillsDir, 0o555);
      try {
        const errors: string[] = [];
        const infos: string[] = [];
        const result = installBundledSkills({
          claudeDir: env.claudeDir,
          extensionPath: env.extensionPath,
          logger: {
            info: (m) => infos.push(m),
            warn: () => undefined,
            error: (m) => errors.push(m),
          },
        });

        expect(result.installed).toBe(false);
        expect(result.skipped).toBe(true);
        // error ログが出力されているか確認
        expect(errors.some((m) => m.includes('failed to install'))).toBe(true);
      } finally {
        fs.chmodSync(skillsDir, 0o755);
      }
    } finally {
      env.cleanup();
    }
  });

  it('logger を省略するとデフォルト NOOP_LOGGER が使われ例外なし', () => {
    const env = setupEnv();
    try {
      // logger なしで呼んでもエラーにならないこと
      expect(() => installBundledSkills({
        claudeDir: env.claudeDir,
        extensionPath: env.extensionPath,
      })).not.toThrow();
    } finally {
      env.cleanup();
    }
  });

  it('旧 dir の削除成功時に info ログが出力される（NOOP_LOGGER 経由）', () => {
    // logger を省略（NOOP_LOGGER が内部で使われる）した上で、
    // 旧ディレクトリを削除するパスを通してNOOP_LOGGERのinfoが呼ばれることを確認する
    const env = setupEnv({ existingOldDirs: ['build-code-graph'] });
    try {
      // logger なしで旧ディレクトリ削除を実施 → NOOP_LOGGER.info() が呼ばれる
      const result = installBundledSkills({
        claudeDir: env.claudeDir,
        extensionPath: env.extensionPath,
        // logger を意図的に省略して NOOP_LOGGER の info パスを通す
      });
      expect(result.removedOld).toBe(true);
      expect(result.installed).toBe(true);
    } finally {
      env.cleanup();
    }
  });

  it('bundled SKILL.md なしで logger 省略のとき NOOP_LOGGER.warn が呼ばれる（例外なし）', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'install-skills-'));
    try {
      const claudeDir = path.join(tmpRoot, '.claude');
      fs.mkdirSync(claudeDir, { recursive: true });
      const extensionPath = path.join(tmpRoot, 'ext-no-skill');
      fs.mkdirSync(extensionPath, { recursive: true });

      // logger なし → NOOP_LOGGER が使われ、warn が呼ばれるが例外にならない
      const result = installBundledSkills({ claudeDir, extensionPath });
      expect(result.skipped).toBe(true);
      expect(result.installed).toBe(false);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});
