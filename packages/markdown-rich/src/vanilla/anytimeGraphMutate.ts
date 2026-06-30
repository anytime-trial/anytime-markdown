/**
 * 思考法ダイアグラム（anytime-thinking-model）プレビュー WYSIWYG 編集の
 * spec ミューテーション層（DOM 非依存・純粋）。
 *
 * `node.metadata.path` で指し示された spec 内位置に対し、ラベル変更・要素の
 * 追加/削除を適用し、`serializeGraphDsl` で DSL を再生成する。
 * 操作層（anytimeGraphInteract）が parse → mutate → serialize → 書き戻しに使う。
 */

import {
  parseGraphDsl,
  serializeGraphDsl,
  type ThinkingDiagramSpec,
  type TreeNodeSpec,
} from "@anytime-markdown/graph-core";

/** プレビュー操作の種別。path は graph-core が付与する metadata.path。 */
export type AnytimeGraphOp =
  /** ラベル/スカラ値の変更（fishbone head・tree ノード・causal-loop 変数 等） */
  | { kind: "setLabel"; path: string; value: string }
  /** 配列要素の削除（カテゴリ・ツリーノード・付箋・変数 等） */
  | { kind: "remove"; path: string }
  /** 同じ配列に兄弟要素を追加 */
  | { kind: "addSibling"; path: string; value: string }
  /** ノード配下に子要素を追加（tree の children・カテゴリの causes 等） */
  | { kind: "addChild"; path: string; value: string }
  /** 集約リーフ配列の要素を変更（fishbone causes・double-diamond/swot 項目） */
  | { kind: "setItem"; path: string; index: number; value: string }
  /** 集約リーフ配列の要素を削除 */
  | { kind: "removeItem"; path: string; index: number }
  /** 集約リーフ配列に要素を追加 */
  | { kind: "addItem"; path: string; value: string }
  /** pyramid tier の説明文を設定（空文字で説明を消す） */
  | { kind: "setDesc"; path: string; value: string };

/** ミューテーション失敗時に投げる（呼び出し側でコンテキスト付きログ＋操作破棄）。 */
export class AnytimeGraphMutateError extends Error {
  constructor(message: string) {
    super(`anytime-thinking-model: ${message}`);
    this.name = "AnytimeGraphMutateError";
  }
}

type AnyRecord = Record<string, unknown>;

function isIndex(seg: string): boolean {
  return /^\d+$/.test(seg);
}

/** path を辿り、最終セグメントの親コンテナと key を返す。 */
function resolveRef(root: unknown, path: string): { parent: unknown; key: string } {
  const segs = path.split(".");
  let parent: unknown = root;
  for (let i = 0; i < segs.length - 1; i++) {
    const seg = segs[i];
    if (Array.isArray(parent) && isIndex(seg)) {
      parent = parent[Number(seg)];
    } else if (parent && typeof parent === "object") {
      parent = (parent as AnyRecord)[seg];
    } else {
      throw new AnytimeGraphMutateError(`path を解決できません: "${path}" (segment "${seg}")`);
    }
  }
  return { parent, key: segs[segs.length - 1] };
}

function getTarget(root: unknown, path: string): unknown {
  const { parent, key } = resolveRef(root, path);
  if (Array.isArray(parent) && isIndex(key)) return parent[Number(key)];
  if (parent && typeof parent === "object") return (parent as AnyRecord)[key];
  return undefined;
}

// ── causal-loop 専用（変数は spec の派生物で配列を持たない） ──────────────

/** links から出現順の一意変数リストを得る（preset の抽出順と一致）。 */
function causalLoopVariables(spec: Extract<ThinkingDiagramSpec, { type: "causal-loop" }>): string[] {
  const order: string[] = [];
  const seen = new Set<string>();
  for (const link of spec.links) {
    for (const v of [link.from, link.to]) {
      if (!seen.has(v)) {
        seen.add(v);
        order.push(v);
      }
    }
  }
  return order;
}

function causalLoopVarIndex(path: string): number | null {
  const m = /^variables\.(\d+)$/.exec(path);
  return m ? Number(m[1]) : null;
}

// ── 子配列のキー解決 ─────────────────────────────────────────────────

