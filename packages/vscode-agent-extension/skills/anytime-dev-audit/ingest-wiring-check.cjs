#!/usr/bin/env node
// anytime-dev-audit — 外部ツール設定・ingest 配線の診断（設計書 spec/90.skill/anytime-dev-audit.ja.md §3.3）。
//
// Trail / markdown 拡張の設定（anytimeTrail.workspace.path・anytimeMarkdown.docsRoot）と
// lep.json（sources.gitRoots / stage / llm.providers.*.baseUrl）を読み、設定値の妥当性だけでなく
// 「取り込まれた実データの鮮度」まで見て D1〜D7 を判定する。
//
// Why not 台帳の status を根拠にしない: 2026-09-12 の anytime-travel 実測では、監視対象が空配列で
// コミット取込が 11 日間停止している間も caravan_pipeline_runs の CommitResolver は 786 回すべて
// success を返していた。取込ゼロは正常系として記録されるため、成功回数は故障の否定にならない。
//
// 使い方（ワークスペースルートで実行）:
//   node .claude/skills/anytime-dev-audit/ingest-wiring-check.cjs [--json] [--workspace <dir>]
//                                                                [--now <ISO8601>] [--no-network]
//
// 終了コード: 0 = error 判定なし（warn / 測定不能は 0）/ 1 = error 判定あり

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

/** D2: 実データの鮮度がこの時間を超えて遅れていたら error。 */
const STALE_HOURS = 24;
/** D3: 同一 scope がこの回数連続で skipped なら warn。 */
const SKIP_STREAK = 50;
/** D4: LLM 疎通のタイムアウト（ミリ秒）。 */
const PROBE_TIMEOUT_MS = 3000;
/** D5: lep.json の stage 許容集合（大文字小文字を区別する）。 */
const VALID_STAGES = ['disabled', 'sources', 'primary', 'memory', 'primary+memory', 'all'];

const SETTING_WORKSPACE_PATH = 'anytimeTrail.workspace.path';
const SETTING_LEP_CONFIG_PATH = 'anytimeTrail.lep.configPath';
const SETTING_DOCS_ROOT = 'anytimeMarkdown.docsRoot';

function logWarn(message) {
  console.error(`[${new Date().toISOString()}] [WARN] ingest-wiring-check: ${message}`);
}

/**
 * VS Code の settings.json は JSONC（// と / * * / コメント・末尾カンマ可）。JSON.parse は
 * そのままでは落ちるため、文字列リテラルの外側だけを除去してから parse する。
 */
function parseJsonc(text) {
  if (typeof text !== 'string' || text.trim() === '') return null;
  let out = '';
  let inString = false;
  let inLine = false;
  let inBlock = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    const next = text[i + 1];
    if (inLine) {
      if (c === '\n') { inLine = false; out += c; }
      continue;
    }
    if (inBlock) {
      if (c === '*' && next === '/') { inBlock = false; i += 1; }
      continue;
    }
    if (inString) {
      out += c;
      if (c === '\\') { out += next ?? ''; i += 1; continue; }
      if (c === '"') inString = false;
      continue;
    }
    if (c === '"') { inString = true; out += c; continue; }
    if (c === '/' && next === '/') { inLine = true; i += 1; continue; }
    if (c === '/' && next === '*') { inBlock = true; i += 1; continue; }
    out += c;
  }
  const withoutTrailingCommas = out.replace(/,(\s*[}\]])/g, '$1');
  try {
    return JSON.parse(withoutTrailingCommas);
  } catch (err) {
    logWarn(`settings の JSONC 解析に失敗: ${err.message}`);
    return null;
  }
}

/** VS Code 設定の探索順（後勝ち）。Machine → User → ワークスペース。 */
function settingsCandidates(workspaceRoot, home, platform = process.platform) {
  const userCandidates = [
    path.join(home, '.vscode-server', 'data', 'User', 'settings.json'),
    platform === 'darwin'
      ? path.join(home, 'Library', 'Application Support', 'Code', 'User', 'settings.json')
      : path.join(home, '.config', 'Code', 'User', 'settings.json'),
  ];
  return [
    { scope: 'machine', file: path.join(home, '.vscode-server', 'data', 'Machine', 'settings.json') },
    ...userCandidates.map((file) => ({ scope: 'user', file })),
    { scope: 'workspace', file: path.join(workspaceRoot, '.vscode', 'settings.json') },
  ];
}

