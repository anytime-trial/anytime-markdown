#!/usr/bin/env node
// anytime-dev-audit — ingest 配線診断の事実収集（I/O 層）。
//
// 判定は ingest-wiring-judge.cjs が行う。ここは「何が設定され、何が取り込まれているか」を
// 集めるだけで、良し悪しを決めない。測れなかったものは 0 ではなく理由付きの unmeasurable として返す。

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { resolveExecutable, runCommand, tryExec, gitWorkTreeProbe } = require('./ingest-wiring-exec.cjs');
const {
  parseJsonc,
  settingsCandidates,
  mergeSettings,
  settingValue,
} = require('./ingest-wiring-settings.cjs');
const {
  SKIP_STREAK,
  SETTING_WORKSPACE_PATH,
  SETTING_LEP_CONFIG_PATH,
  SETTING_DOCS_ROOT,
} = require('./ingest-wiring-judge.cjs');

/** D4: LLM 疎通のタイムアウト（ミリ秒）。 */
const PROBE_TIMEOUT_MS = 3000;
/** worktree 直下のセグメント名。親リポジトリ名へ正規化する（trail-db の sessionMeta と同じ規則）。 */
const WORKTREE_SEGMENTS = new Set(['.worktrees', '.claude-worktrees']);

function logWarn(message) {
  console.error(`[${new Date().toISOString()}] [WARN] ingest-wiring-check: ${message}`);
}

/** オブジェクトの deep merge（配列・プリミティブは後勝ちで置換）。lep.json の階層合成用。 */
function deepMerge(base, override) {
  if (override === null || typeof override !== 'object' || Array.isArray(override)) return override;
  const out = { ...(base ?? {}) };
  for (const [key, value] of Object.entries(override)) {
    const prev = out[key];
    out[key] =
      prev !== null && typeof prev === 'object' && !Array.isArray(prev) &&
      value !== null && typeof value === 'object' && !Array.isArray(value)
        ? deepMerge(prev, value)
        : value;
  }
  return out;
}

/**
 * lep.json の探索パス（precedence 低→高）。本番の lepConfigSearchPaths と同じ候補列。
 * 1 ファイルしか読まないと、gitRoots や storagePath を lep.local.json へ置いた環境で
 * 「監視対象 0 件」「Trail 未導入」と誤判定する。
 */
function lepConfigCandidates(workspaceRoot, home, override) {
  if (override) return [path.resolve(override)];
  return [
    path.join(home, '.anytime', 'trail', 'lep.json'),
    path.join(workspaceRoot, '.anytime', 'trail', 'lep.json'),
    path.join(workspaceRoot, '.anytime', 'trail', 'lep.local.json'),
  ];
}

/** 候補を precedence 順に deep merge する。内蔵 default は再現しない（stage 未指定は判定側で扱う）。 */
function loadLepConfig(candidates, readFile = (p) => fs.readFileSync(p, 'utf8'), exists = fs.existsSync) {
  let config = null;
  const loadedPaths = [];
  const failedPaths = [];
  for (const file of candidates) {
    if (!exists(file)) continue;
    let parsed;
    try {
      parsed = JSON.parse(readFile(file));
    } catch (err) {
      // 本番の loadLepConfig も warn して continue するため、解析できないファイルの設定は
      // production でも全て無視される。「読んだ」側へ混ぜると、成立していないマージ連鎖を
      // 所見として報告することになる。
      logWarn(`${file} の解析に失敗: ${err.message}`);
      failedPaths.push({ file, reason: err.message });
      continue;
    }
    config = config === null ? parsed : deepMerge(config, parsed);
    loadedPaths.push(file);
  }
  return { config, loadedPaths, failedPaths, candidates };
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
    // 相対パスは cwd ではなくワークスペースルート基準で解決する（--workspace 指定時に
    // 別ディレクトリを測らないため）。
    const resolved = path.resolve(workspaceRoot, p.trim());
    if (seen.has(resolved)) return;
    seen.add(resolved);
    result.push({ path: resolved, origin });
  };
  for (const root of gitRoots) push(root, 'lep.sources.gitRoots');
  push(effectiveWorkspace, overridden ? SETTING_WORKSPACE_PATH : 'workspaceFolder');
  return { paths: result, overriddenBySetting: overridden !== '' };
}

