#!/usr/bin/env node
// ollama-probe.cjs — ローカル ollama へ委譲可能なタスクを判定する。
//
//   フェーズ1 spec      実行時の空き VRAM を num_ctx 二分探索で実測する
//   フェーズ2 inventory /api/tags + /api/show で導入モデルの capability を取得する
//   フェーズ4 verify    タスク種別ごとのスモークテストを実走し pass/fail を採る
//
// 判定は「実測 > 公称ベンチ」。ベンチ値(benchmarks)は Claude が Web から取得して
// プロファイルへ書き戻す補助情報であり、実証テストを覆さない。
//
// 使い方:
//   node ollama-probe.cjs                 # spec + inventory のみ（速い）
//   node ollama-probe.cjs --verify        # 実証テストまで実走（数分）
//   node ollama-probe.cjs --vram          # VRAM 二分探索を含める（モデルを再ロードする）
//   node ollama-probe.cjs --json <path>   # プロファイルを JSON 出力（既定 .anytime/ollama-profile.json）

const fs = require('node:fs');
const path = require('node:path');
const { runVerifyTests, VERIFY_TEST_IDS } = require('./ollama-verify.cjs');
const { renderReport } = require('./ollama-report.cjs');
const { loadLedger, resolveBenchmarks, staleEntries } = require('./ollama-benchmarks.cjs');
const { LONG_CTX_TEST_SIZE, TASK_CRITERIA, MODEL_CATALOG } = require('./criteria.cjs');

const CANDIDATE_HOSTS = ['localhost', 'host.docker.internal'];
const PORT = 11434;
const PROBE_TIMEOUT_MS = 5000;

// ---------------------------------------------------------------------------
// 純粋関数（ollama-probe.test.cjs のテスト対象）
// ---------------------------------------------------------------------------