/**
 * 候補ファイルを後勝ちで合成する。値ごとに由来ファイルを残す（どの層の残骸かを報告するため）。
 * VS Code 設定はドット区切りのフラットキーとネストオブジェクトの両方を許すので両方を畳む。
 */
function mergeSettings(sources) {
  const values = {};
  const files = [];
  for (const { scope, file, content } of sources) {
    files.push({ scope, file, loaded: content !== null && content !== undefined });
    const parsed = parseJsonc(content ?? '');
    if (parsed === null || typeof parsed !== 'object') continue;
    for (const [key, value] of flattenSettings(parsed)) {
      values[key] = { value, source: file, scope };
    }
  }
  return { values, files };
}

/** ネストオブジェクトをドット区切りのフラットキーへ畳む（配列・プリミティブは葉）。 */
function flattenSettings(obj, prefix = '') {
  const out = [];
  for (const [key, value] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      out.push([full, value]);
      out.push(...flattenSettings(value, full));
    } else {
      out.push([full, value]);
    }
  }
  return out;
}

function settingValue(settings, key) {
  const entry = settings.values[key];
  return entry === undefined ? null : entry;
}

/**
 * 監視対象リポジトリの解決（拡張実装と同じ合成）。
 * 拡張は anytimeTrail.workspace.path が非空ならワークスペースフォルダを**上書き**したうえで
 * lep.json の sources.gitRoots へ加える。空文字はフォールバックなのでワークスペースルートになる。
 */
function resolveWatchedRepoPaths({ lepConfig, settings, workspaceRoot }) {
  const configured = settingValue(settings, SETTING_WORKSPACE_PATH);
  const overridden = typeof configured?.value === 'string' ? configured.value.trim() : '';
  const effectiveWorkspace = overridden || workspaceRoot;
  const gitRoots = Array.isArray(lepConfig?.sources?.gitRoots) ? lepConfig.sources.gitRoots : [];

  const seen = new Set();
  const result = [];
  const push = (p, origin) => {
    if (typeof p !== 'string' || p.trim() === '') return;
    const resolved = path.resolve(p.trim());
    if (seen.has(resolved)) return;
    seen.add(resolved);
    result.push({ path: resolved, origin });
  };
  for (const root of gitRoots) push(root, 'lep.sources.gitRoots');
  push(effectiveWorkspace, overridden ? SETTING_WORKSPACE_PATH : 'workspaceFolder');
  return { paths: result, overriddenBySetting: overridden !== '' };
}

function hoursBetween(laterIso, earlierIso) {
  const later = Date.parse(laterIso);
  const earlier = Date.parse(earlierIso);
  if (Number.isNaN(later) || Number.isNaN(earlier)) return null;
  return (later - earlier) / 3_600_000;
}

const finding = (id, title, severity, status, detail, evidence = {}) => ({
  id,
  title,
  severity,
  status,
  detail,
  evidence,
});

/**
 * 収集済みの事実から D1〜D7 を判定する（純関数・I/O なし）。
 * status: fired = 判定条件に該当 / ok = 該当なし / unmeasurable = 測れなかった（0 ではない）/
 *         not-applicable = 対象外（Trail 未導入）。
 */