/**
 * activity_repos.repo_name の導出規則を再現する。
 *
 * 本番は sanitize せず basename を取り（resolveWatchedRepos）、worktree 直下は親リポジトリへ
 * 正規化する（trail-db の sessionMeta）。独自に slug 化すると、worktree 運用や記号を含む
 * ディレクトリ名で必ず外れ、別リポジトリの取込が本リポジトリの停止を隠す。
 */
function resolveRepoName(workspaceRoot, gitToplevel = null) {
  const base = gitToplevel ?? workspaceRoot;
  // git rev-parse --show-toplevel は Windows でもスラッシュ区切りで返すため両方を区切りとして扱う。
  const segments = base.split(/[\\/]/).filter((s) => s !== '');
  for (let i = segments.length - 1; i >= 1; i -= 1) {
    if (WORKTREE_SEGMENTS.has(segments[i])) return segments[i - 1];
  }
  return segments.at(-1) ?? '';
}

/** symlink を解決した実パス（解決できなければ入力をそのまま返す）。 */
function realPathOrSelf(target) {
  try {
    return fs.realpathSync(target);
  } catch (err) {
    logWarn(`realpath を解決できない（入力パスをそのまま使う）: ${target} — ${err.message}`);
    return target;
  }
}

/** SQL の文字列リテラルとして安全に埋め込む（sqlite3 CLI 経路はバインドを使えないため）。 */
const sqlQuote = (value) => `'${String(value).replace(/'/g, "''")}'`;

/**
 * readonly の SQLite リーダを作る。better-sqlite3（ワークスペースにあれば）→ sqlite3 CLI の順。
 * どちらも無ければ reader:null と理由を返し、呼び出し側は「測定不能（理由）」として 0 と区別する。
 *
 * Why not ロード失敗を握りつぶさない: MODULE_NOT_FOUND 以外（NODE_MODULE_VERSION 不一致・
 * ネイティブバインディング解決失敗）を「不在」と報告すると、調査が「入れ忘れ」へ誘導される。
 */
function createDbReader() {
  let loadError = null;
  try {
    const Database = require('better-sqlite3');
    return {
      reader: {
        kind: 'better-sqlite3',
        query(dbPath, sql, params = []) {
          const db = new Database(dbPath, { readonly: true, fileMustExist: true });
          try {
            return db.prepare(sql).all(...params);
          } finally {
            db.close();
          }
        },
      },
      reason: null,
    };
  } catch (err) {
    if (err?.code !== 'MODULE_NOT_FOUND') {
      loadError = err?.message ?? String(err);
      logWarn(`better-sqlite3 のロードに失敗（不在ではなく壊れている）: ${loadError}`);
    }
  }

  const cli = resolveExecutable('sqlite3');
  if (cli === null) {
    return {
      reader: null,
      reason:
        loadError === null
          ? 'sqlite リーダが無い（better-sqlite3 も sqlite3 CLI も不在）'
          : `sqlite リーダを使えない（better-sqlite3 のロード失敗: ${loadError} / sqlite3 CLI も不在）`,
    };
  }
  return {
    reader: {
      kind: 'sqlite3-cli',
      // CLI はプレースホルダを受けないため、呼び出し側が sqlQuote 済みの SQL を渡す。
      query(dbPath, sql) {
        // which で確認したものと別の実行ファイルを起動しないよう、解決済みの絶対パスを使う。
        const raw = execFileSync(cli, ['-json', `file:${dbPath}?mode=ro`, sql], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        }).trim();
        return raw === '' ? [] : JSON.parse(raw);
      },
    },
    reason: null,
  };
}

/** リーダ種別の差（プレースホルダ可否）を吸収して 1 本の SQL を実行する。 */
function queryWithRepoName(reader, dbPath, sqlTemplate, repoName) {
  return reader.kind === 'better-sqlite3'
    ? reader.query(dbPath, sqlTemplate.replace('$repoName', () => '?'), [repoName])
    : reader.query(dbPath, sqlTemplate.replace('$repoName', () => sqlQuote(repoName)));
}

const INGEST_SQL = `SELECT MAX(c.committed_at) AS last FROM activity_session_commits c
   JOIN activity_repos r ON r.repo_id = c.repo_id
  WHERE r.repo_name = $repoName`;