/** モデル一覧から name/digest の安定署名を作る。プロファイルの陳腐化検出に使う。 */
function modelSignature(models) {
  return models
    .map((m) => ({ name: m.name, digest: String(m.digest ?? '').slice(0, 12) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** 保存済みプロファイルが現況のモデル構成と食い違っていれば true（再検証が必要）。 */
function needsRevalidation(profile, currentModels) {
  if (!profile?.models) return true;
  const saved = modelSignature(profile.models);
  const current = modelSignature(currentModels);
  return JSON.stringify(saved) !== JSON.stringify(current);
}

/**
 * num_ctx を上げながらロードした実測サンプルから、実行時に使える VRAM を推定する。
 *
 * 「GPU の総 VRAM」ではなく「その時点で ollama が確保できた量」を返す点が重要。
 * ブラウザや VS Code が VRAM を先に食っていると総量より小さく出る。静的なスペック
 * 表で判定すると外れるため、毎回実測する。
 */
function estimateUsableVram(samples) {
  if (samples.length === 0) return null;

  const spilled = samples.filter((s) => s.vramBytes < s.sizeBytes);
  if (spilled.length > 0) {
    // CPU にはみ出した = GPU 側の上限に到達した。載せられた最大量が実効 VRAM。
    const ceiling = Math.max(...spilled.map((s) => s.vramBytes));
    return { usableGb: ceiling / 1e9, bounded: true, samples };
  }

  // 全サンプルが 100% GPU。上限には未到達なので、これは下限にすぎない。
  const maxLoaded = Math.max(...samples.map((s) => s.vramBytes));
  return { usableGb: maxLoaded / 1e9, bounded: false, samples };
}

/** 実証テスト結果とベンチ値から、モデルごとの委譲可否表を作る。 */
function classifyTaskEligibility(model) {
  const capabilities = model.capabilities ?? [];
  const verify = model.verify ?? {};
  const benchmarks = model.benchmarks ?? {};

  return TASK_CRITERIA.map((task) => {
    const base = { taskId: task.id, label: task.label };

    if (!capabilities.includes(task.capability)) {
      return {
        ...base,
        verdict: 'deny',
        reason: `capability '${task.capability}' を持たない（実測: ${capabilities.join(', ') || 'なし'}）`,
      };
    }

    const failed = task.tests.filter((t) => verify[t]?.passed !== true);
    if (failed.length > 0) {
      const detail = failed
        .map((t) => (verify[t] === undefined ? `${t}(未実行)` : `${t}(${verify[t].detail ?? 'fail'})`))
        .join(', ');
      return { ...base, verdict: 'deny', reason: `実証テスト不合格: ${detail}` };
    }

    const belowFloor = Object.entries(task.floors).filter(
      ([metric, floor]) => benchmarks[metric] !== undefined && benchmarks[metric] < floor,
    );

    // 実証テストで裏取りできないタスク（code-implementation / code-review）は、
    // 公称ベンチだけが唯一のガード。ベンチが欠けている＝判定できないので deny する。
    // ここを「未知なら allow」で通すと、Web 未取得の初回 probe で実装委譲が解禁される。
    if (task.tests.length === 0) {
      const missing = Object.keys(task.floors).filter((m) => benchmarks[m] === undefined);
      if (missing.length > 0) {
        return {
          ...base,
          verdict: 'deny',
          reason: `ベンチ未取得のため判定できない（実証テストで裏取りもできない）: ${missing.join(', ')}`,
        };
      }
      if (belowFloor.length > 0) {
        const detail = belowFloor.map(([m, f]) => `${m}=${benchmarks[m]} < ${f}`).join(', ');
        return { ...base, verdict: 'deny', reason: `ベンチ下限割れ: ${detail}` };
      }
      return { ...base, verdict: 'allow', reason: 'ベンチ下限クリア（実証テストは無い。実タスクで人間が検証すること）' };
    }

    // 実証テストは通った。ベンチ下限を割るものは「サンプル外で崩れる」懸念として
    // conditional に落とす（deny にはしない。実測を覆さないため）。
    if (belowFloor.length > 0) {
      const detail = belowFloor
        .map(([metric, floor]) => `${metric}=${benchmarks[metric]} < ${floor}`)
        .join(', ');
      return { ...base, verdict: 'conditional', reason: `ベンチ下限割れ: ${detail}` };
    }

    // long-ctx テストは CPU へ溢れても「動けば」PASS する。100% GPU を維持できない
    // ctx で長文を投げると速度が数分の一に落ちるため、allow のままにはしない。
    if (task.tests.includes('long-ctx') && model.maxUsableCtx !== undefined) {
      if (model.maxUsableCtx < LONG_CTX_TEST_SIZE) {
        return {
          ...base,
          verdict: 'conditional',
          reason: `100% GPU を維持できる ctx が ${model.maxUsableCtx} しかない（テストは ${LONG_CTX_TEST_SIZE} で実施）。CPU へ溢れて速度が大幅に落ちる`,
        };
      }
    }

    return { ...base, verdict: 'allow', reason: '実証テスト合格' };
  });
}

/** 実効 VRAM に収まるモデルを、ツール呼び出し精度の高い順に薦める。 */
function recommendModels(usableGb, catalog = MODEL_CATALOG) {
  if (usableGb === null || usableGb === undefined) {
    return { fits: [], tooLarge: [], unknown: true };
  }

  const fits = catalog
    .filter((m) => m.sizeGb <= usableGb)
    .sort((a, b) => (b.toolF1 ?? -1) - (a.toolF1 ?? -1));
  const tooLarge = catalog.filter((m) => m.sizeGb > usableGb);

  return { fits, tooLarge, unknown: false };
}

/** タスクを実行できるモデルを選ぶ。allow を conditional より優先。無ければ null。 */
function selectModelForTask(taskId, profile) {
  const candidates = (profile.models ?? [])
    .map((m) => ({ model: m, entry: (m.eligibility ?? []).find((e) => e.taskId === taskId) }))
    .filter((c) => c.entry && c.entry.verdict !== 'deny');

  const allow = candidates.find((c) => c.entry.verdict === 'allow');
  if (allow) return allow.model;

  const conditional = candidates.find((c) => c.entry.verdict === 'conditional');
  return conditional ? conditional.model : null;
}

// ---------------------------------------------------------------------------
// I/O（ollama HTTP API）
// ---------------------------------------------------------------------------

async function fetchJson(url, body, timeoutMs = PROBE_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      method: body ? 'POST' : 'GET',
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} ${url}`);
    return await resp.json();
  } finally {
    clearTimeout(timer);
  }
}

/** localhost → host.docker.internal の順に到達可能なエンドポイントを探す。 */
async function resolveEndpoint() {
  for (const host of CANDIDATE_HOSTS) {
    const base = `http://${host}:${PORT}`;
    try {
      await fetchJson(`${base}/api/version`, undefined, 2000);
      return base;
    } catch {
      // 次のホストを試す（不達は異常ではない）
    }
  }
  return null;
}

async function inventory(base) {
  const tags = await fetchJson(`${base}/api/tags`);
  const models = [];
  for (const m of tags.models ?? []) {
    const show = await fetchJson(`${base}/api/show`, { model: m.name }, 15000);
    const info = show.model_info ?? {};
    const ctxKey = Object.keys(info).find((k) => k.endsWith('.context_length'));
    models.push({
      name: m.name,
      digest: m.digest,
      sizeBytes: m.size,
      capabilities: show.capabilities ?? [],
      family: show.details?.family,
      parameterSize: show.details?.parameter_size,
      quantization: show.details?.quantization_level,
      declaredCtx: ctxKey ? info[ctxKey] : null,
    });
  }
  return models;
}

/** num_ctx を上げながらロードし、GPU オフロードが崩れる境界を探す。 */
async function probeVram(base, modelName, ctxLadder = [4096, 8192, 16384, 32768]) {
  const samples = [];
  for (const numCtx of ctxLadder) {
    await fetchJson(`${base}/api/generate`, { model: modelName, keep_alive: 0 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 1200));

    try {
      await fetchJson(
        `${base}/api/generate`,
        {
          model: modelName,
          prompt: 'hi',
          stream: false,
          keep_alive: '60s',
          options: { num_ctx: numCtx, num_predict: 4 },
        },
        180000,
      );
    } catch (err) {
      // 失敗理由（VRAM 不足・ollama のタイムアウト・瞬断）を捨てると、実測が途中で
      // 止まった理由が追えなくなる。サンプルからは外すが、必ず出力に残す。
      console.error(`  [!] num_ctx=${numCtx} のロードに失敗: ${err.message ?? err}`);
      break; // ロードできない ctx より上は測る意味がない
    }

    const ps = await fetchJson(`${base}/api/ps`);
    const loaded = (ps.models ?? []).find((m) => m.name === modelName);
    if (!loaded) continue;

    samples.push({
      numCtx,
      sizeBytes: loaded.size ?? 0,
      vramBytes: loaded.size_vram ?? 0,
    });

    // はみ出した時点で上限確定。これ以上大きい ctx を試す必要はない。
    if ((loaded.size_vram ?? 0) < (loaded.size ?? 0)) break;
  }

  await fetchJson(`${base}/api/generate`, { model: modelName, keep_alive: 0 }).catch(() => {});
  return samples;
}

/** サンプル群から、100% GPU を維持できた最大 num_ctx を返す。 */
function maxUsableCtx(samples) {
  const fullyLoaded = samples.filter((s) => s.vramBytes >= s.sizeBytes);
  return fullyLoaded.length > 0 ? Math.max(...fullyLoaded.map((s) => s.numCtx)) : null;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function fmtVerdict(v) {
  return { allow: 'OK   ', conditional: 'COND ', deny: 'NG   ' }[v] ?? v;
}

async function main() {
  const args = process.argv.slice(2);
  const doVerify = args.includes('--verify');
  const doVram = args.includes('--vram') || doVerify;
  const jsonIdx = args.indexOf('--json');
  const jsonPath =
    jsonIdx >= 0 && args[jsonIdx + 1]
      ? args[jsonIdx + 1]
      : path.join(process.cwd(), '.anytime', 'ollama-profile.json');

  const base = await resolveEndpoint();
  if (!base) {
    console.log('ollama に到達できません（localhost / host.docker.internal の :11434 いずれも不達）。');
    console.log('→ 委譲は利用できません。ollama serve の起動を確認してください。');
    process.exit(0); // 不達は異常終了ではない（委譲不可として正常に扱う）
  }
  console.log(`endpoint: ${base}`);

  const models = await inventory(base);
  console.log(`導入モデル: ${models.length} 件\n`);

  // maxUsableCtx はモデルごとに違う（サイズが違えば KV キャッシュに使える余りが変わる）。
  // 空き VRAM 自体は共通なので、全モデルのサンプルを合わせて推定する。
  const chatModels = models.filter((m) => m.capabilities.includes('completion'));
  let vram = null;
  if (doVram && chatModels.length > 0) {
    const allSamples = [];
    for (const model of chatModels) {
      console.log(`VRAM 実測中（${model.name} を num_ctx を上げながらロード）...`);
      const samples = await probeVram(base, model.name);
      model.maxUsableCtx = maxUsableCtx(samples);
      allSamples.push(...samples);
      console.log(`  100% GPU を維持できる最大 num_ctx: ${model.maxUsableCtx ?? '不明'}`);
    }
    vram = estimateUsableVram(allSamples);
    if (vram) {
      const bound = vram.bounded ? '実効上限' : '下限（上限未到達）';
      console.log(`  使用可能 VRAM: ${vram.usableGb.toFixed(2)}GB (${bound})\n`);
    }
  }

  const ledger = loadLedger();
  const missingBench = staleEntries(models, ledger);
  if (missingBench.length > 0) {
    console.log(`\n[!] ベンチ未取得のモデル: ${missingBench.join(', ')}`);
    console.log('    Web から公開スコアを取得し .anytime/ollama-benchmarks.json へ追記してください');
    console.log('    （未取得のままだと、実証テストで裏取りできないタスクは deny のままになります）\n');
  }

  for (const model of models) {
    if (doVerify) {
      console.log(`実証テスト実走: ${model.name} ...`);
      model.verify = await runVerifyTests(base, model);
    } else {
      model.verify = {};
    }
    model.benchmarks = resolveBenchmarks(model.name, ledger);
    model.eligibility = classifyTaskEligibility(model);
  }

  for (const model of models) {
    console.log(`\n=== ${model.name} (${model.parameterSize ?? '?'} / ${model.quantization ?? '?'}) ===`);
    console.log(`capabilities: ${model.capabilities.join(', ')} | 公称 ctx: ${model.declaredCtx ?? '?'}`);
    if (model.maxUsableCtx) {
      console.log(`100% GPU を維持できる最大 num_ctx: ${model.maxUsableCtx}`);
    }
    for (const e of model.eligibility) {
      console.log(`  ${fmtVerdict(e.verdict)} ${e.label.padEnd(28)} ${e.reason}`);
    }
  }

  if (vram) {
    const rec = recommendModels(vram.usableGb);
    console.log(`\n=== 推奨モデル（使用可能 VRAM ${vram.usableGb.toFixed(2)}GB）===`);
    for (const m of rec.fits.slice(0, 3)) {
      const f1 = m.toolF1 === null ? 'tool F1 不明' : `tool F1 ${m.toolF1}`;
      console.log(`  載る   ${m.name.padEnd(20)} ${String(m.sizeGb).padStart(4)}GB  ${f1} — ${m.note}`);
    }
    for (const m of rec.tooLarge.slice(0, 2)) {
      console.log(`  載らない ${m.name.padEnd(18)} ${String(m.sizeGb).padStart(4)}GB — ${m.note}`);
    }
  }

  // 前回プロファイルはレポートの昇格/降格デルタに使う。上書きする前に読む。
  const previous = fs.existsSync(jsonPath)
    ? JSON.parse(fs.readFileSync(jsonPath, 'utf-8'))
    : null;

  const profile = {
    generatedAt: new Date().toISOString(),
    endpoint: base,
    usableVramGb: vram ? Number(vram.usableGb.toFixed(2)) : null,
    vramBounded: vram ? vram.bounded : null,
    verified: doVerify,
    verifyTests: VERIFY_TEST_IDS,
    models,
  };
  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  fs.writeFileSync(jsonPath, `${JSON.stringify(profile, null, 2)}\n`, 'utf-8');
  console.log(`\nプロファイルを書き出しました: ${jsonPath}`);
  if (!doVerify) {
    console.log('※ 実証テスト未実行。--verify を付けて実走するまで委譲可否は暫定です。');
  }

  const reportIdx = args.indexOf('--report');
  if (reportIdx >= 0) {
    const reportPath = args[reportIdx + 1] ?? `ollama-delegation-${profile.generatedAt.slice(0, 10)}.ja.md`;
    fs.mkdirSync(path.dirname(path.resolve(reportPath)), { recursive: true });
    fs.writeFileSync(reportPath, renderReport(profile, previous), 'utf-8');
    console.log(`レポートを書き出しました: ${reportPath}`);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`[ollama-probe] 失敗: ${err.stack ?? err}`);
    process.exit(1);
  });
}

module.exports = {
  TASK_CRITERIA,
  MODEL_CATALOG,
  classifyTaskEligibility,
  estimateUsableVram,
  maxUsableCtx,
  modelSignature,
  needsRevalidation,
  recommendModels,
  selectModelForTask,
};
