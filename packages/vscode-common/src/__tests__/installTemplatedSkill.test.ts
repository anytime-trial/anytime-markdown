import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { installTemplatedSkill } from '../skill-installer/installSkills';

interface TestEnv {
  readonly extensionPath: string;
  readonly claudeDir: string;
  readonly cleanup: () => void;
}

const TEMPLATE_BODY = `---
name: anytime-note
description: テンプレ
---

# Agent Note

ノートフォルダ: \`__NOTE_DIR__\`
画像フォルダ: \`__IMAGES_DIR__\`
`;

const PLACEHOLDERS = {
  __NOTE_DIR__: '/var/notes',
  __IMAGES_DIR__: '/var/notes/images',
} as const;

const RENDERED = TEMPLATE_BODY.replaceAll('__NOTE_DIR__', PLACEHOLDERS.__NOTE_DIR__)
  .replaceAll('__IMAGES_DIR__', PLACEHOLDERS.__IMAGES_DIR__);

function setupEnv(initial?: { existingSkill?: string }): TestEnv {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'install-templated-skill-'));
  const extensionPath = path.join(tmpRoot, 'ext');
  const claudeDir = path.join(tmpRoot, 'fake-home', '.claude');

  const bundledDir = path.join(extensionPath, 'skills', 'anytime-note');
  fs.mkdirSync(bundledDir, { recursive: true });
  fs.writeFileSync(path.join(bundledDir, 'SKILL.md.template'), TEMPLATE_BODY);

  fs.mkdirSync(path.join(claudeDir, 'skills'), { recursive: true });
  if (initial?.existingSkill !== undefined) {
    const targetDir = path.join(claudeDir, 'skills', 'anytime-note');
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, 'SKILL.md'), initial.existingSkill);
  }

  return {
    extensionPath,
    claudeDir,
    cleanup: () => fs.rmSync(tmpRoot, { recursive: true, force: true }),
  };
}

describe('installTemplatedSkill', () => {
  it('claudeDir が存在しない場合は no-op を返す', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'install-templated-skill-'));
    try {
      const extensionPath = path.join(tmpRoot, 'ext');
      const bundledDir = path.join(extensionPath, 'skills', 'anytime-note');
      fs.mkdirSync(bundledDir, { recursive: true });
      fs.writeFileSync(path.join(bundledDir, 'SKILL.md.template'), TEMPLATE_BODY);

      const result = installTemplatedSkill({
        claudeDir: path.join(tmpRoot, 'nonexistent', '.claude'),
        extensionPath,
        skillName: 'anytime-note',
        placeholders: PLACEHOLDERS,
      });

      expect(result.installed).toBe(false);
      expect(result.skipped).toBe(true);
      expect(result.preserved).toBe(false);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('SKILL.md が存在しないときテンプレートを placeholder 置換して書き出す', () => {
    const env = setupEnv();
    try {
      const result = installTemplatedSkill({
        claudeDir: env.claudeDir,
        extensionPath: env.extensionPath,
        skillName: 'anytime-note',
        placeholders: PLACEHOLDERS,
      });

      expect(result.installed).toBe(true);
      const target = path.join(env.claudeDir, 'skills', 'anytime-note', 'SKILL.md');
      expect(fs.readFileSync(target, 'utf-8')).toBe(RENDERED);
      expect(fs.readFileSync(target, 'utf-8')).not.toMatch(/__NOTE_DIR__|__IMAGES_DIR__/);
    } finally {
      env.cleanup();
    }
  });

  it('既存 SKILL.md が rendered 後と一致する場合は skipped', () => {
    const env = setupEnv({ existingSkill: RENDERED });
    try {
      const result = installTemplatedSkill({
        claudeDir: env.claudeDir,
        extensionPath: env.extensionPath,
        skillName: 'anytime-note',
        placeholders: PLACEHOLDERS,
      });

      expect(result.installed).toBe(false);
      expect(result.skipped).toBe(true);
      expect(result.preserved).toBe(false);
    } finally {
      env.cleanup();
    }
  });

  it('既存 SKILL.md が差分ありなら preserved（上書きしない）', () => {
    const localContent = '# locally edited\n';
    const env = setupEnv({ existingSkill: localContent });
    try {
      const result = installTemplatedSkill({
        claudeDir: env.claudeDir,
        extensionPath: env.extensionPath,
        skillName: 'anytime-note',
        placeholders: PLACEHOLDERS,
      });

      expect(result.installed).toBe(false);
      expect(result.preserved).toBe(true);
      const target = path.join(env.claudeDir, 'skills', 'anytime-note', 'SKILL.md');
      expect(fs.readFileSync(target, 'utf-8')).toBe(localContent);
    } finally {
      env.cleanup();
    }
  });

  it('force: true は差分があっても上書きする', () => {
    const env = setupEnv({ existingSkill: '# locally edited\n' });
    try {
      const result = installTemplatedSkill({
        claudeDir: env.claudeDir,
        extensionPath: env.extensionPath,
        skillName: 'anytime-note',
        placeholders: PLACEHOLDERS,
        force: true,
      });

      expect(result.installed).toBe(true);
      expect(result.preserved).toBe(false);
      const target = path.join(env.claudeDir, 'skills', 'anytime-note', 'SKILL.md');
      expect(fs.readFileSync(target, 'utf-8')).toBe(RENDERED);
    } finally {
      env.cleanup();
    }
  });

  it('bundled SKILL.md.template が無い場合は warn ログ + skipped', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'install-templated-skill-'));
    try {
      const claudeDir = path.join(tmpRoot, '.claude');
      fs.mkdirSync(path.join(claudeDir, 'skills'), { recursive: true });
      const extensionPath = path.join(tmpRoot, 'ext-without-template');
      fs.mkdirSync(extensionPath, { recursive: true });

      const warns: string[] = [];
      const result = installTemplatedSkill({
        claudeDir,
        extensionPath,
        skillName: 'anytime-note',
        placeholders: PLACEHOLDERS,
        logger: {
          info: () => undefined,
          warn: (m) => warns.push(m),
          error: () => undefined,
        },
      });

      expect(result.installed).toBe(false);
      expect(result.skipped).toBe(true);
      expect(warns.some((m) => m.includes('bundled template not found'))).toBe(true);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});