/** addChild 時、対象ノードに子を追加する配列の参照を返す（必要なら生成）。 */
function childArray(spec: ThinkingDiagramSpec, path: string): unknown[] {
  switch (spec.type) {
    case "mindmap":
      // root の子はブランチ、ブランチ配下は children。
      if (path === "root") return spec.branches;
      return ensureChildren(getTarget(spec, path));
    case "logic-tree":
      if (path === "root") return spec.children;
      return ensureChildren(getTarget(spec, path));
    case "fishbone": {
      const cat = getTarget(spec, path) as { causes?: string[] } | undefined;
      if (!cat) throw new AnytimeGraphMutateError(`category がありません: ${path}`);
      cat.causes ??= [];
      return cat.causes;
    }
    case "morph-box": {
      const param = getTarget(spec, path) as { options?: string[] } | undefined;
      if (!param) throw new AnytimeGraphMutateError(`parameter がありません: ${path}`);
      param.options ??= [];
      return param.options;
    }
    case "affinity": {
      const group = getTarget(spec, path) as { notes?: string[] } | undefined;
      if (!group) throw new AnytimeGraphMutateError(`group がありません: ${path}`);
      group.notes ??= [];
      return group.notes;
    }
    case "structure-map": {
      const part = getTarget(spec, path) as { items?: string[] } | undefined;
      if (!part || typeof part !== "object") throw new AnytimeGraphMutateError(`part がありません: ${path}`);
      part.items ??= [];
      return part.items;
    }
    default:
      throw new AnytimeGraphMutateError(`${spec.type} は addChild 非対応です: ${path}`);
  }
}

function ensureChildren(target: unknown): TreeNodeSpec[] {
  if (!target || typeof target !== "object") {
    throw new AnytimeGraphMutateError("tree ノードが見つかりません");
  }
  const node = target as TreeNodeSpec;
  node.children ??= [];
  return node.children;
}

/** 兄弟要素を生成する（既存兄弟の形に合わせる）。 */
function makeSiblingLike(sibling: unknown, value: string): unknown {
  if (typeof sibling === "string") return value;
  if (sibling && typeof sibling === "object") {
    const out: AnyRecord = {};
    for (const [k, v] of Object.entries(sibling as AnyRecord)) {
      if (k === "label") out[k] = value;
      else if (Array.isArray(v)) out[k] = [];
      // desc 等の任意スカラはコピーしない（新規は未設定）。
    }
    if (!("label" in out)) out.label = value;
    return out;
  }
  return value;
}

// ── 集約リーフ配列の解決 ─────────────────────────────────────────────

/** setItem/removeItem/addItem が操作する string[] を返す。 */
function leafArray(spec: ThinkingDiagramSpec, path: string): string[] {
  switch (spec.type) {
    case "fishbone": {
      const cat = getTarget(spec, path) as { causes?: string[] } | undefined;
      if (!cat) throw new AnytimeGraphMutateError(`category がありません: ${path}`);
      cat.causes ??= [];
      return cat.causes;
    }
    case "double-diamond":
    case "swot": {
      const arr = (spec as unknown as Record<string, unknown>)[path];
      if (!Array.isArray(arr)) {
        throw new AnytimeGraphMutateError(`${spec.type} の項目配列が見つかりません: ${path}`);
      }
      return arr as string[];
    }
    default:
      throw new AnytimeGraphMutateError(`${spec.type} は集約リーフ操作非対応です: ${path}`);
  }
}

// ── 各操作の適用 ─────────────────────────────────────────────────────

function applySetLabel(spec: ThinkingDiagramSpec, path: string, value: string): void {
  if (spec.type === "causal-loop") {
    const idx = causalLoopVarIndex(path);
    if (idx !== null) {
      const vars = causalLoopVariables(spec);
      const old = vars[idx];
      if (old === undefined) throw new AnytimeGraphMutateError(`変数 index ${idx} がありません`);
      for (const link of spec.links) {
        if (link.from === old) link.from = value;
        if (link.to === old) link.to = value;
      }
      return;
    }
  }
  const { parent, key } = resolveRef(spec, path);
  if (Array.isArray(parent) && isIndex(key)) {
    const i = Number(key);
    const cur = parent[i];
    if (typeof cur === "string") parent[i] = value;
    else if (cur && typeof cur === "object") (cur as AnyRecord).label = value;
    else throw new AnytimeGraphMutateError(`ラベルを設定できません: ${path}`);
  } else if (parent && typeof parent === "object") {
    const obj = parent as AnyRecord;
    const cur = obj[key];
    if (typeof cur === "string") obj[key] = value;
    else if (cur && typeof cur === "object") (cur as AnyRecord).label = value;
    else throw new AnytimeGraphMutateError(`ラベルを設定できません: ${path}`);
  } else {
    throw new AnytimeGraphMutateError(`ラベルを設定できません: ${path}`);
  }
}

