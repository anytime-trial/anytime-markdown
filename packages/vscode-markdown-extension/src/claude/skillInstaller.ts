import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * 拡張へ同梱した Claude Code スキル（`<extension>/skills/<name>/SKILL.md`）を
 * ワークスペースの `.claude/skills/<name>/` へ配置するインストーラ。
 *
 * vscode API には依存しない（fs/path のみ）。配置判定の純関数 {@link planSkillInstall} と
 * 実配置 {@link installSkills} に分離し、前者を単体テストで検証する。
 */

export type SkillManifest = Record<string, number>;

export interface InstallPlanItem {
  name: string;
  reason: 'new' | 'update';
  /** 配置済みバージョン（新規は null） */
  from: number | null;
  /** 同梱バージョン */
  to: number;
}

export type InstallLevel = 'info' | 'error';
export type InstallLogger = (level: InstallLevel, message: string) => void;

/** 配置先マーカー（配置済みバージョンを記録） */
export const SKILL_MARKER = '.anytime-skills.json';

/**
 * 同梱 manifest と配置済み manifest を比較し、配置/更新が必要なスキルを返す純関数。
 * 配置済みバージョン >= 同梱バージョンのものは対象外（ダウングレードしない）。
 */
export function planSkillInstall(bundled: SkillManifest, installed: SkillManifest): InstallPlanItem[] {
  const plan: InstallPlanItem[] = [];
  for (const [name, version] of Object.entries(bundled)) {
    const current = installed[name];
    if (current === undefined) {
      plan.push({ name, reason: 'new', from: null, to: version });
    } else if (current < version) {
      plan.push({ name, reason: 'update', from: current, to: version });
    }
  }
  return plan;
}

function readJsonObject(filePath: string): Record<string, unknown> | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function toManifest(obj: Record<string, unknown> | null): SkillManifest {
  const result: SkillManifest = {};
  if (!obj) return result;
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'number') result[k] = v;
  }
  return result;
}

export interface InstallResult {
  installed: InstallPlanItem[];
  skillsDestDir: string;
}

export interface InstallOptions {
  /** 拡張のルートパス（`skills/` の親）。`context.extensionUri.fsPath` */
  extensionFsPath: string;
  /** ワークスペースルート。`workspaceFolders[0].uri.fsPath` */
  workspaceFsPath: string;
  /** true でバージョン無視の強制再配置 */
  force?: boolean;
  log: InstallLogger;
}

/**
 * 同梱スキルをワークスペースの `.claude/skills/` へ配置する。
 * 失敗は握りつぶさず log('error', ...) に出す（成功分のみマーカーへ記録）。
 */
export function installSkills(opts: InstallOptions): InstallResult {
  const { extensionFsPath, workspaceFsPath, force, log } = opts;
  const skillsSrcDir = path.join(extensionFsPath, 'skills');
  const manifestPath = path.join(skillsSrcDir, 'manifest.json');
  const skillsDestDir = path.join(workspaceFsPath, '.claude', 'skills');
  const markerPath = path.join(skillsDestDir, SKILL_MARKER);

  const bundled = toManifest(readJsonObject(manifestPath));
  if (Object.keys(bundled).length === 0) {
    log('error', `スキル manifest を読めません/空です: ${manifestPath}`);
    return { installed: [], skillsDestDir };
  }

  const installedManifest = force ? {} : toManifest(readJsonObject(markerPath));
  const plan = planSkillInstall(bundled, installedManifest);
  if (plan.length === 0) {
    log('info', 'Anytime スキルは最新です（配置不要）');
    return { installed: [], skillsDestDir };
  }

  const succeeded: InstallPlanItem[] = [];
  for (const item of plan) {
    try {
      const srcFile = path.join(skillsSrcDir, item.name, 'SKILL.md');
      const destDir = path.join(skillsDestDir, item.name);
      fs.mkdirSync(destDir, { recursive: true });
      fs.copyFileSync(srcFile, path.join(destDir, 'SKILL.md'));
      succeeded.push(item);
      log('info', `スキル配置(${item.reason}): ${item.name} v${item.from ?? '-'}→v${item.to} → ${destDir}`);
    } catch (err) {
      const stack = err instanceof Error ? (err.stack ?? err.message) : String(err);
      log('error', `スキル配置失敗: ${item.name}: ${stack}`);
    }
  }

  if (succeeded.length > 0) {
    try {
      fs.mkdirSync(skillsDestDir, { recursive: true });
      const next: SkillManifest = { ...installedManifest };
      for (const item of succeeded) next[item.name] = item.to;
      fs.writeFileSync(markerPath, JSON.stringify(next, null, 2) + '\n', 'utf8');
    } catch (err) {
      const stack = err instanceof Error ? (err.stack ?? err.message) : String(err);
      log('error', `スキル marker 書き込み失敗: ${markerPath}: ${stack}`);
    }
  }

  return { installed: succeeded, skillsDestDir };
}
