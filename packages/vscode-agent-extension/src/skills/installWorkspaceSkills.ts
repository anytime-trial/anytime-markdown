import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  installStaticSkillDir,
  installTemplatedSkill,
  readBundledSkillManifest,
  readSkillVersionMarker,
} from '@anytime-markdown/vscode-common';

import { AgentLogger } from '../utils/AgentLogger';
import { AGENT_SKILL_MARKER, BUNDLED_STATIC_SKILLS, OBSOLETE_AGENT_SKILL_NAMES } from './bundledSkills';

export interface RemoveObsoleteSkillsOptions {
  /** ワークスペースの `.claude` ディレクトリ。 */
  readonly claudeDir: string;
  /** 削除候補の廃止スキル名。 */
  readonly names: readonly string[];
  /** 同梱 manifest。ここに載る名前は廃止リストとの矛盾として削除しない。 */
  readonly bundled: Readonly<Record<string, number>>;
}

/** パス区切りや `..` を含む名前は skills/ の外を指し得るため受け付けない。 */
const SAFE_SKILL_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * 廃止スキルの配置済みコピーを削除し、削除した名前を返す。
 *
 * 本拡張の marker に配置記録がある名前だけを対象にし、削除できたら記録も外す。
 * 削除に失敗した名前は記録を残し、次回 activate で再試行させる。
 */
export function removeObsoleteSkills(opts: RemoveObsoleteSkillsOptions): string[] {
  const skillsDir = path.join(opts.claudeDir, 'skills');
  const markerPath = path.join(skillsDir, AGENT_SKILL_MARKER);
  const marker = readSkillVersionMarker(markerPath);
  const removed: string[] = [];
  let markerChanged = false;

  for (const name of opts.names) {
    if (!SAFE_SKILL_NAME.test(name) || name.includes('..')) {
      AgentLogger.warn(`[install-skills] 不正な廃止スキル名をスキップ: ${name}`);
      continue;
    }
    if (opts.bundled[name] !== undefined) {
      AgentLogger.warn(`[install-skills] 廃止リストのスキルが同梱 manifest にもあるため削除しない: ${name}`);
      continue;
    }
    if (marker[name] === undefined) continue;

    const dir = path.join(skillsDir, name);
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (err) {
      AgentLogger.warn(`[install-skills] 廃止スキルの削除に失敗: ${dir}: ${String(err)}`);
      continue;
    }
    delete marker[name];
    markerChanged = true;
    removed.push(name);
    AgentLogger.info(`[install-skills] 廃止スキルを削除: ${dir}`);
  }

  if (markerChanged) {
    // 書き込み途中で落ちても marker を壊さないよう、一時ファイルから rename で置き換える。
    const tmp = `${markerPath}.${process.pid}.tmp`;
    try {
      fs.writeFileSync(tmp, `${JSON.stringify(marker, null, 2)}\n`, 'utf-8');
      fs.renameSync(tmp, markerPath);
    } catch (err) {
      AgentLogger.warn(`[install-skills] marker の更新に失敗: ${markerPath}: ${String(err)}`);
      fs.rmSync(tmp, { force: true });
    }
  }
  return removed;
}

export interface InstallWorkspaceSkillsOptions {
  /** 配置先ワークスペースのルート（この直下の .claude/skills/ へ展開する）。 */
  readonly workspaceRoot: string;
  /** 同梱スキルの読み出し元（拡張の展開先パス）。 */
  readonly extensionPath: string;
  /** anytime-note のテンプレートに埋め込むノート格納先。 */
  readonly noteStorageDir: string;
}

/**
 * ワークスペースの `.claude/skills/` へ同梱スキルを配置する（activate 時に呼ぶ）。
 *
 * anytime-note のみプレースホルダ展開が要るためテンプレート展開、他は dir 丸ごと展開する。
 * 1 スキルの失敗が他のスキルや activate 自体を巻き込まないよう、失敗はスキル単位で握って
 * warn ログに落とす。
 */
export function installWorkspaceSkills(opts: InstallWorkspaceSkillsOptions): void {
  const claudeDir = path.join(opts.workspaceRoot, '.claude');
  try {
    fs.mkdirSync(claudeDir, { recursive: true });
  } catch (err) {
    AgentLogger.warn(`[install-skills] mkdir ${claudeDir} failed: ${String(err)}`);
    return;
  }

  const logger = {
    info: (m: string) => AgentLogger.info(m),
    warn: (m: string) => AgentLogger.warn(m),
    error: (m: string) => AgentLogger.error(m),
  };

  // 版数ゲートの根拠。manifest が読めないと配布済みコピーの差分が preserve され、
  // スキル更新がユーザーへ届かなくなる（恒久 stale）。無言で劣化させず warn を出す。
  const manifest = readBundledSkillManifest(opts.extensionPath, logger);
  if (Object.keys(manifest).length === 0) {
    AgentLogger.warn(
      '[install-skills] skills/manifest.json を読めません。版数ゲートなしで配置します（既存コピーは更新されません）',
    );
  }

  try {
    removeObsoleteSkills({ claudeDir, names: OBSOLETE_AGENT_SKILL_NAMES, bundled: manifest });
  } catch (err) {
    AgentLogger.warn(`[install-skills] obsolete skill cleanup unexpected failure: ${String(err)}`);
  }

  try {
    installTemplatedSkill({
      claudeDir,
      extensionPath: opts.extensionPath,
      skillName: 'anytime-note',
      placeholders: {
        __NOTE_DIR__: opts.noteStorageDir,
        __IMAGES_DIR__: path.join(opts.noteStorageDir, 'images'),
      },
      version: manifest['anytime-note'],
      markerFile: AGENT_SKILL_MARKER,
      logger,
    });
  } catch (err) {
    AgentLogger.warn(`[install-skills] anytime-note unexpected failure: ${String(err)}`);
  }

  for (const skill of BUNDLED_STATIC_SKILLS) {
    try {
      installStaticSkillDir({
        claudeDir,
        extensionPath: opts.extensionPath,
        skillName: skill.name,
        oldSkillNames: skill.oldNames ? [...skill.oldNames] : undefined,
        version: manifest[skill.name],
        markerFile: AGENT_SKILL_MARKER,
        logger,
      });
    } catch (err) {
      AgentLogger.warn(`[install-skills] ${skill.name} unexpected failure: ${String(err)}`);
    }
  }
}
