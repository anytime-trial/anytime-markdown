import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * 拡張へ同梱した Claude Code スキル dir（`<extension>/skills/<name>/`、SKILL.md と
 * references/ 等のサブファイルを含む）を、ワークスペースの `.claude/skills/<name>/` へ
 * dir 全体を再帰コピーで配置するインストーラ。
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
 * 統合・廃止で同梱から外れた旧スキル dir 名。activate 時に配置先から削除する
 * （agent/trail 拡張の `installStaticSkillDir` の `oldSkillNames` と同じ明示リスト方式。
 * 「manifest に無いものを一括削除」にしないのは、ユーザー自作スキルや他拡張の配置分を
 * 巻き込まないため — 削除対象は本拡張が過去に配置した名前の列挙に限る）。
 */
export const OBSOLETE_SKILL_NAMES: readonly string[] = [
  // 2026-08-22: anytime-markdown-usage §D へ統合（トークン軽減の利用手順として一本化）
  'anytime-spec-lookup',
];

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

/**
 * スキル名が単一のディレクトリ名（パス区切り・`..`・絶対パスを含まない）か検証する。
 * manifest は同梱（信頼境界内）だが、ワークスペース永続領域へ書き込むため
 * defense-in-depth でパストラバーサルを防ぐ。
 */
export function isSafeSkillName(name: string): boolean {
  return name.length > 0 && !name.includes('..') && path.basename(name) === name;
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
  /** 削除した旧スキル dir 名（dir が実在し削除に成功したもののみ） */
  removedOld: string[];
  skillsDestDir: string;
}

export interface InstallOptions {
  /** 拡張のルートパス（`skills/` の親）。`context.extensionUri.fsPath` */
  extensionFsPath: string;
  /** ワークスペースルート。`workspaceFolders[0].uri.fsPath` */
  workspaceFsPath: string;
  /** true でバージョン無視の強制再配置 */
  force?: boolean;
  /** 配置先から削除する旧スキル dir 名（省略時は {@link OBSOLETE_SKILL_NAMES}） */
  obsoleteSkillNames?: readonly string[];
  log: InstallLogger;
}

/**
 * 同梱スキルをワークスペースの `.claude/skills/` へ配置する。
 * 失敗は握りつぶさず log('error', ...) に出す（成功分のみマーカーへ記録）。
 */
export function installSkills(opts: InstallOptions): InstallResult {
  const { extensionFsPath, workspaceFsPath, force, log } = opts;
  const obsoleteSkillNames = opts.obsoleteSkillNames ?? OBSOLETE_SKILL_NAMES;
  const skillsSrcDir = path.join(extensionFsPath, 'skills');
  const manifestPath = path.join(skillsSrcDir, 'manifest.json');
  const skillsDestDir = path.join(workspaceFsPath, '.claude', 'skills');
  const markerPath = path.join(skillsDestDir, SKILL_MARKER);

  const bundled = toManifest(readJsonObject(manifestPath));
  if (Object.keys(bundled).length === 0) {
    log('error', `スキル manifest を読めません/空です: ${manifestPath}`);
    return { installed: [], removedOld: [], skillsDestDir };
  }

  const rawMarker = toManifest(readJsonObject(markerPath));
  const nextMarker: SkillManifest = { ...rawMarker };

  // 廃止スキルの掃除。dir 削除に失敗した場合は marker を残し、次回 activate で再試行させる。
  const removedOld: string[] = [];
  let markerChanged = false;
  for (const oldName of obsoleteSkillNames) {
    if (!isSafeSkillName(oldName)) {
      log('error', `不正な廃止スキル名をスキップ（パストラバーサル防止）: ${oldName}`);
      continue;
    }
    if (bundled[oldName] !== undefined) {
      log('error', `廃止リストのスキルが同梱 manifest にも存在するため削除しません: ${oldName}`);
      continue;
    }
    const oldDir = path.join(skillsDestDir, oldName);
    if (fs.existsSync(oldDir)) {
      try {
        fs.rmSync(oldDir, { recursive: true, force: true });
        removedOld.push(oldName);
        log('info', `廃止スキル削除: ${oldName} → ${oldDir}`);
      } catch (err) {
        const stack = err instanceof Error ? (err.stack ?? err.message) : String(err);
        log('error', `廃止スキル削除失敗: ${oldName}: ${stack}`);
        continue;
      }
    }
    if (nextMarker[oldName] !== undefined) {
      delete nextMarker[oldName];
      markerChanged = true;
    }
  }

  const installedManifest = force ? {} : rawMarker;
  const plan = planSkillInstall(bundled, installedManifest);
  if (plan.length === 0) {
    log('info', 'Anytime スキルは最新です（配置不要）');
  }

  const succeeded: InstallPlanItem[] = [];
  for (const item of plan) {
    if (!isSafeSkillName(item.name)) {
      log('error', `不正なスキル名をスキップ（パストラバーサル防止）: ${item.name}`);
      continue;
    }
    try {
      const srcSkillDir = path.join(skillsSrcDir, item.name);
      const destDir = path.join(skillsDestDir, item.name);
      fs.mkdirSync(destDir, { recursive: true });
      // SKILL.md 単体でなくスキル dir 全体を再帰コピーする。references/ 等のサブファイルを
      // 持つスキル（anytime-doc-authoring 等）を配布ターゲットへ確実に届けるため
      // （agent/trail 拡張の installStaticSkillDir と挙動を揃える）。
      fs.cpSync(srcSkillDir, destDir, { recursive: true });
      succeeded.push(item);
      log('info', `スキル配置(${item.reason}): ${item.name} v${item.from ?? '-'}→v${item.to} → ${destDir}`);
    } catch (err) {
      const stack = err instanceof Error ? (err.stack ?? err.message) : String(err);
      log('error', `スキル配置失敗: ${item.name}: ${stack}`);
    }
  }

  if (succeeded.length > 0 || markerChanged) {
    try {
      fs.mkdirSync(skillsDestDir, { recursive: true });
      for (const item of succeeded) nextMarker[item.name] = item.to;
      fs.writeFileSync(markerPath, JSON.stringify(nextMarker, null, 2) + '\n', 'utf8');
    } catch (err) {
      const stack = err instanceof Error ? (err.stack ?? err.message) : String(err);
      log('error', `スキル marker 書き込み失敗: ${markerPath}: ${stack}`);
    }
  }

  return { installed: succeeded, removedOld, skillsDestDir };
}
