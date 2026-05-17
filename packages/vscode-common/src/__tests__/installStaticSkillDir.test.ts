import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { installStaticSkillDir } from '../skill-installer/installSkills';

interface TestEnv {
  readonly extensionPath: string;
  readonly claudeDir: string;
  readonly cleanup: () => void;
}

const SKILL_NAME = 'anytime-reverse-spec';
const SKILL_MD = '# SKILL\nbody\n';
const TEMPLATE_A = '# template A\n';
const TEMPLATE_B = '# template B\n';

function setupEnv(opts?: {
  existingFiles?: Readonly<Record<string, string>>;
}): TestEnv {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'install-static-skill-dir-'));
  const extensionPath = path.join(tmpRoot, 'ext');
  const claudeDir = path.join(tmpRoot, 'fake-home', '.claude');

  const bundledDir = path.join(extensionPath, 'skills', SKILL_NAME);
  fs.mkdirSync(path.join(bundledDir, 'templates'), { recursive: true });
  fs.writeFileSync(path.join(bundledDir, 'SKILL.md'), SKILL_MD);
  fs.writeFileSync(path.join(bundledDir, 'templates', 'a.md'), TEMPLATE_A);
  fs.writeFileSync(path.join(bundledDir, 'templates', 'b.md'), TEMPLATE_B);

  fs.mkdirSync(path.join(claudeDir, 'skills'), { recursive: true });

  if (opts?.existingFiles) {
    const targetDir = path.join(claudeDir, 'skills', SKILL_NAME);
    for (const [rel, content] of Object.entries(opts.existingFiles)) {
      const p = path.join(targetDir, rel);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, content);
    }
  }

  return {
    extensionPath,
    claudeDir,
    cleanup: () => fs.rmSync(tmpRoot, { recursive: true, force: true }),
  };
}

