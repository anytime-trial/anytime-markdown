#!/usr/bin/env node
// ollama-delegate.cjs — 委譲実行（フェーズ5）。
//
// プロファイル(.anytime/ollama-profile.json)で allow / conditional と判定された
// タスクだけを実行する。deny のタスク、未検証のモデル、プロファイル不在は
// 実行前に拒否する。「とりあえず投げてみる」経路を塞ぐのがこのスクリプトの主目的。
//
// 使い方:
//   node ollama-delegate.cjs --task summarize-short --input doc.md
//   node ollama-delegate.cjs --task classification --input issues.txt --labels bug,feature,docs
//   node ollama-delegate.cjs --task structured-extraction --input doc.md --schema '{"title":"string"}'
//   node ollama-delegate.cjs --task embedding --input doc.md
//   echo "text" | node ollama-delegate.cjs --task summarize-short --input -
//
// 主要オプション:
//   --profile <path>  プロファイルの場所（既定 .anytime/ollama-profile.json）
//   --model <name>    モデルを明示指定（既定はプロファイルからタスク別に自動選択）
//   --num-ctx <n>     コンテキスト長（既定はプロファイルの maxUsableCtx）
//   --allow-conditional  conditional 判定のタスクも実行する（既定は拒否）

const fs = require('node:fs');
const path = require('node:path');
const { selectModelForTask } = require('./ollama-probe.cjs');

// ollama 既定の num_ctx。指定しないとこの値でロードされ、超過分は黙って切り詰められる。
const OLLAMA_DEFAULT_CTX = 4096;
// 1 トークンあたりの文字数（日本語混在の保守的な見積もり）。入力長の事前チェックに使う。
const CHARS_PER_TOKEN = 2.2;
const REQUEST_TIMEOUT_MS = 300000;

function parseArgs(argv) {
  const args = { flags: new Set() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        args.flags.add(key);
      } else {
        args[key] = next;
        i++;
      }
    }
  }
  return args;
}

function readInput(spec) {
  if (spec === '-') return fs.readFileSync(0, 'utf-8');
  return fs.readFileSync(spec, 'utf-8');
}

function loadProfile(profilePath) {
  if (!fs.existsSync(profilePath)) {
    throw new Error(
      `プロファイルがありません: ${profilePath}\n` +
        '先に実証実験を実行してください: node ollama-probe.cjs --verify',
    );
  }
  const profile = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
  if (!profile.verified) {
    throw new Error(
      'プロファイルが未検証です（--verify なしで生成されている）。\n' +
        '委譲可否が確定していないため実行できません: node ollama-probe.cjs --verify',
    );
  }
  return profile;
}

/**
 * タスクとモデルの組が委譲可能かを、プロファイルの判定に照らして検査する。
 * ここを通らない限り ollama へは 1 バイトも送らない。
 */
function authorize(profile, taskId, explicitModel, allowConditional) {
  const model = explicitModel
    ? profile.models.find((m) => m.name === explicitModel)
    : selectModelForTask(taskId, profile);

  if (!model) {
    throw new Error(
      `タスク '${taskId}' を実行できるモデルがありません（全モデルで deny）。\n` +
        'このタスクはローカル委譲の対象外です。Claude / Codex で実施してください。',
    );
  }

  const entry = (model.eligibility ?? []).find((e) => e.taskId === taskId);
  if (!entry) throw new Error(`未知のタスク ID: ${taskId}`);

  if (entry.verdict === 'deny') {
    throw new Error(`${model.name} は '${taskId}' を委譲できません: ${entry.reason}`);
  }
  if (entry.verdict === 'conditional' && !allowConditional) {
    throw new Error(
      `${model.name} の '${taskId}' は conditional 判定です: ${entry.reason}\n` +
        '結果を検証できる場合のみ --allow-conditional を付けて実行してください。',
    );
  }

  return { model, entry };
}

/**
 * 入力がコンテキストに収まるかを検査する。
 *
 * ollama は超過分を例外にせず黙って切り捨てる。委譲した長文が実は半分しか読まれて
 * いなかった、という事故はここでしか止められない。
 */
function assertFitsContext(text, numCtx) {
  const estimatedTokens = Math.ceil(text.length / CHARS_PER_TOKEN);
  const budget = numCtx - 512; // 出力と system 分を残す
  if (estimatedTokens > budget) {
    throw new Error(
      `入力が num_ctx に収まりません（推定 ${estimatedTokens} tok > 上限 ${budget} tok / num_ctx=${numCtx}）。\n` +
        '入力を分割するか、より大きい num_ctx を 100% GPU で扱えるモデルを選んでください。\n' +
        '（num_ctx を上げても VRAM に載らなければ CPU にはみ出して速度が数分の一になります）',
    );
  }
}

