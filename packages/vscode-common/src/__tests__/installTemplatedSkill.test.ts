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

  it('ターゲットディレクトリが書き込み不可の場合は error ログ + skipped', () => {
    const env = setupEnv();
    try {
      const skillsDir = path.join(env.claudeDir, 'skills');
      fs.chmodSync(skillsDir, 0o555);
      try {
        const errors: string[] = [];
        const result = installTemplatedSkill({
          claudeDir: env.claudeDir,
          extensionPath: env.extensionPath,
          skillName: 'anytime-note',
          placeholders: PLACEHOLDERS,
          logger: {
            info: () => undefined,
            warn: () => undefined,
            error: (m) => errors.push(m),
          },
        });

        expect(result.installed).toBe(false);
        expect(result.skipped).toBe(true);
        expect(errors.some((m) => m.includes('failed to install'))).toBe(true);
      } finally {
        fs.chmodSync(skillsDir, 0o755);
      }
    } finally {
      env.cleanup();
    }
  });

  it('readFileSync が ENOENT 以外のエラーをスローする場合は再スローする', () => {
    const env = setupEnv({ existingSkill: RENDERED });
    try {
      const targetDir = path.join(env.claudeDir, 'skills', 'anytime-note');
      const targetPath = path.join(targetDir, 'SKILL.md');
      // SKILL.md をディレクトリにして EISDIR を発生させる（ENOENT ではない）
      fs.rmSync(targetPath);
      fs.mkdirSync(targetPath, { recursive: true });
      try {
        expect(() => installTemplatedSkill({
          claudeDir: env.claudeDir,
          extensionPath: env.extensionPath,
          skillName: 'anytime-note',
          placeholders: PLACEHOLDERS,
        })).toThrow();
      } finally {
        fs.rmdirSync(targetPath);
      }
    } finally {
      env.cleanup();
    }
  });
});

describe('installTemplatedSkill の版数ゲート', () => {
  const MARKER = '.test-skill-versions.json';
  const LOCAL = '# locally edited\n';

  function markerPath(env: TestEnv): string {
    return path.join(env.claudeDir, 'skills', MARKER);
  }
  function target(env: TestEnv): string {
    return path.join(env.claudeDir, 'skills', 'anytime-note', 'SKILL.md');
  }
  function writeMarker(env: TestEnv, value: Record<string, number>): void {
    fs.writeFileSync(markerPath(env), JSON.stringify(value));
  }
  function readMarker(env: TestEnv): Record<string, number> {
    return JSON.parse(fs.readFileSync(markerPath(env), 'utf-8')) as Record<string, number>;
  }
  function run(env: TestEnv, version: number) {
    return installTemplatedSkill({
      claudeDir: env.claudeDir,
      extensionPath: env.extensionPath,
      skillName: 'anytime-note',
      placeholders: PLACEHOLDERS,
      version,
      markerFile: MARKER,
    });
  }

  it('同梱版数が記録版数を上回ればローカル差分があっても上書きし、版数を記録する', () => {
    const env = setupEnv({ existingSkill: LOCAL });
    try {
      writeMarker(env, { 'anytime-note': 1 });
      const result = run(env, 2);
      expect(result.installed).toBe(true);
      expect(result.upgraded).toBe(true);
      expect(fs.readFileSync(target(env), 'utf-8')).toBe(RENDERED);
      expect(readMarker(env)['anytime-note']).toBe(2);
    } finally {
      env.cleanup();
    }
  });

  it('同梱版数が記録版数と同じならローカル差分を保持する', () => {
    const env = setupEnv({ existingSkill: LOCAL });
    try {
      writeMarker(env, { 'anytime-note': 2 });
      const result = run(env, 2);
      expect(result.preserved).toBe(true);
      expect(result.upgraded).toBe(false);
      expect(fs.readFileSync(target(env), 'utf-8')).toBe(LOCAL);
    } finally {
      env.cleanup();
    }
  });

  it('版数が未記録なら上書きして記録する（版数ゲート導入前の配布済みコピーを正本へ収束させる）', () => {
    const env = setupEnv({ existingSkill: LOCAL });
    try {
      const result = run(env, 1);
      expect(result.upgraded).toBe(true);
      expect(fs.readFileSync(target(env), 'utf-8')).toBe(RENDERED);
      expect(readMarker(env)['anytime-note']).toBe(1);
    } finally {
      env.cleanup();
    }
  });

  it('記録時に他スキルの版数を消さない', () => {
    const env = setupEnv({ existingSkill: LOCAL });
    try {
      writeMarker(env, { 'anytime-note': 1, 'anytime-loop-start': 22 });
      run(env, 2);
      expect(readMarker(env)).toEqual({ 'anytime-note': 2, 'anytime-loop-start': 22 });
    } finally {
      env.cleanup();
    }
  });

  it('書き込みに失敗したら版数を記録しない（次回の起動で再び上書きを試みる）', () => {
    const env = setupEnv();
    try {
      writeMarker(env, { 'anytime-note': 1 });
      // SKILL.md の位置をディレクトリにして書き込みを EISDIR で失敗させる。
      // 権限（chmod）に頼ると root 実行で検証が素通りし、fs 名前空間は jest.spyOn で再定義できないため。
      fs.mkdirSync(target(env), { recursive: true });
      const result = run(env, 2);
      expect(result.installed).toBe(false);
      expect(result.upgraded).toBe(true);
      expect(readMarker(env)['anytime-note']).toBe(1);
    } finally {
      env.cleanup();
    }
  });
});