describe('installStaticSkillDir', () => {
  it('claudeDir が無いと no-op を返す', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'install-static-skill-dir-'));
    try {
      const extensionPath = path.join(tmpRoot, 'ext');
      fs.mkdirSync(path.join(extensionPath, 'skills', SKILL_NAME), { recursive: true });
      fs.writeFileSync(path.join(extensionPath, 'skills', SKILL_NAME, 'SKILL.md'), SKILL_MD);

      const result = installStaticSkillDir({
        claudeDir: path.join(tmpRoot, 'nonexistent', '.claude'),
        extensionPath,
        skillName: SKILL_NAME,
      });

      expect(result.installed).toBe(0);
      expect(result.preserved).toBe(0);
      expect(result.upToDate).toBe(0);
      expect(result.sourceMissing).toBe(true);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('bundled スキルディレクトリが無いと warn ログ + sourceMissing', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'install-static-skill-dir-'));
    try {
      const claudeDir = path.join(tmpRoot, '.claude');
      fs.mkdirSync(path.join(claudeDir, 'skills'), { recursive: true });
      const extensionPath = path.join(tmpRoot, 'ext-without-skill');
      fs.mkdirSync(extensionPath, { recursive: true });

      const warns: string[] = [];
      const result = installStaticSkillDir({
        claudeDir,
        extensionPath,
        skillName: SKILL_NAME,
        logger: {
          info: () => undefined,
          warn: (m) => warns.push(m),
          error: () => undefined,
        },
      });

      expect(result.sourceMissing).toBe(true);
      expect(result.installed).toBe(0);
      expect(warns.some((m) => m.includes('bundled skill dir not found'))).toBe(true);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('既存ターゲットが無いとき bundled ファイル全部をコピーする', () => {
    const env = setupEnv();
    try {
      const result = installStaticSkillDir({
        claudeDir: env.claudeDir,
        extensionPath: env.extensionPath,
        skillName: SKILL_NAME,
      });

      expect(result.installed).toBe(3);
      expect(result.preserved).toBe(0);
      expect(result.upToDate).toBe(0);
      expect(result.sourceMissing).toBe(false);

      const targetDir = path.join(env.claudeDir, 'skills', SKILL_NAME);
      expect(fs.readFileSync(path.join(targetDir, 'SKILL.md'), 'utf-8')).toBe(SKILL_MD);
      expect(fs.readFileSync(path.join(targetDir, 'templates', 'a.md'), 'utf-8')).toBe(TEMPLATE_A);
      expect(fs.readFileSync(path.join(targetDir, 'templates', 'b.md'), 'utf-8')).toBe(TEMPLATE_B);
    } finally {
      env.cleanup();
    }
  });

  it('全ファイルが bundled と一致するときは upToDate のみカウント', () => {
    const env = setupEnv({
      existingFiles: {
        'SKILL.md': SKILL_MD,
        'templates/a.md': TEMPLATE_A,
        'templates/b.md': TEMPLATE_B,
      },
    });
    try {
      const result = installStaticSkillDir({
        claudeDir: env.claudeDir,
        extensionPath: env.extensionPath,
        skillName: SKILL_NAME,
      });

      expect(result.installed).toBe(0);
      expect(result.preserved).toBe(0);
      expect(result.upToDate).toBe(3);
    } finally {
      env.cleanup();
    }
  });

  it('差分があるファイルは preserve、無いものは copy（per-file 判定）', () => {
    const env = setupEnv({
      existingFiles: {
        'templates/a.md': '# locally edited a\n',
      },
    });
    try {
      const result = installStaticSkillDir({
        claudeDir: env.claudeDir,
        extensionPath: env.extensionPath,
        skillName: SKILL_NAME,
      });

      expect(result.installed).toBe(2);
      expect(result.preserved).toBe(1);
      expect(result.upToDate).toBe(0);

      const targetDir = path.join(env.claudeDir, 'skills', SKILL_NAME);
      expect(fs.readFileSync(path.join(targetDir, 'templates', 'a.md'), 'utf-8')).toBe('# locally edited a\n');
      expect(fs.readFileSync(path.join(targetDir, 'SKILL.md'), 'utf-8')).toBe(SKILL_MD);
      expect(fs.readFileSync(path.join(targetDir, 'templates', 'b.md'), 'utf-8')).toBe(TEMPLATE_B);
    } finally {
      env.cleanup();
    }
  });

  it('force: true は差分ありでも全部上書き、preserve は 0', () => {
    const env = setupEnv({
      existingFiles: {
        'SKILL.md': '# locally edited SKILL\n',
        'templates/a.md': '# locally edited a\n',
      },
    });
    try {
      const result = installStaticSkillDir({
        claudeDir: env.claudeDir,
        extensionPath: env.extensionPath,
        skillName: SKILL_NAME,
        force: true,
      });

      expect(result.installed).toBe(3);
      expect(result.preserved).toBe(0);

      const targetDir = path.join(env.claudeDir, 'skills', SKILL_NAME);
      expect(fs.readFileSync(path.join(targetDir, 'SKILL.md'), 'utf-8')).toBe(SKILL_MD);
      expect(fs.readFileSync(path.join(targetDir, 'templates', 'a.md'), 'utf-8')).toBe(TEMPLATE_A);
    } finally {
      env.cleanup();
    }
  });

  it('oldSkillNames で渡した旧 dir を削除する', () => {
    const env = setupEnv();
    try {
      const oldDir = path.join(env.claudeDir, 'skills', 'anytime-basic-design');
      fs.mkdirSync(oldDir, { recursive: true });
      fs.writeFileSync(path.join(oldDir, 'SKILL.md'), '# old\n');

      const result = installStaticSkillDir({
        claudeDir: env.claudeDir,
        extensionPath: env.extensionPath,
        skillName: SKILL_NAME,
        oldSkillNames: ['anytime-basic-design'],
      });

      expect(result.removedOld).toEqual(['anytime-basic-design']);
      expect(fs.existsSync(oldDir)).toBe(false);
    } finally {
      env.cleanup();
    }
  });

  it('oldSkillNames に該当 dir が無くてもエラーにならない', () => {
    const env = setupEnv();
    try {
      const result = installStaticSkillDir({
        claudeDir: env.claudeDir,
        extensionPath: env.extensionPath,
        skillName: SKILL_NAME,
        oldSkillNames: ['nonexistent-skill'],
      });

      expect(result.removedOld).toEqual([]);
      expect(result.installed).toBe(3);
    } finally {
      env.cleanup();
    }
  });
});