function stripThinking(text) {
  return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

function extractJson(text) {
  const cleaned = stripThinking(text);
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(cleaned);
  return JSON.parse(fenced ? fenced[1] : cleaned);
}

async function callChat(endpoint, model, prompt, numCtx) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const resp = await fetch(`${endpoint}/api/chat`, {
      method: 'POST',
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        options: { temperature: 0, num_ctx: numCtx },
      }),
      signal: controller.signal,
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    return stripThinking(data.message?.content ?? '');
  } finally {
    clearTimeout(timer);
  }
}

async function callEmbed(endpoint, model, input) {
  const resp = await fetch(`${endpoint}/api/embed`, {
    method: 'POST',
    body: JSON.stringify({ model, input }),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = await resp.json();
  return data.embeddings;
}

const PROMPTS = {
  'summarize-short': (input, args) =>
    `次の文章を${args.chars ?? 200}字以内の日本語で要約せよ。要約のみ返せ。\n\n${input}`,
  'summarize-long': (input, args) =>
    `次の文章を${args.chars ?? 400}字以内の日本語で要約せよ。要約のみ返せ。\n\n${input}`,
  classification: (input, args) => {
    const labels = (args.labels ?? '').split(',').filter(Boolean);
    if (labels.length === 0) throw new Error('--labels でラベル候補を指定してください（例: bug,feature,docs）');
    return `次の各行を ${labels.join(' / ')} のいずれか 1 語で分類し、「行内容<TAB>ラベル」形式で返せ。説明は不要。\n\n${input}`;
  },
  'structured-extraction': (input, args) => {
    if (!args.schema) throw new Error('--schema で期待する JSON スキーマを指定してください');
    return `次の文章から情報を抽出し、このスキーマの JSON だけを返せ。説明文・コードフェンスは禁止。\nスキーマ: ${args.schema}\n\n${input}`;
  },
  'translation-ja': (input, args) =>
    `次の文章を${args.to ?? '日本語'}に翻訳せよ。訳文のみ返せ。\n\n${input}`,
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const taskId = args.task;
  if (!taskId || !args.input) {
    console.error('使い方: node ollama-delegate.cjs --task <id> --input <file|->');
    process.exit(2);
  }

  const profilePath = args.profile ?? path.join(process.cwd(), '.anytime', 'ollama-profile.json');
  const profile = loadProfile(profilePath);
  const { model, entry } = authorize(profile, taskId, args.model, args.flags.has('allow-conditional'));

  const input = readInput(args.input);
  const endpoint = profile.endpoint;

  if (taskId === 'embedding') {
    const embeddings = await callEmbed(endpoint, model.name, input);
    process.stdout.write(`${JSON.stringify({ model: model.name, dimensions: embeddings[0]?.length, embeddings })}\n`);
    return;
  }

  const buildPrompt = PROMPTS[taskId];
  if (!buildPrompt) {
    throw new Error(`タスク '${taskId}' に対応する委譲プロンプトが未定義です（対応: ${Object.keys(PROMPTS).join(', ')}, embedding）`);
  }

  // num_ctx の決定順: 明示指定 > プロファイルの実測上限 > ollama 既定。
  // 実測上限を使うのは、100% GPU オフロードを維持できる範囲に収めるため。
  const numCtx = Number(args['num-ctx'] ?? model.maxUsableCtx ?? OLLAMA_DEFAULT_CTX);
  const prompt = buildPrompt(input, args);
  assertFitsContext(prompt, numCtx);

  if (entry.verdict === 'conditional') {
    console.error(`[警告] conditional 判定で実行します: ${entry.reason}`);
    console.error('[警告] 出力は必ず検証してください。');
  }

  const t0 = Date.now();
  const output = await callChat(endpoint, model.name, prompt, numCtx);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);

  if (taskId === 'structured-extraction') {
    // JSON 厳守タスクは、壊れた JSON をそのまま下流へ流さない。
    const parsed = extractJson(output);
    process.stdout.write(`${JSON.stringify(parsed, null, 2)}\n`);
  } else {
    process.stdout.write(`${output}\n`);
  }

  console.error(`[ollama-delegate] ${model.name} / num_ctx=${numCtx} / ${secs}s`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`[ollama-delegate] ${err.message ?? err}`);
    process.exit(1);
  });
}

module.exports = { authorize, assertFitsContext, loadProfile, PROMPTS };
