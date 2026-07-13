import * as fs from 'node:fs';
import * as path from 'node:path';

export interface InstallSkillLogger {
  readonly info: (message: string) => void;
  readonly warn: (message: string) => void;
  readonly error: (message: string) => void;
}

const SKILL_FILE = 'SKILL.md';

const NOOP_LOGGER: InstallSkillLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

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
  /**
   * 同梱スキルの版数（`skills/manifest.json` 由来）。
   *
   * marker に記録された版数より大きければ、差分があっても上書きする（＝スキル更新をユーザーへ届ける）。
   * 未指定なら版数ゲートは働かず、差分ありファイルは preserve される（後方互換）。
   */
  readonly version?: number;
  /** 版数の記録先ファイル名（`<claudeDir>/skills/<markerFile>`）。`version` 指定時のみ使う。 */
  readonly markerFile?: string;
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
  /** 版数ゲートが上書きを発動したか（version 指定時のみ true になり得る）。 */
  readonly upgraded: boolean;
}

/** スキル名 → 配置済み版数。 */
export type SkillVersionManifest = Record<string, number>;

/**
 * marker から配置済み版数を読む。存在しない・壊れている場合は空として扱う。
 *
 * 壊れた marker で例外を投げると activate 全体が落ちるため、warn ログを出して
 * 「未記録」に倒す（未記録は上書き側に倒れるので、正本が確実に配布される）。
 */
export function readSkillVersionMarker(
  markerPath: string,
  logger: InstallSkillLogger = NOOP_LOGGER,
): SkillVersionManifest {
  let raw: string;
  try {
    raw = fs.readFileSync(markerPath, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.warn(`[install-skills] failed to read ${markerPath}: ${String(err)}`);
    }
    return {};
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      logger.warn(`[install-skills] ${markerPath} is not a JSON object; treating as unrecorded`);
      return {};
    }
    const out: SkillVersionManifest = {};
    for (const [name, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'number' && Number.isFinite(value)) out[name] = value;
    }
    return out;
  } catch (err) {
    logger.warn(`[install-skills] failed to parse ${markerPath}: ${String(err)}; treating as unrecorded`);
    return {};
  }
}

/**
 * 拡張同梱の `skills/manifest.json`（スキル名 → 版数）を読む。
 *
 * 不在・壊れている場合は空を返す。空なら版数ゲートは働かず preserve 挙動に落ちるため、
 * 「更新が届かない」に戻る。呼び出し側は空を warn として扱うこと。
 */
export function readBundledSkillManifest(
  extensionPath: string,
  logger: InstallSkillLogger = NOOP_LOGGER,
): SkillVersionManifest {
  return readSkillVersionMarker(path.join(extensionPath, 'skills', 'manifest.json'), logger);
}

/** marker の 1 スキル分だけを更新する（他拡張・他スキルの記録を消さない）。 */
function recordSkillVersion(
  markerPath: string,
  skillName: string,
  version: number,
  logger: InstallSkillLogger,
): void {
  const current = readSkillVersionMarker(markerPath, logger);
  const next: SkillVersionManifest = { ...current, [skillName]: version };
  try {
    fs.mkdirSync(path.dirname(markerPath), { recursive: true });
    fs.writeFileSync(markerPath, `${JSON.stringify(next, null, 2)}\n`, { encoding: 'utf-8' });
  } catch (err) {
    logger.error(
      `[install-skills] failed to record version for ${skillName} in ${markerPath}: ${String(err)}\n${err instanceof Error ? (err.stack ?? '') : ''}`,
    );
  }
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
    return { installed: 0, upToDate: 0, preserved: 0, sourceMissing: true, removedOld: [], upgraded: false };
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
    return { installed: 0, upToDate: 0, preserved: 0, sourceMissing: true, removedOld, upgraded: false };
  }

  // 版数ゲート: 同梱版数が marker の記録版数を上回るなら preserve を破って上書きする。
  // これが無いと、配布済みコピーに差分がある限り更新が永久に届かない（恒久 stale）。
  const markerPath =
    opts.version !== undefined && opts.markerFile !== undefined
      ? path.join(opts.claudeDir, 'skills', opts.markerFile)
      : null;
  let upgraded = false;
  if (markerPath !== null && opts.version !== undefined) {
    const recorded = readSkillVersionMarker(markerPath, logger)[opts.skillName];
    upgraded = recorded === undefined || recorded < opts.version;
  }
  const overwrite = force || upgraded;

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
    if (!overwrite) {
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
      `[install-skills] ${opts.skillName}: installed=${installed} preserved=${preserved} upToDate=${upToDate}${upgraded ? ` (upgraded to v${String(opts.version)})` : ''}`,
    );
  }

  // 版数は「実際に配置できた」ときだけ記録する。書き込みが全滅（EACCES 等）したのに記録すると、
  // 次回 activate で recorded >= version となり「配布済み」と誤判定して二度と再配布しない
  // ＝この関数が直したはずの恒久 stale が、書き込み失敗経路で再発する。
  // 全ファイルが upToDate（配置済みが既に正本と同一）なら書き込み 0 でも配布は成立しているので記録する。
  const deployed = installed > 0 || (files.length > 0 && upToDate === files.length);
  if (markerPath !== null && opts.version !== undefined && deployed) {
    const recorded = readSkillVersionMarker(markerPath, logger)[opts.skillName];
    if (recorded === undefined || recorded < opts.version) {
      recordSkillVersion(markerPath, opts.skillName, opts.version, logger);
    }
  }

  return { installed, upToDate, preserved, sourceMissing: false, removedOld, upgraded };
}
