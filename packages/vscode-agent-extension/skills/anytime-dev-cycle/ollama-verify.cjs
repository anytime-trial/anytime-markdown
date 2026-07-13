#!/usr/bin/env node
// ollama-verify.cjs — 実証実験（フェーズ4）。
//
// 公称ベンチは「そのモデルが理想条件で何点取れたか」であり、量子化・プロンプト・
// num_ctx が違うこの環境で同じ品質が出る保証はない。よって委譲可否は実走の
// pass/fail で決める。各テストは決定的に採点できる形にしてある（人間の主観判定を挟まない）。

const CHAT_TIMEOUT_MS = 120000;

// 長文要約テストの入力（約 800 字）。要約に必ず残るべき語を KEY_TERMS で採点する。
const JA_ARTICLE = `
TypeScript の型ガードは、unknown 型や union 型の値を安全に絞り込むための仕組みである。
as による型アサーションは実行時の検査を伴わないため、実際の値が想定と異なっていても
コンパイラは素通しし、バグは実行時まで顕在化しない。これに対し型ガードは、typeof や
instanceof、あるいは戻り値の型に is を用いたユーザー定義型述語によって、実行時の検査と
コンパイル時の型の絞り込みを同時に成立させる。外部 API のレスポンスや JSON.parse の
戻り値のように、境界を越えて入ってくる値は原則として unknown として受け取り、型ガードを
通してから利用するのが安全側の設計である。非ヌルアサーションについても同様で、値が
存在するという確信をコンパイラに押し付けるのではなく、オプショナルチェイニングや
早期リターンによって存在しない場合の分岐を明示するほうが、後から読む者にとって意図が
追いやすい。型を安全に保つコストは、実行時に落ちてから原因を追うコストより小さい。
`.trim();
const KEY_TERMS = ['型ガード', 'unknown'];

// 10 問の閉じた分類。正解は決定的。
const CLASSIFY_CASES = [
  { text: 'アプリが起動直後にクラッシュする', label: 'bug' },
  { text: 'ダークモードに対応してほしい', label: 'feature' },
  { text: 'README のインストール手順が古い', label: 'docs' },
  { text: '保存ボタンを押しても何も起きない', label: 'bug' },
  { text: 'CSV エクスポート機能を追加したい', label: 'feature' },
  { text: 'API リファレンスに戻り値の説明がない', label: 'docs' },
  { text: 'ログイン後に 500 エラーが返る', label: 'bug' },
  { text: 'キーボードショートカットを設定可能にしたい', label: 'feature' },
  { text: 'コントリビューションガイドの誤字', label: 'docs' },
  { text: '検索結果の並び順が指定と逆になる', label: 'bug' },
];

const WEATHER_TOOL = {
  type: 'function',
  function: {
    name: 'get_weather',
    description: '指定した都市の現在の天気を取得する',
    parameters: {
      type: 'object',
      properties: { city: { type: 'string', description: '都市名（英語）' } },
      required: ['city'],
    },
  },
};

const CONVERT_TOOL = {
  type: 'function',
  function: {
    name: 'celsius_to_fahrenheit',
    description: '摂氏を華氏に変換する',
    parameters: {
      type: 'object',
      properties: { celsius: { type: 'number' } },
      required: ['celsius'],
    },
  },
};

const VERIFY_TEST_IDS = [
  'json-strict',
  'classify',
  'summarize-ja',
  'long-ctx',
  'toolcall-single',
  'toolcall-multi',
  'embed',
];