function applyRemove(spec: ThinkingDiagramSpec, path: string): void {
  if (spec.type === "causal-loop") {
    const idx = causalLoopVarIndex(path);
    if (idx !== null) {
      const vars = causalLoopVariables(spec);
      const old = vars[idx];
      if (old === undefined) throw new AnytimeGraphMutateError(`変数 index ${idx} がありません`);
      spec.links = spec.links.filter((l) => l.from !== old && l.to !== old);
      return;
    }
  }
  const { parent, key } = resolveRef(spec, path);
  if (Array.isArray(parent) && isIndex(key)) {
    parent.splice(Number(key), 1);
  } else {
    throw new AnytimeGraphMutateError(`削除できません（配列要素ではありません）: ${path}`);
  }
}

function applyAddSibling(spec: ThinkingDiagramSpec, path: string, value: string): void {
  const { parent, key } = resolveRef(spec, path);
  if (!Array.isArray(parent) || !isIndex(key)) {
    throw new AnytimeGraphMutateError(`兄弟を追加できません（配列要素ではありません）: ${path}`);
  }
  const idx = Number(key);
  parent.splice(idx + 1, 0, makeSiblingLike(parent[idx], value));
}

function applyAddChild(spec: ThinkingDiagramSpec, path: string, value: string): void {
  const arr = childArray(spec, path);
  // tree（mindmap branches/children・logic-tree）は {label}、string[] は文字列。
  const isTreeArray =
    (spec.type === "mindmap" || spec.type === "logic-tree") &&
    (path === "root" || arr.every((e) => e && typeof e === "object"));
  arr.push(isTreeArray ? ({ label: value } as TreeNodeSpec) : value);
}

function applyDescSet(spec: ThinkingDiagramSpec, path: string, value: string): void {
  if (spec.type !== "pyramid") {
    throw new AnytimeGraphMutateError(`setDesc は pyramid 専用です: ${spec.type}`);
  }
  const tier = getTarget(spec, path) as { desc?: string } | undefined;
  if (!tier) throw new AnytimeGraphMutateError(`tier がありません: ${path}`);
  if (value === "") delete tier.desc;
  else tier.desc = value;
}