function judge(facts) {
  const out = [];
  const trailAbsent = facts.dbDir.exists !== true;
  const na = (id, title, severity) =>
    finding(id, title, severity, 'not-applicable', `対象外: ${facts.dbDir.path} が無い（Trail 未導入）`);

  // D1: 監視リポジトリの解決結果
  if (trailAbsent) {
    out.push(na('D1', '監視リポジトリの解決結果', 'error'));
  } else {
    const missing = facts.watched.filter((w) => !w.exists);
    const notGit = facts.watched.filter((w) => w.exists && w.isGitWorkTree === false);
    const empty = facts.watched.length === 0;
    const fired = empty || missing.length > 0;
    const parts = [`解決結果 ${facts.watched.length} 件`];
    if (empty) parts.push('監視対象が 0 件（コミット取込は行われない）');
    if (missing.length > 0) parts.push(`実在しない: ${missing.map((w) => w.path).join(', ')}`);
    if (notGit.length > 0) parts.push(`git working tree でない: ${notGit.map((w) => w.path).join(', ')}`);
    if (!facts.watched.some((w) => w.path === facts.workspaceRoot)) {
      parts.push(
        `注記: 本ワークスペース（${facts.workspaceRoot}）自身は監視対象に含まれない — 取込が届いているかは D2 で確認する`,
      );
    }
    out.push(
      finding('D1', '監視リポジトリの解決結果', 'error', fired ? 'fired' : 'ok', parts.join(' / '), {
        watched: facts.watched,
        overriddenBySetting: facts.watchedOverriddenBySetting,
      }),
    );
  }

  // D2: コミット取込の鮮度
  if (trailAbsent) {
    out.push(na('D2', 'コミット取込の鮮度', 'error'));
  } else if (facts.ingest.status !== 'ok') {
    out.push(
      finding('D2', 'コミット取込の鮮度', 'error', 'unmeasurable', `測定不能: ${facts.ingest.reason}`),
    );
  } else if (facts.git.headCommittedAt === null) {
    out.push(
      finding('D2', 'コミット取込の鮮度', 'error', 'unmeasurable', '測定不能: git の最新コミットを取得できない'),
    );
  } else {
    const last = facts.ingest.lastCommittedAt;
    const lagHours = last === null ? null : hoursBetween(facts.now, last);
    const hasNewer = last === null || Date.parse(facts.git.headCommittedAt) > Date.parse(last);
    const stale = last === null || (lagHours !== null && lagHours > STALE_HOURS);
    const fired = stale && hasNewer;
    const lagText = last === null ? '取込 0 件' : `${lagHours.toFixed(1)} 時間前（${last}）`;
    out.push(
      finding(
        'D2',
        'コミット取込の鮮度',
        'error',
        fired ? 'fired' : 'ok',
        `最終取込 ${lagText} / git HEAD ${facts.git.headCommittedAt}` +
          `${fired ? ` — ${STALE_HOURS} 時間超の遅れがあり、未取込のコミットが存在する` : ''}` +
          `（集計範囲: ${facts.ingest.scope}）`,
        { lastCommittedAt: last, headCommittedAt: facts.git.headCommittedAt, scope: facts.ingest.scope },
      ),
    );
  }

  // D3: パイプラインの恒常 skip
  if (trailAbsent) {
    out.push(na('D3', 'パイプラインの恒常 skip', 'warn'));
  } else if (facts.pipelines.status !== 'ok') {
    out.push(
      finding('D3', 'パイプラインの恒常 skip', 'warn', 'unmeasurable', `測定不能: ${facts.pipelines.reason}`),
    );
  } else {
    const stuck = facts.pipelines.scopes.filter((s) => s.skipStreak >= SKIP_STREAK);
    out.push(
      finding(
        'D3',
        'パイプラインの恒常 skip',
        'warn',
        stuck.length > 0 ? 'fired' : 'ok',
        stuck.length === 0
          ? `直近 ${SKIP_STREAK} 回連続 skipped の scope は無し（対象 ${facts.pipelines.scopes.length} scope）`
          : stuck
              .map((s) => `${s.scope}: ${s.skipStreak} 回連続 skipped（理由: ${s.reasons.join(' / ') || '記録なし'}）`)
              .join(' / '),
        { stuck },
      ),
    );
  }

  // D4: LLM 到達性
  if (trailAbsent) {
    out.push(na('D4', 'LLM 到達性', 'warn'));
  } else if (facts.llm.length === 0) {
    out.push(finding('D4', 'LLM 到達性', 'warn', 'ok', 'lep.json に llm.providers の定義が無い'));
  } else {
    const skipped = facts.llm.filter((p) => p.status === 'skipped');
    const bad = facts.llm.filter((p) => p.status === 'unreachable');
    let status = 'ok';
    if (bad.length > 0) status = 'fired';
    else if (skipped.length === facts.llm.length) status = 'unmeasurable';
    const detail = facts.llm
      .map((p) => {
        const hint =
          p.status === 'unreachable' && facts.inContainer && /^https?:\/\/(localhost|127\.0\.0\.1)\b/.test(p.baseUrl)
            ? '（Dev Container 内のため host.docker.internal を推奨）'
            : '';
        return `${p.provider}: ${p.baseUrl} → ${p.detail}${hint}`;
      })
      .join(' / ');
    out.push(finding('D4', 'LLM 到達性', 'warn', status, detail, { providers: facts.llm }));
  }

  // D5: lep.json の値検証
  if (trailAbsent) {
    out.push(na('D5', 'lep.json の値検証', 'warn'));
  } else if (!facts.lep.exists) {
    out.push(finding('D5', 'lep.json の値検証', 'warn', 'unmeasurable', `測定不能: ${facts.lep.path} が無い`));
  } else if (facts.lep.config === null) {
    out.push(finding('D5', 'lep.json の値検証', 'warn', 'unmeasurable', `測定不能: ${facts.lep.path} を解析できない`));
  } else {
    const stage = facts.lep.config.stage;
    const valid = VALID_STAGES.includes(stage);
    const caseOnly =
      !valid && typeof stage === 'string' && VALID_STAGES.includes(stage.toLowerCase());
    out.push(
      finding(
        'D5',
        'lep.json の値検証',
        'warn',
        valid ? 'ok' : 'fired',
        valid
          ? `stage="${stage}"（許容値）`
          : `stage=${JSON.stringify(stage)} は許容集合外` +
            `${caseOnly ? `（大文字小文字のみ不一致。正しくは "${String(stage).toLowerCase()}"）` : ''}` +
            ` — 起動時にフォールバックが起き、指定した Wave は実行されない。許容値: ${VALID_STAGES.join(' / ')}`,
        { stage, validStages: VALID_STAGES },
      ),
    );
  }

  // D6: ドキュメント索引
  const docsRoot = facts.docIndex.docsRoot;
  const docsRootEmpty = docsRoot === null || docsRoot === '';
  const catalogMissing = !facts.docIndex.catalogExists;
  out.push(
    finding(
      'D6',
      'ドキュメント索引',
      'warn',
      docsRootEmpty || catalogMissing ? 'fired' : 'ok',
      docsRootEmpty
        ? `${SETTING_DOCS_ROOT} が空（拡張はドキュメント索引を無効化する）`
        : catalogMissing
          ? `${SETTING_DOCS_ROOT}=${docsRoot} だが ${facts.docIndex.catalogDbPath} が無い`
          : `${SETTING_DOCS_ROOT}=${docsRoot} / ${facts.docIndex.catalogDbPath} あり`,
      facts.docIndex,
    ),
  );

  // D7: 他プロジェクトの設定残骸
  // ワークスペース外そのものは異常ではない。docsRoot を意図的に外部リポジトリへ置く運用があるため、
  // CLAUDE.md が「- docsRoot: <path>」で宣言した値と一致するパスは残骸ではなく設計として除外する。
  const outside = facts.referencedPaths.filter(
    (p) =>
      p.path !== facts.workspaceRoot &&
      !p.path.startsWith(`${facts.workspaceRoot}${path.sep}`) &&
      !(facts.declaredDocsRoot !== null && p.path === facts.declaredDocsRoot),
  );
  out.push(
    finding(
      'D7',
      '他プロジェクトの設定残骸',
      'warn',
      outside.length > 0 ? 'fired' : 'ok',
      outside.length === 0
        ? '参照パスはすべてワークスペース内'
        : outside.map((p) => `${p.origin}=${p.path}（${p.exists ? '実在する' : '実在しない'}）`).join(' / '),
      { outside },
    ),
  );

  return out;
}