async function post(base, endpoint, body, timeoutMs = CHAT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(`${base}${endpoint}`, {
      method: 'POST',
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } finally {
    clearTimeout(timer);
  }
}

/** thinking 系モデル（qwen3 等）は <think> ブロックを吐く。採点前に落とす。 */
function stripThinking(text) {
  return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

function extractJson(text) {
  const cleaned = stripThinking(text);
  // コードフェンスで包んで返すモデルがある。中身だけ取り出す。
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(cleaned);
  const candidate = fenced ? fenced[1] : cleaned;
  return JSON.parse(candidate);
}

async function chat({ base, model, messages, options = {}, tools }) {
  const body = {
    model,
    messages,
    stream: false,
    // 既定の num_ctx は 4096。指定しないと長い入力が黙って切り詰められる。
    options: { temperature: 0, num_ctx: 8192, ...options },
  };
  if (tools) body.tools = tools;
  return post(base, '/api/chat', body);
}

// ---------------------------------------------------------------------------
// 各テスト（true/false を決定的に返す）
// ---------------------------------------------------------------------------

/** 指定スキーマの JSON を 5 回連続で正しく吐けるか。1 回でも崩れたら不合格。 */
async function testJsonStrict(base, model) {
  const attempts = 5;
  let ok = 0;
  const errors = [];

  for (let i = 0; i < attempts; i++) {
    const resp = await chat({
      base,
      model,
      messages: [
        {
          role: 'user',
          content:
            'タイトル「型ガード入門」、著者「山田」、タグ2つ（typescript, 型）の書誌情報を ' +
            'JSON だけで返せ。キーは title(string), author(string), tags(string[])。説明文は禁止。',
        },
      ],
    });
    try {
      const parsed = extractJson(resp.message?.content ?? '');
      if (
        typeof parsed.title === 'string' &&
        typeof parsed.author === 'string' &&
        Array.isArray(parsed.tags)
      ) {
        ok++;
      } else {
        errors.push(`${i + 1}回目: キー不足`);
      }
    } catch {
      errors.push(`${i + 1}回目: JSON parse 失敗`);
    }
  }

  return {
    passed: ok === attempts,
    detail: `${ok}/${attempts} 成功${errors.length > 0 ? ` (${errors[0]})` : ''}`,
  };
}

/** 閉じた 3 値分類を 10 問。9 問以上で合格。 */
async function testClassify(base, model) {
  let correct = 0;
  for (const c of CLASSIFY_CASES) {
    const resp = await chat({
      base,
      model,
      messages: [
        {
          role: 'user',
          content: `次の issue を bug / feature / docs のいずれか 1 語だけで分類せよ。語のみ返せ。\n\n${c.text}`,
        },
      ],
    });
    const answer = stripThinking(resp.message?.content ?? '')
      .toLowerCase()
      .replace(/[^a-z]/g, '');
    if (answer === c.label) correct++;
  }
  return { passed: correct >= 9, detail: `${correct}/10 正解` };
}

/** 日本語 800 字を 50 字以内に要約。字数制約と主要語の保持を 3 回とも満たすか。 */
async function testSummarizeJa(base, model) {
  const attempts = 3;
  let ok = 0;
  let lastDetail = '';

  for (let i = 0; i < attempts; i++) {
    const resp = await chat({
      base,
      model,
      messages: [
        { role: 'user', content: `次の文章を50字以内の日本語1文で要約せよ。要約文のみ返せ。\n\n${JA_ARTICLE}` },
      ],
    });
    const summary = stripThinking(resp.message?.content ?? '').replace(/\s/g, '');
    const withinLimit = summary.length > 0 && summary.length <= 60; // 50字指示に 20% の許容
    const keepsTerms = KEY_TERMS.some((t) => summary.includes(t));
    if (withinLimit && keepsTerms) ok++;
    else lastDetail = `${summary.length}字 / 主要語${keepsTerms ? 'あり' : 'なし'}`;
  }

  return { passed: ok === attempts, detail: `${ok}/${attempts} 合格${lastDetail ? ` (${lastDetail})` : ''}` };
}

/**
 * 長文脈の針探し。num_ctx を 16K に上げ、埋め込んだ合言葉を回収できるか。
 *
 * num_ctx を明示しないと 4096 でロードされ、入力が黙って切り詰められて失敗する。
 * このテストは「長文を委譲してよいか」を判定する唯一の根拠になる。
 */
async function testLongCtx(base, model) {
  const filler = 'これは検証用のダミー文です。内容に意味はありません。'.repeat(400); // 約 10K トークン相当
  const needle = 'ANYTIME-SECRET-4271';
  const haystack = `${filler}\n\n合言葉は ${needle} である。\n\n${filler}`;

  const attempts = 3;
  let ok = 0;
  for (let i = 0; i < attempts; i++) {
    const resp = await chat({
      base,
      model,
      messages: [
        { role: 'user', content: `${haystack}\n\n上の文章に書かれている合言葉をそのまま返せ。合言葉のみ。` },
      ],
      options: { num_ctx: 16384 },
    });
    if (stripThinking(resp.message?.content ?? '').includes(needle)) ok++;
  }

  return { passed: ok === attempts, detail: `${ok}/${attempts} で針を回収` };
}

/** 単発 function calling。正しい関数名と引数を 3 回とも出せるか。 */
async function testToolcallSingle(base, model) {
  const attempts = 3;
  let ok = 0;
  for (let i = 0; i < attempts; i++) {
    const resp = await chat({
      base,
      model,
      messages: [{ role: 'user', content: '東京の天気を調べて。' }],
      tools: [WEATHER_TOOL],
    });
    const call = resp.message?.tool_calls?.[0];
    const city = String(call?.function?.arguments?.city ?? '').toLowerCase();
    if (call?.function?.name === 'get_weather' && city.includes('tokyo')) ok++;
  }
  return { passed: ok === attempts, detail: `${ok}/${attempts} 正しく呼び出し` };
}

/**
 * 2 段の function calling。1 段目の結果を受けて 2 段目を呼べるか。
 *
 * 段数 n の成功率は単発成功率の n 乗で落ちる。ここが通らないモデルに
 * agentic なループを回させると、静かに間違った結果を返す。
 */
async function testToolcallMulti(base, model) {
  const attempts = 3;
  let ok = 0;

  for (let i = 0; i < attempts; i++) {
    const messages = [
      { role: 'user', content: '東京の気温を調べて、それを華氏に変換して。' },
    ];
    const first = await chat({ base, model, messages, tools: [WEATHER_TOOL, CONVERT_TOOL] });
    const call1 = first.message?.tool_calls?.[0];
    if (call1?.function?.name !== 'get_weather') continue;

    messages.push(first.message);
    messages.push({ role: 'tool', content: JSON.stringify({ city: 'Tokyo', celsius: 25 }) });

    const second = await chat({ base, model, messages, tools: [WEATHER_TOOL, CONVERT_TOOL] });
    const call2 = second.message?.tool_calls?.[0];
    if (call2?.function?.name === 'celsius_to_fahrenheit' && Number(call2.function.arguments?.celsius) === 25) {
      ok++;
    }
  }

  return { passed: ok === attempts, detail: `${ok}/${attempts} で 2 段目まで到達` };
}

/** 埋め込みの整合性。次元が一定で、類似文のほうが非類似文より近いか。 */
async function testEmbed(base, model) {
  const embed = async (text) => {
    const resp = await post(base, '/api/embed', { model, input: text }, 30000);
    return resp.embeddings?.[0];
  };

  const [a, b, c] = await Promise.all([
    embed('TypeScript の型ガードは値を安全に絞り込む'),
    embed('型ガードによって unknown 型を安全に扱える'),
    embed('今日の東京の天気は晴れ時々曇り'),
  ]);

  if (!a || !b || !c) return { passed: false, detail: '埋め込みが返らない' };
  if (a.length !== b.length || b.length !== c.length) {
    return { passed: false, detail: '次元が一定でない' };
  }

  const cosine = (x, y) => {
    const dot = x.reduce((s, v, i) => s + v * y[i], 0);
    const nx = Math.sqrt(x.reduce((s, v) => s + v * v, 0));
    const ny = Math.sqrt(y.reduce((s, v) => s + v * v, 0));
    return dot / (nx * ny);
  };

  const similar = cosine(a, b);
  const different = cosine(a, c);

  return {
    passed: similar > different,
    detail: `${a.length}次元 / 類似 ${similar.toFixed(3)} > 非類似 ${different.toFixed(3)} = ${similar > different}`,
  };
}

// ---------------------------------------------------------------------------

/** モデルの capability に該当するテストだけを実走する。 */
async function runVerifyTests(base, model) {
  const caps = model.capabilities ?? [];
  const results = {};

  const chatTests = [
    ['json-strict', testJsonStrict],
    ['classify', testClassify],
    ['summarize-ja', testSummarizeJa],
    ['long-ctx', testLongCtx],
  ];
  const toolTests = [
    ['toolcall-single', testToolcallSingle],
    ['toolcall-multi', testToolcallMulti],
  ];

  if (caps.includes('completion')) {
    for (const [id, fn] of chatTests) {
      results[id] = await runOne({ id, fn, base, modelName: model.name });
    }
  }
  if (caps.includes('tools')) {
    for (const [id, fn] of toolTests) {
      results[id] = await runOne({ id, fn, base, modelName: model.name });
    }
  }
  if (caps.includes('embedding')) {
    results.embed = await runOne({ id: 'embed', fn: testEmbed, base, modelName: model.name });
  }

  return results;
}

async function runOne({ id, fn, base, modelName }) {
  const t0 = Date.now();
  try {
    const result = await fn(base, modelName);
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`  ${result.passed ? 'PASS' : 'FAIL'} ${id.padEnd(16)} ${result.detail} (${secs}s)`);
    return result;
  } catch (err) {
    // 例外は不合格として記録する。握り潰すと未実行と区別がつかなくなる。
    const detail = `例外: ${err.message ?? err}`;
    console.log(`  FAIL ${id.padEnd(16)} ${detail}`);
    return { passed: false, detail };
  }
}

module.exports = { runVerifyTests, VERIFY_TEST_IDS };
