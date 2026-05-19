import * as fs from 'node:fs';
import * as path from 'node:path';

export interface InstallSkillLogger {
  readonly info: (message: string) => void;
  readonly warn: (message: string) => void;
  readonly error: (message: string) => void;
}

export interface InstallBundledSkillsOptions {
  /** `~/.claude` 相当のディレクトリ。テストでは tmp dir を渡す。本番では os.homedir() 経由で組み立てる。 */
  readonly claudeDir: string;
  /** 拡張機能のインストール先（context.extensionPath）。同梱 `skills/trail-design/SKILL.md` の探索ベース。 */
  readonly extensionPath: string;
  /** true 指定時は既存ファイルが bundle と異なっていても上書きする。 */
  readonly force?: boolean;
  /** ログ出力。テストでは jest.fn() でキャプチャする。 */
  readonly logger?: InstallSkillLogger;
}

export interface InstallBundledSkillsResult {
  /** SKILL.md を新規 / force で書き出したか */
  readonly installed: boolean;
  /** 既存と一致 or claudeDir 不在で何もしなかったか */
  readonly skipped: boolean;
  /** 既存ファイルがあり差分のため上書きを保留したか */
  readonly preserved: boolean;
  /** 旧 build-code-graph ディレクトリを削除したか */
  readonly removedOld: boolean;
}

const SKILL_NAME = 'anytime-reverse-codegraph';
const OLD_SKILL_NAMES: readonly string[] = [
  'build-code-graph',
  'trail-design',
  'anytime-reverse-engineer',
];
const SKILL_FILE = 'SKILL.md';

const NOOP_LOGGER: InstallSkillLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

export function installBundledSkills(opts: InstallBundledSkillsOptions): InstallBundledSkillsResult {
  const logger = opts.logger ?? NOOP_LOGGER;
  const force = opts.force === true;

  if (!fs.existsSync(opts.claudeDir)) {
    return { installed: false, skipped: true, preserved: false, removedOld: false };
  }

  const skillsRoot = path.join(opts.claudeDir, 'skills');

  // 1. 旧ディレクトリ cleanup（リテラル名のホワイトリストで限定）
  let removedOld = false;
  for (const oldName of OLD_SKILL_NAMES) {
    const oldDir = path.join(skillsRoot, oldName);
    if (!fs.existsSync(oldDir)) continue;
    try {
      fs.rmSync(oldDir, { recursive: true, force: true });
      logger.info(`[install-skills] removed old skill dir: ${oldDir}`);
      removedOld = true;
    } catch (err) {
      logger.warn(`[install-skills] failed to remove ${oldDir}: ${String(err)}`);
    }
  }

  // 2. 同梱 SKILL.md 確認
  const bundledPath = path.join(opts.extensionPath, 'skills', SKILL_NAME, SKILL_FILE);
  if (!fs.existsSync(bundledPath)) {
    logger.warn(`[install-skills] bundled skill not found: ${bundledPath}`);
    return { installed: false, skipped: true, preserved: false, removedOld };
  }

  const targetDir = path.join(skillsRoot, SKILL_NAME);
  const targetPath = path.join(targetDir, SKILL_FILE);

  // 3. 既存ファイル評価
  if (fs.existsSync(targetPath) && !force) {
    const targetContent = fs.readFileSync(targetPath, 'utf-8');
    const bundledContent = fs.readFileSync(bundledPath, 'utf-8');
    if (targetContent === bundledContent) {
      logger.info(`[install-skills] ${SKILL_NAME} SKILL.md up-to-date`);
      return { installed: false, skipped: true, preserved: false, removedOld };
    }
    logger.info(
      `[install-skills] ${SKILL_NAME} SKILL.md exists with local edits, preserving (run "Anytime Trail: スキル再インストール" to overwrite)`,
    );
    return { installed: false, skipped: false, preserved: true, removedOld };
  }

  // 4. 書き出し（新規 or force）
  try {
    fs.mkdirSync(targetDir, { recursive: true });
    fs.copyFileSync(bundledPath, targetPath);
    logger.info(`[install-skills] installed ${SKILL_NAME} SKILL.md → ${targetPath}`);
    return { installed: true, skipped: false, preserved: false, removedOld };
  } catch (err) {
    logger.error(
      `[install-skills] failed to install ${SKILL_NAME}: ${String(err)}\n${err instanceof Error ? err.stack ?? '' : ''}`,
    );
    return { installed: false, skipped: true, preserved: false, removedOld };
  }
}