function tryExec(cmd, args) {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (err) {
    if (err?.code !== 'ENOENT' && (err?.status === null || err?.status === undefined)) {
      logWarn(`${cmd} ${args.join(' ')} — ${err?.message ?? err}`);
    }
    return null;
  }
}

/**
 * readonly の SQLite リーダを作る。better-sqlite3（ワークスペースにあれば）→ sqlite3 CLI の順。
 * どちらも無ければ null を返し、呼び出し側は「測定不能（理由）」として 0 と区別する。
 */
function createDbReader() {
  try {
    const Database = require('better-sqlite3');
    return {
      kind: 'better-sqlite3',
      query(dbPath, sql) {
        const db = new Database(dbPath, { readonly: true, fileMustExist: true });
        try {
          return db.prepare(sql).all();
        } finally {
          db.close();
        }
      },
    };
  } catch {
    // better-sqlite3 はワークスペース依存。無いのは想定内なので CLI へ落とす。
  }
  const cli = tryExec(process.platform === 'win32' ? 'where' : 'which', ['sqlite3']);
  if (cli === null) return null;
  return {
    kind: 'sqlite3-cli',
    query(dbPath, sql) {
      const raw = execFileSync('sqlite3', ['-json', `file:${dbPath}?mode=ro`, sql], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
      return raw === '' ? [] : JSON.parse(raw);
    },
  };
}

function probeHttp(baseUrl, timeoutMs = PROBE_TIMEOUT_MS) {
  return new Promise((resolve) => {
    let url;
    try {
      url = new URL(baseUrl);
    } catch {
      resolve({ status: 'unreachable', detail: 'baseUrl が URL として不正' });
      return;
    }
    const client = url.protocol === 'https:' ? require('node:https') : require('node:http');
    const req = client.request(url, { method: 'GET', timeout: timeoutMs }, (res) => {
      res.resume();
      resolve({ status: 'ok', detail: `HTTP ${res.statusCode}` });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 'unreachable', detail: `${timeoutMs}ms でタイムアウト` });
    });
    req.on('error', (err) => resolve({ status: 'unreachable', detail: err.code ?? err.message }));
    req.end();
  });
}

