import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  installStaticSkillDir,
  installTemplatedSkill,
  readBundledSkillManifest,
} from '@anytime-markdown/vscode-common';

import { AgentLogger } from '../utils/AgentLogger';
import { AGENT_SKILL_MARKER, BUNDLED_STATIC_SKILLS } from './bundledSkills';

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

  try {
    installTemplatedSkill({
      claudeDir,
      extensionPath: opts.extensionPath,
      skillName: 'anytime-note',
      placeholders: {
        __NOTE_DIR__: opts.noteStorageDir,
        __IMAGES_DIR__: path.join(opts.noteStorageDir, 'images'),
      },
      logger,
    });
  } catch (err) {
    AgentLogger.warn(`[install-skills] anytime-note unexpected failure: ${String(err)}`);
  }

  // 版数ゲートの根拠。manifest が読めないと配布済みコピーの差分が preserve され、
  // スキル更新がユーザーへ届かなくなる（恒久 stale）。無言で劣化させず warn を出す。
  const manifest = readBundledSkillManifest(opts.extensionPath, logger);
  if (Object.keys(manifest).length === 0) {
    AgentLogger.warn(
      '[install-skills] skills/manifest.json を読めません。版数ゲートなしで配置します（既存コピーは更新されません）',
    );
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