const TEMPLATE_FILE = 'SKILL.md.template';

export interface InstallTemplatedSkillOptions {
  /** `~/.claude` 相当ディレクトリ。テストでは tmp dir を渡す。 */
  readonly claudeDir: string;
  /** 拡張機能のインストール先（context.extensionPath）。同梱 `skills/<skillName>/SKILL.md.template` の探索ベース。 */
  readonly extensionPath: string;
  /** スキル名。`skills/<skillName>/SKILL.md.template` を読み、`<claudeDir>/skills/<skillName>/SKILL.md` に展開する。 */
  readonly skillName: string;
  /** placeholder 置換マップ（例: `{ __NOTE_DIR__: '/path/notes' }`）。 */
  readonly placeholders: Readonly<Record<string, string>>;
  /** true 指定時は既存ファイルが rendered と異なっていても上書きする。 */
  readonly force?: boolean;
  readonly logger?: InstallSkillLogger;
}

export interface InstallTemplatedSkillResult {
  /** SKILL.md を新規 / force で書き出したか */
  readonly installed: boolean;
  /** 既存と一致 or claudeDir / template 不在で何もしなかったか */
  readonly skipped: boolean;
  /** 既存ファイルがあり差分のため上書きを保留したか */
  readonly preserved: boolean;
}

function renderTemplate(template: string, placeholders: Readonly<Record<string, string>>): string {
  let rendered = template;
  for (const [key, value] of Object.entries(placeholders)) {
    rendered = rendered.replaceAll(key, value);
  }
  return rendered;
}

