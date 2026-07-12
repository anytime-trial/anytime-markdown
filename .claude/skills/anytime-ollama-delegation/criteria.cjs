#!/usr/bin/env node
// criteria.cjs — 委譲可否の判定基準（純粋データ）。
//
// ここを書き換えると委譲できるタスクの集合が変わる。数値の根拠と出典は
// references/task-criteria.md に対応する記述がある（両方を同時に更新すること）。

// long-ctx テストが使う num_ctx。この値を 100% GPU で回せないモデルに長文を
// 委譲すると CPU へ溢れて速度が落ちる（ollama-verify.cjs の testLongCtx と一致させる）。
const LONG_CTX_TEST_SIZE = 16384;


// capability: ollama の /api/show が返す capabilities に含まれる必要があるもの。
// tests:      合格必須の実証テスト ID（ollama-verify.cjs）。
// floors:     公称ベンチの下限。割ると allow ではなく conditional へ落とす。
//             未知(ベンチ不明)は実測を信じて allow のままにする。
const TASK_CRITERIA = [
  {
    id: 'summarize-short',
    label: '短文要約（< 3K tok）',
    capability: 'completion',
    tests: ['summarize-ja'],
    floors: {},
  },
  {
    id: 'summarize-long',
    label: '長文要約（> 4K tok）',
    capability: 'completion',
    tests: ['summarize-ja', 'long-ctx'],
    floors: {},
  },
  {
    id: 'classification',
    label: '分類・タグ付け・ラベリング',
    capability: 'completion',
    tests: ['classify'],
    floors: {},
  },
  {
    id: 'structured-extraction',
    label: '構造化抽出（JSON 厳守）',
    capability: 'completion',
    tests: ['json-strict'],
    floors: { ifeval: 60 },
  },
  {
    id: 'translation-ja',
    label: '翻訳・日本語整形',
    capability: 'completion',
    tests: ['summarize-ja'],
    floors: { jmmlu: 55 },
  },
  {
    id: 'embedding',
    label: '埋め込み生成',
    capability: 'embedding',
    tests: ['embed'],
    floors: { miraclJa: 60 },
  },
  {
    id: 'toolcall-single',
    label: '単発ツール呼び出し',
    capability: 'tools',
    tests: ['toolcall-single'],
    floors: { toolF1: 0.9 },
  },
  {
    id: 'agentic-multi-tool',
    label: '多段 agentic ループ',
    capability: 'tools',
    tests: ['toolcall-multi'],
    // 段数 n の成功率は F1^n。3 段で 0.86 を保つには F1 >= 0.95 が要る。
    floors: { toolF1: 0.95 },
  },
  {
    id: 'code-implementation',
    label: 'コード実装・リファクタリング',
    capability: 'completion',
    tests: [],
    // HumanEval は単関数ベンチで実リポジトリ編集を保証しない。実戦的な
    // LiveCodeBench を主軸に置く。現行ローカルモデルはここを越えない。
    floors: { livecodebench: 60, humaneval: 90 },
  },
  {
    id: 'code-review',
    label: 'コードレビュー',
    capability: 'completion',
    tests: [],
    floors: { livecodebench: 60, mmluPro: 70 },
  },
];

// sizeGb は Q4_K_M 量子化時のロードサイズ目安（num_ctx 4K 時）。
// toolF1 の出典: https://www.docker.com/blog/local-llm-tool-calling-a-practical-evaluation/
const MODEL_CATALOG = [
  { name: 'qwen3:4b', sizeGb: 2.6, toolF1: null, note: '軽量。大きい num_ctx を取りたいとき' },
  { name: 'qwen2.5:7b', sizeGb: 4.7, toolF1: 0.753, note: '16K ctx まで 6GB VRAM に載る' },
  { name: 'qwen3:8b', sizeGb: 5.2, toolF1: 0.933, note: 'ツール呼び出しが強い。ctx は 8K 程度が上限' },
  { name: 'qwen2.5:14b', sizeGb: 9.0, toolF1: 0.812, note: '14B だが tool F1 は 8B に劣る' },
  { name: 'qwen3:14b', sizeGb: 9.3, toolF1: 0.971, note: '多段 agentic ループが実用域に入る' },
  { name: 'qwen2.5-coder:32b', sizeGb: 20, toolF1: null, note: 'HumanEval 92.7。コード生成特化' },
  { name: 'llama3.3:70b', sizeGb: 43, toolF1: 0.607, note: 'tool F1 が 8B より低い。非推奨' },
];

module.exports = { LONG_CTX_TEST_SIZE, TASK_CRITERIA, MODEL_CATALOG };