/**
 * D2 の実データ。activity_repos にワークスペース名の行があればそれで絞る（監視対象が複数ある
 * 環境では、別リポジトリの取込が続いている間も本リポジトリだけ止まり得るため）。
 */
function readIngestFreshness({ reader, readerReason, dbDir, repoName, existsSync = fs.existsSync }) {
  if (reader === null) return { status: 'unmeasurable', reason: readerReason };
  const dbPath = path.join(dbDir.path, 'activity.db');
  if (!existsSync(dbPath)) return { status: 'unmeasurable', reason: `${dbPath} が無い` };
  try {
    const scoped = queryWithRepoName(reader, dbPath, INGEST_SQL, repoName);
    const scopedLast = scoped[0]?.last ?? null;
    if (scopedLast !== null) {
      return { status: 'ok', lastCommittedAt: scopedLast, scope: `repo=${repoName}` };
    }
    const all = reader.query(dbPath, 'SELECT MAX(committed_at) AS last FROM activity_session_commits');
    return {
      status: 'ok',
      lastCommittedAt: all[0]?.last ?? null,
      scope: `全リポジトリ（activity_repos に ${repoName} の行が無い — 他リポジトリの取込が本リポジトリの停止を隠し得る）`,
    };
  } catch (err) {
    return { status: 'unmeasurable', reason: `activity.db を読めない: ${err.message}` };
  }
}

const PIPELINE_SQL = `SELECT scope, status, error_detail FROM (
     SELECT scope, status, error_detail, started_at,
            ROW_NUMBER() OVER (PARTITION BY scope ORDER BY started_at DESC) AS rn
       FROM caravan_pipeline_runs
   ) WHERE rn <= ${SKIP_STREAK} ORDER BY scope, rn`;

/** D3 の実データ。scope ごとに新しい順へ並べ、先頭から連続する skipped の本数を数える。 */
function readPipelineStreaks({ reader, readerReason, dbDir, existsSync = fs.existsSync }) {
  if (reader === null) return { status: 'unmeasurable', reason: readerReason };
  const dbPath = path.join(dbDir.path, 'caravan-book.db');
  if (!existsSync(dbPath)) return { status: 'unmeasurable', reason: `${dbPath} が無い` };
  try {
    return { status: 'ok', scopes: summarizeSkipStreaks(reader.query(dbPath, PIPELINE_SQL)) };
  } catch (err) {
    return { status: 'unmeasurable', reason: `caravan-book.db を読めない: ${err.message}` };
  }
}

/** error_detail は `skipped: <reasonCode> — <detail>` 形式。detail は可変なので理由コードだけ畳む。 */
function extractReasonCode(errorDetail) {
  const m = /^\s*(?:skipped:\s*)?([a-z][a-z0-9_]*)/i.exec(String(errorDetail ?? ''));
  return m ? m[1] : null;
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
    const reasonCodes = new Set();
    const samples = [];
    for (const run of runs) {
      if (run.status !== 'skipped') break;
      streak += 1;
      const code = extractReasonCode(run.error_detail);
      if (code !== null) reasonCodes.add(code);
      if (run.error_detail && samples.length < 3) samples.push(run.error_detail);
    }
    out.push({ scope, skipStreak: streak, sampled: runs.length, reasonCodes: [...reasonCodes], samples });
  }
  return out.sort((a, b) => b.skipStreak - a.skipStreak);
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

/** ワークスペースの CLAUDE.md が宣言する「- docsRoot: <path>」（無ければ null）。 */
function readDeclaredDocsRoot(workspaceRoot) {
  const claudeMd = path.join(workspaceRoot, 'CLAUDE.md');
  if (!fs.existsSync(claudeMd)) return null;
  const m = /^[-*]\s*docsRoot:\s*(\S+)\s*$/m.exec(fs.readFileSync(claudeMd, 'utf8'));
  return m ? path.resolve(workspaceRoot, m[1]) : null;
}

function pickReportedSettings(settings) {
  const keys = [SETTING_WORKSPACE_PATH, SETTING_LEP_CONFIG_PATH, SETTING_DOCS_ROOT];
  return Object.fromEntries(keys.map((k) => [k, settingValue(settings, k)]));
}