function readJsonFile(file) {
  if (!fs.existsSync(file)) return { exists: false, config: null };
  try {
    return { exists: true, config: JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch (err) {
    logWarn(`${file} の解析に失敗: ${err.message}`);
    return { exists: true, config: null };
  }
}

function isGitWorkTree(dir) {
  return tryExec('git', ['-C', dir, 'rev-parse', '--is-inside-work-tree']) === 'true';
}

/** 副作用のある収集。判定は judge() に閉じ込め、ここは事実の取得だけを行う。 */
async function collectFacts({ workspaceRoot, now, network, home }) {
  const sources = settingsCandidates(workspaceRoot, home).map(({ scope, file }) => ({
    scope,
    file,
    content: fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null,
  }));
  const settings = mergeSettings(sources);

  const lepSetting = settingValue(settings, SETTING_LEP_CONFIG_PATH);
  const lepPath =
    typeof lepSetting?.value === 'string' && lepSetting.value.trim() !== ''
      ? path.resolve(lepSetting.value.trim())
      : path.join(workspaceRoot, '.anytime', 'trail', 'lep.json');
  const lep = { path: lepPath, ...readJsonFile(lepPath) };

  const storagePath = lep.config?.database?.storagePath ?? '.anytime/trail/db';
  const dbDirPath = path.isAbsolute(storagePath) ? storagePath : path.join(workspaceRoot, storagePath);
  const dbDir = { path: dbDirPath, exists: fs.existsSync(dbDirPath) };

  const { paths: watchedPaths, overriddenBySetting } = resolveWatchedRepoPaths({
    lepConfig: lep.config,
    settings,
    workspaceRoot,
  });
  const watched = watchedPaths.map((w) => {
    const exists = fs.existsSync(w.path);
    return { ...w, exists, isGitWorkTree: exists ? isGitWorkTree(w.path) : null };
  });

  const headCommittedAt = tryExec('git', ['-C', workspaceRoot, 'log', '-1', '--format=%cI']);
  const reader = dbDir.exists ? createDbReader() : null;

  const ingest = readIngestFreshness({ reader, dbDir, workspaceRoot });
  const pipelines = readPipelineStreaks({ reader, dbDir });

  const providers = Object.entries(lep.config?.llm?.providers ?? {}).filter(
    ([, v]) => typeof v?.baseUrl === 'string' && v.baseUrl !== '',
  );
  const llm = [];
  for (const [provider, cfg] of providers) {
    if (!network) {
      llm.push({ provider, baseUrl: cfg.baseUrl, status: 'skipped', detail: '--no-network のため未疎通' });
      continue;
    }
    // eslint-disable-next-line no-await-in-loop -- プロバイダ数は 1〜2 件で、並列化の利得より順序の可読性を採る
    const probe = await probeHttp(cfg.baseUrl);
    llm.push({ provider, baseUrl: cfg.baseUrl, ...probe });
  }

  const docsRootSetting = settingValue(settings, SETTING_DOCS_ROOT);
  const docsRoot = typeof docsRootSetting?.value === 'string' ? docsRootSetting.value.trim() : null;
  const catalogDbPath = path.join(workspaceRoot, '.anytime', 'markdown', 'catalog.db');

  const referencedPaths = [
    ...watched.map((w) => ({ origin: w.origin, path: w.path, exists: w.exists })),
    ...(docsRoot
      ? [{ origin: SETTING_DOCS_ROOT, path: path.resolve(docsRoot), exists: fs.existsSync(docsRoot) }]
      : []),
  ];

  return {
    workspaceRoot,
    now,
    dbDir,
    dbReader: reader === null ? null : reader.kind,
    settings: { files: settings.files, values: pickReportedSettings(settings) },
    lep: { path: lep.path, exists: lep.exists, config: lep.config },
    watched,
    watchedOverriddenBySetting: overriddenBySetting,
    git: { headCommittedAt },
    ingest,
    pipelines,
    llm,
    inContainer: fs.existsSync('/.dockerenv') || process.env.REMOTE_CONTAINERS === 'true',
    declaredDocsRoot: readDeclaredDocsRoot(workspaceRoot),
    docIndex: { docsRoot, catalogDbPath, catalogExists: fs.existsSync(catalogDbPath) },
    referencedPaths,
  };
}

/** ワークスペースの CLAUDE.md が宣言する「- docsRoot: <path>」（無ければ null）。 */
function readDeclaredDocsRoot(workspaceRoot) {
  const claudeMd = path.join(workspaceRoot, 'CLAUDE.md');
  if (!fs.existsSync(claudeMd)) return null;
  const m = /^[-*]\s*docsRoot:\s*(\S+)\s*$/m.exec(fs.readFileSync(claudeMd, 'utf8'));
  return m ? path.resolve(m[1]) : null;
}

function pickReportedSettings(settings) {
  const keys = [SETTING_WORKSPACE_PATH, SETTING_LEP_CONFIG_PATH, SETTING_DOCS_ROOT];
  return Object.fromEntries(keys.map((k) => [k, settingValue(settings, k)]));
}

/**
 * D2 の実データ。activity_repos にワークスペース名の行があればそれで絞る（監視対象が複数ある
 * 環境では、別リポジトリの取込が続いている間も本リポジトリだけ止まり得るため）。
 */
function readIngestFreshness({ reader, dbDir, workspaceRoot }) {
  if (reader === null) {
    return { status: 'unmeasurable', reason: 'sqlite リーダが無い（better-sqlite3 も sqlite3 CLI も不在）' };
  }
  const dbPath = path.join(dbDir.path, 'activity.db');
  if (!fs.existsSync(dbPath)) return { status: 'unmeasurable', reason: `${dbPath} が無い` };
  const repoName = path.basename(workspaceRoot).replace(/[^A-Za-z0-9._-]/g, '-');
  try {
    const scoped = reader.query(
      dbPath,
      `SELECT MAX(c.committed_at) AS last FROM activity_session_commits c
         JOIN activity_repos r ON r.repo_id = c.repo_id
        WHERE r.repo_name = '${repoName.replace(/'/g, "''")}'`,
    );
    const scopedLast = scoped[0]?.last ?? null;
    if (scopedLast !== null) {
      return { status: 'ok', lastCommittedAt: scopedLast, scope: `repo=${repoName}` };
    }
    const global = reader.query(dbPath, 'SELECT MAX(committed_at) AS last FROM activity_session_commits');
    return {
      status: 'ok',
      lastCommittedAt: global[0]?.last ?? null,
      scope: `全リポジトリ（activity_repos に ${repoName} の行が無い）`,
    };
  } catch (err) {
    return { status: 'unmeasurable', reason: `activity.db を読めない: ${err.message}` };
  }
}

/** D3 の実データ。scope ごとに新しい順へ並べ、先頭から連続する skipped の本数を数える。 */
function readPipelineStreaks({ reader, dbDir }) {
  if (reader === null) {
    return { status: 'unmeasurable', reason: 'sqlite リーダが無い（better-sqlite3 も sqlite3 CLI も不在）' };
  }
  const dbPath = path.join(dbDir.path, 'caravan-book.db');
  if (!fs.existsSync(dbPath)) return { status: 'unmeasurable', reason: `${dbPath} が無い` };
  try {
    const rows = reader.query(
      dbPath,
      `SELECT scope, status, error_detail FROM (
         SELECT scope, status, error_detail, started_at,
                ROW_NUMBER() OVER (PARTITION BY scope ORDER BY started_at DESC) AS rn
           FROM caravan_pipeline_runs
       ) WHERE rn <= ${SKIP_STREAK} ORDER BY scope, rn`,
    );
    return { status: 'ok', scopes: summarizeSkipStreaks(rows) };
  } catch (err) {
    return { status: 'unmeasurable', reason: `caravan-book.db を読めない: ${err.message}` };
  }
}

/** scope ごとの「先頭から連続する skipped」本数と理由コードを集計する（新しい順の行を渡す）。 */
function summarizeSkipStreaks(rows) {
  const byScope = new Map();
  for (const row of rows) {
    if (!byScope.has(row.scope)) byScope.set(row.scope, []);
    byScope.get(row.scope).push(row);
  }
  const out = [];
  for (const [scope, runs] of byScope) {
    let streak = 0;
    const reasons = new Set();
    for (const run of runs) {
      if (run.status !== 'skipped') break;
      streak += 1;
      if (run.error_detail) reasons.add(run.error_detail);
    }
    out.push({ scope, skipStreak: streak, sampled: runs.length, reasons: [...reasons] });
  }
  return out.sort((a, b) => b.skipStreak - a.skipStreak);
}

function formatText(report) {
  const lines = [`[dev-audit ingest 配線診断] workspace=${report.facts.workspaceRoot}`];
  const mark = { fired: '発火', ok: 'ok', unmeasurable: '測定不能', 'not-applicable': '対象外' };
  for (const f of report.findings) {
    const label = f.status === 'fired' ? f.severity.toUpperCase() : mark[f.status];
    lines.push(`  - ${f.id} ${f.title}: ${label} — ${f.detail}`);
  }
  lines.push(
    `  判定: error ${report.summary.error} 件 / warn ${report.summary.warn} 件 / 測定不能 ${report.summary.unmeasurable} 件 / 対象外 ${report.summary.notApplicable} 件`,
  );
  return lines.join('\n');
}

function summarize(findings) {
  const fired = findings.filter((f) => f.status === 'fired');
  return {
    error: fired.filter((f) => f.severity === 'error').length,
    warn: fired.filter((f) => f.severity === 'warn').length,
    unmeasurable: findings.filter((f) => f.status === 'unmeasurable').length,
    notApplicable: findings.filter((f) => f.status === 'not-applicable').length,
  };
}

async function runIngestWiringCheck({ workspaceRoot, now, network, home }) {
  const facts = await collectFacts({ workspaceRoot, now, network, home });
  const findings = judge(facts);
  return { checkedAt: now, facts, findings, summary: summarize(findings) };
}

async function main(argv) {
  const args = argv.slice(2);
  const readOpt = (name, fallback) => {
    const i = args.indexOf(name);
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
  };
  const report = await runIngestWiringCheck({
    workspaceRoot: path.resolve(readOpt('--workspace', process.cwd())),
    now: readOpt('--now', new Date().toISOString()),
    network: !args.includes('--no-network'),
    home: os.homedir(),
  });
  console.log(args.includes('--json') ? JSON.stringify(report, null, 2) : formatText(report));
  return report.summary.error > 0 ? 1 : 0;
}

if (require.main === module) {
  main(process.argv).then((code) => process.exit(code));
}

module.exports = {
  parseJsonc,
  readDeclaredDocsRoot,
  flattenSettings,
  settingsCandidates,
  mergeSettings,
  resolveWatchedRepoPaths,
  summarizeSkipStreaks,
  judge,
  summarize,
  formatText,
  collectFacts,
  runIngestWiringCheck,
  STALE_HOURS,
  SKIP_STREAK,
  VALID_STAGES,
};