/** 1 操作を spec に適用する（in-place）。 */
export function mutateSpec(spec: ThinkingDiagramSpec, op: AnytimeGraphOp): void {
  switch (op.kind) {
    case "setLabel":
      applySetLabel(spec, op.path, op.value);
      break;
    case "remove":
      applyRemove(spec, op.path);
      break;
    case "addSibling":
      applyAddSibling(spec, op.path, op.value);
      break;
    case "addChild":
      applyAddChild(spec, op.path, op.value);
      break;
    case "setItem": {
      const arr = leafArray(spec, op.path);
      if (op.index < 0 || op.index >= arr.length) {
        throw new AnytimeGraphMutateError(`項目 index ${op.index} が範囲外です: ${op.path}`);
      }
      arr[op.index] = op.value;
      break;
    }
    case "removeItem": {
      const arr = leafArray(spec, op.path);
      if (op.index < 0 || op.index >= arr.length) {
        throw new AnytimeGraphMutateError(`項目 index ${op.index} が範囲外です: ${op.path}`);
      }
      arr.splice(op.index, 1);
      break;
    }
    case "addItem":
      leafArray(spec, op.path).push(op.value);
      break;
    case "setDesc":
      applyDescSet(spec, op.path, op.value);
      break;
    default: {
      const _exhaustive: never = op;
      throw new AnytimeGraphMutateError(`未対応の操作: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

// ── ノードの編集アフォーダンス記述（操作層が UI を組むためのメタ情報） ──────

export interface NodeDescriptor {
  /** 編集可能ラベルの現在値。ラベル非編集ノード（double-diamond / swot）は null。 */
  label: string | null;
  /** ノード自体を削除できるか（配列要素のみ true）。 */
  canRemove: boolean;
  /** 同じ配列に兄弟を追加できるか。 */
  canAddSibling: boolean;
  /** 子要素を追加できるか（tree の children/branches・morph options・affinity notes・fishbone causes）。 */
  canAddChild: boolean;
  /** 集約リーフ（fishbone causes・double-diamond/swot 項目）の現在値。なければ null。 */
  items: string[] | null;
  /** pyramid tier の説明文（未設定は ''）。pyramid tier 以外は null。 */
  desc: string | null;
}

const DD_KEYS = new Set(["discover", "define", "develop", "deliver"]);
const SWOT_KEYS = new Set(["strengths", "weaknesses", "opportunities", "threats"]);

/**
 * path が指すノードの編集アフォーダンスを返す（純粋）。
 * 認識できない path は null（操作層はハンドラを装着しない）。
 */
export function describeNode(spec: ThinkingDiagramSpec, path: string): NodeDescriptor | null {
  const base: NodeDescriptor = {
    label: null,
    canRemove: false,
    canAddSibling: false,
    canAddChild: false,
    items: null,
    desc: null,
  };
  switch (spec.type) {
    case "fishbone": {
      if (path === "problem") return { ...base, label: spec.problem };
      const cat = getTarget(spec, path) as { label?: string; causes?: string[] } | undefined;
      if (cat && typeof cat.label === "string") {
        return { ...base, label: cat.label, canRemove: true, canAddSibling: true, items: cat.causes ?? [] };
      }
      return null;
    }
    case "causal-loop": {
      const idx = causalLoopVarIndex(path);
      if (idx === null) return null;
      const v = causalLoopVariables(spec)[idx];
      if (v === undefined) return null;
      return { ...base, label: v, canRemove: true };
    }
    case "pyramid": {
      const tier = getTarget(spec, path) as { label?: string; desc?: string } | undefined;
      if (tier && typeof tier.label === "string") {
        return { ...base, label: tier.label, canRemove: true, canAddSibling: true, desc: tier.desc ?? "" };
      }
      return null;
    }
    case "mindmap":
    case "logic-tree": {
      if (path === "root") return { ...base, label: spec.root, canAddChild: true };
      const node = getTarget(spec, path) as { label?: string } | undefined;
      if (node && typeof node.label === "string") {
        return { ...base, label: node.label, canRemove: true, canAddSibling: true, canAddChild: true };
      }
      return null;
    }
    case "why-chain": {
      if (path === "problem") return { ...base, label: spec.problem };
      const m = /^steps\.(\d+)$/.exec(path);
      if (m) {
        const step = spec.steps[Number(m[1])];
        if (step !== undefined) return { ...base, label: step, canRemove: true, canAddSibling: true };
      }
      return null;
    }
    case "double-diamond": {
      if (DD_KEYS.has(path)) {
        return { ...base, items: (spec as unknown as Record<string, string[]>)[path] };
      }
      return null;
    }
    case "swot": {
      if (SWOT_KEYS.has(path)) {
        return { ...base, items: (spec as unknown as Record<string, string[]>)[path] };
      }
      return null;
    }
    case "morph-box": {
      const optMatch = /^parameters\.\d+\.options\.(\d+)$/.exec(path);
      if (optMatch) {
        const opt = getTarget(spec, path);
        if (typeof opt === "string") return { ...base, label: opt, canRemove: true, canAddSibling: true };
        return null;
      }
      const param = getTarget(spec, path) as { label?: string } | undefined;
      if (/^parameters\.\d+$/.test(path) && param && typeof param.label === "string") {
        return { ...base, label: param.label, canRemove: true, canAddSibling: true, canAddChild: true };
      }
      return null;
    }
    case "affinity": {
      const noteMatch = /^groups\.\d+\.notes\.(\d+)$/.exec(path);
      if (noteMatch) {
        const note = getTarget(spec, path);
        if (typeof note === "string") return { ...base, label: note, canRemove: true, canAddSibling: true };
        return null;
      }
      const group = getTarget(spec, path) as { label?: string } | undefined;
      if (/^groups\.\d+$/.test(path) && group && typeof group.label === "string") {
        return { ...base, label: group.label, canRemove: true, canAddSibling: true, canAddChild: true };
      }
      return null;
    }
    case "structure-map": {
      if (path === "whole") return { ...base, label: spec.whole };
      // 部分の構成要素 / 他領域（string[] の要素）
      if (/^parts\.\d+\.items\.\d+$/.test(path) || /^domains\.\d+$/.test(path)) {
        const leaf = getTarget(spec, path);
        if (typeof leaf === "string") return { ...base, label: leaf, canRemove: true, canAddSibling: true };
        return null;
      }
      // 部分の見出し（addChild で構成要素を追加できる）
      const part = getTarget(spec, path) as { label?: string; items?: string[] } | undefined;
      if (/^parts\.\d+$/.test(path) && part && typeof part.label === "string") {
        return { ...base, label: part.label, canRemove: true, canAddSibling: true, canAddChild: true, items: part.items ?? [] };
      }
      return null;
    }
    default: {
      const _exhaustive: never = spec;
      void _exhaustive;
      return null;
    }
  }
}

/**
 * DSL に 1 操作を適用し、新しい DSL を返す純粋関数。
 * parse → mutate → serialize。parse 失敗時は GraphDslError、mutate 失敗時は
 * AnytimeGraphMutateError を投げる（呼び出し側で握って操作を破棄する）。
 */
export function applyAnytimeGraphOp(dsl: string, op: AnytimeGraphOp): string {
  const spec = parseGraphDsl(dsl);
  mutateSpec(spec, op);
  return serializeGraphDsl(spec);
}