/** 副作用のある収集。判定は judge() に閉じ込め、ここは事実の取得だけを行う。 */
async function collectFacts({ workspaceRoot, now, network, home }) {
  const settings = mergeSettings(
    settingsCandidates(workspaceRoot, home).map(({ scope, file }) => ({
      scope,
      file,
      content: fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null,
    })),
  );

  const lepOverride = settingValue(settings, SETTING_LEP_CONFIG_PATH);
  const lep = loadLepConfig(
    lepConfigCandidates(
      workspaceRoot,
      home,
      typeof lepOverride?.value === 'string' && lepOverride.value.trim() !== '' ? lepOverride.value.trim() : null,
    ),
  );

  const storagePath = lep.config?.database?.storagePath ?? '.anytime/trail/db';
  const dbDirPath = path.resolve(workspaceRoot, storagePath);
  const dbDir = { path: dbDirPath, exists: fs.existsSync(dbDirPath) };

  const { paths: watchedPaths, overriddenBySetting } = resolveWatchedRepoPaths({
    lepConfig: lep.config,
    settings,
    workspaceRoot,
  });
  const watched = watchedPaths.map((w) => {
    const exists = fs.existsSync(w.path);
    return {
      ...w,
      exists,
      realPath: exists ? realPathOrSelf(w.path) : w.path,
      isGitWorkTree: exists ? gitWorkTreeProbe(w.path) : null,
    };
  });

  const { reader, reason: readerReason } = dbDir.exists ? createDbReader() : { reader: null, reason: null };
  const repoName = resolveRepoName(workspaceRoot, tryExec('git', ['-C', workspaceRoot, 'rev-parse', '--show-toplevel']));

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
  const docsRootRaw = typeof docsRootSetting?.value === 'string' ? docsRootSetting.value.trim() : null;
  const docsRoot = docsRootRaw === null || docsRootRaw === '' ? docsRootRaw : path.resolve(workspaceRoot, docsRootRaw);
  const markdownDir = path.join(workspaceRoot, '.anytime', 'markdown');
  const catalogDbPath = path.join(markdownDir, 'catalog.db');

  const workspaceRealPath = realPathOrSelf(workspaceRoot);

  return {
    workspaceRoot,
    workspaceRealPath,
    now,
    dbDir,
    dbReader: reader === null ? null : reader.kind,
    settings: { files: settings.files, values: pickReportedSettings(settings) },
    lep,
    repoName,
    watched,
    watchedOverriddenBySetting: overriddenBySetting,
    git: { headCommittedAt: tryExec('git', ['-C', workspaceRoot, 'log', '-1', '--format=%cI']) },
    ingest: readIngestFreshness({ reader, readerReason, dbDir, repoName }),
    pipelines: readPipelineStreaks({ reader, readerReason, dbDir }),
    llm,
    inContainer: fs.existsSync('/.dockerenv') || process.env.REMOTE_CONTAINERS === 'true',
    declaredDocsRoot: (() => {
      const declared = readDeclaredDocsRoot(workspaceRoot);
      return declared === null ? null : realPathOrSelf(declared);
    })(),
    docIndex: {
      docsRoot,
      catalogDbPath,
      catalogExists: fs.existsSync(catalogDbPath),
      markdownDirExists: fs.existsSync(markdownDir),
    },
    referencedPaths: [
      ...watched.map((w) => ({ origin: w.origin, path: w.path, realPath: w.realPath, exists: w.exists })),
      ...(docsRoot
        ? [
            {
              origin: SETTING_DOCS_ROOT,
              path: docsRoot,
              realPath: fs.existsSync(docsRoot) ? realPathOrSelf(docsRoot) : docsRoot,
              exists: fs.existsSync(docsRoot),
            },
          ]
        : []),
    ],
  };
}

module.exports = {
  realPathOrSelf,
  deepMerge,
  lepConfigCandidates,
  loadLepConfig,
  resolveWatchedRepoPaths,
  resolveRepoName,
  sqlQuote,
  createDbReader,
  queryWithRepoName,
  readIngestFreshness,
  readPipelineStreaks,
  extractReasonCode,
  summarizeSkipStreaks,
  readDeclaredDocsRoot,
  probeHttp,
  collectFacts,
  INGEST_SQL,
  PIPELINE_SQL,
  PROBE_TIMEOUT_MS,
};