export function installTemplatedSkill(opts: InstallTemplatedSkillOptions): InstallTemplatedSkillResult {
  const logger = opts.logger ?? NOOP_LOGGER;
  const force = opts.force === true;

  if (!fs.existsSync(opts.claudeDir)) {
    return { installed: false, skipped: true, preserved: false };
  }

  const templatePath = path.join(opts.extensionPath, 'skills', opts.skillName, TEMPLATE_FILE);
  if (!fs.existsSync(templatePath)) {
    logger.warn(`[install-skills] bundled template not found: ${templatePath}`);
    return { installed: false, skipped: true, preserved: false };
  }

  const template = fs.readFileSync(templatePath, 'utf-8');
  const rendered = renderTemplate(template, opts.placeholders);

  const targetDir = path.join(opts.claudeDir, 'skills', opts.skillName);
  const targetPath = path.join(targetDir, SKILL_FILE);

  // existsSync → readFileSync の TOCTOU を避けるため readFileSync を直接呼び ENOENT で
  // 不在を判定する。CodeQL `js/file-system-race` の対象 (`installSkills.ts:175`) を解消する。
  if (!force) {
    let current: string | null = null;
    try {
      current = fs.readFileSync(targetPath, 'utf-8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
    }
    if (current !== null) {
      if (current === rendered) {
        logger.info(`[install-skills] ${opts.skillName} SKILL.md up-to-date`);
        return { installed: false, skipped: true, preserved: false };
      }
      logger.info(
        `[install-skills] ${opts.skillName} SKILL.md exists with local edits, preserving (pass force: true to overwrite)`,
      );
      return { installed: false, skipped: false, preserved: true };
    }
  }

  try {
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(targetPath, rendered, { encoding: 'utf-8' });
    logger.info(`[install-skills] installed ${opts.skillName} SKILL.md → ${targetPath}`);
    return { installed: true, skipped: false, preserved: false };
  } catch (err) {
    logger.error(
      `[install-skills] failed to install ${opts.skillName}: ${String(err)}\n${err instanceof Error ? err.stack ?? '' : ''}`,
    );
    return { installed: false, skipped: true, preserved: false };
  }
}

export interface InstallStaticSkillDirOptions {
  /** `~/.claude` 相当ディレクトリ。 */
  readonly claudeDir: string;
  /** 拡張機能のインストール先（context.extensionPath）。 */
  readonly extensionPath: string;
  /** スキル名。`skills/<skillName>/` 配下を再帰コピーする。 */
  readonly skillName: string;
  /** activate 時に削除する旧スキル dir 名（リネーム前の名前）。 */
  readonly oldSkillNames?: readonly string[];
  /** true 指定時は差分があっても全ファイル上書き。 */
  readonly force?: boolean;
  readonly logger?: InstallSkillLogger;
}

export interface InstallStaticSkillDirResult {
  /** 新規 / force で書き出したファイル数 */
  readonly installed: number;
  /** 既存と一致したファイル数 */
  readonly upToDate: number;
  /** 既存と差分があり保持したファイル数 */
  readonly preserved: number;
  /** bundle / claudeDir が見つからず何もしなかった場合 true */
  readonly sourceMissing: boolean;
  /** 削除した旧スキル dir 名（順序保持）。 */
  readonly removedOld: readonly string[];
}

function walkRelativeFiles(rootDir: string): string[] {
  const out: string[] = [];
  const stack: string[] = [''];
  while (stack.length > 0) {
    const rel = stack.pop()!;
    const abs = rel === '' ? rootDir : path.join(rootDir, rel);
    const entries = fs.readdirSync(abs, { withFileTypes: true });
    for (const e of entries) {
      const childRel = rel === '' ? e.name : path.join(rel, e.name);
      if (e.isDirectory()) {
        stack.push(childRel);
      } else if (e.isFile()) {
        out.push(childRel);
      }
    }
  }
  return out.sort();
}

export function installStaticSkillDir(opts: InstallStaticSkillDirOptions): InstallStaticSkillDirResult {
  const logger = opts.logger ?? NOOP_LOGGER;
  const force = opts.force === true;

  if (!fs.existsSync(opts.claudeDir)) {
    return { installed: 0, upToDate: 0, preserved: 0, sourceMissing: true, removedOld: [] };
  }

  const removedOld: string[] = [];
  for (const oldName of opts.oldSkillNames ?? []) {
    const oldDir = path.join(opts.claudeDir, 'skills', oldName);
    if (!fs.existsSync(oldDir)) continue;
    try {
      fs.rmSync(oldDir, { recursive: true, force: true });
      logger.info(`[install-skills] removed old skill dir: ${oldDir}`);
      removedOld.push(oldName);
    } catch (err) {
      logger.warn(`[install-skills] failed to remove ${oldDir}: ${String(err)}`);
    }
  }

  const sourceDir = path.join(opts.extensionPath, 'skills', opts.skillName);
  if (!fs.existsSync(sourceDir)) {
    logger.warn(`[install-skills] bundled skill dir not found: ${sourceDir}`);
    return { installed: 0, upToDate: 0, preserved: 0, sourceMissing: true, removedOld };
  }

  const targetDir = path.join(opts.claudeDir, 'skills', opts.skillName);
  const files = walkRelativeFiles(sourceDir);

  let installed = 0;
  let upToDate = 0;
  let preserved = 0;

  for (const rel of files) {
    const src = path.join(sourceDir, rel);
    const dst = path.join(targetDir, rel);
    const srcContent = fs.readFileSync(src, 'utf-8');

    // existsSync → readFileSync の TOCTOU 回避 (CodeQL `js/file-system-race`).
    if (!force) {
      let dstContent: string | null = null;
      try {
        dstContent = fs.readFileSync(dst, 'utf-8');
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw err;
        }
      }
      if (dstContent !== null) {
        if (dstContent === srcContent) {
          upToDate++;
        } else {
          preserved++;
        }
        continue;
      }
    }

    try {
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.writeFileSync(dst, srcContent, { encoding: 'utf-8' });
      installed++;
    } catch (err) {
      logger.error(
        `[install-skills] failed to install ${opts.skillName}/${rel}: ${String(err)}\n${err instanceof Error ? err.stack ?? '' : ''}`,
      );
    }
  }

  if (installed > 0 || preserved > 0) {
    logger.info(
      `[install-skills] ${opts.skillName}: installed=${installed} preserved=${preserved} upToDate=${upToDate}`,
    );
  }

  return { installed, upToDate, preserved, sourceMissing: false, removedOld };
}
