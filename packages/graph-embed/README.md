# @anytime-markdown/graph

`<anytime-graph>` は、マインドマップ／グラフを**読み取り専用**で描画する vanilla な Web Component（Custom Element）です。
React 非依存で、任意の Web アプリ・VS Code 拡張（Webview）・素の HTML に組み込めます。


## 特徴

- **フレームワーク非依存**: 標準の Custom Element。React / Vue / Svelte / 素の HTML から同じように使える
- **読み取り専用ビューア**: 入力データを描画するだけ（`movable-nodes` 有効時のみノード位置のドラッグ移動可・内容は不変）
- **レイアウト**: 放射状（`radial`）／ツリー（`tree-lr` / `tree-tb`）を内蔵
- **オプション機能**: 全体俯瞰ミニマップ・マインドマップ風の枝折りたたみ・ノード移動（いずれも属性で opt-in）
- **HiDPI 対応**: 分数 `devicePixelRatio`（Windows 125/150% 表示スケール等）でも文字が鮮明
- **ダーク／ライト両対応**


## インストール / 読み込み

### npm（バンドラ利用のアプリ）

```bash
npm install @anytime-markdown/graph
```

```js
import '@anytime-markdown/graph'; // import するだけで <anytime-graph> が登録される
```

### CDN（jsDelivr・素の HTML）

```html
<script type="module"
  src="https://cdn.jsdelivr.net/npm/@anytime-markdown/graph/dist/anytime-graph.js"></script>
```

> モジュールを使わない環境では IIFE 版 `dist/anytime-graph.iife.js` を `<script>` で読み込む（読み込み時に要素が登録される）。

### バンドル同梱（publish 不要）

`npm run build --workspace=@anytime-markdown/graph` で生成した `dist/anytime-graph.js`（ESM）または `dist/anytime-graph.iife.js` を相手アプリにコピーして読み込む。

### VS Code 拡張（Webview）

`anytime-graph.js` を拡張に同梱し、`webview.asWebviewUri()` で参照する。
CSP は nonce 方式（`script-src 'nonce-...'`）に準拠する。


## 使い方

```html
<anytime-graph theme="dark" minimap collapsible movable-nodes
  style="display:block; width:100%; height:600px"></anytime-graph>

<script type="module">
  import '@anytime-markdown/graph';

  const el = document.querySelector('anytime-graph');

  el.data = {
    schemaVersion: '1.0',
    rootId: 'root',
    layout: 'radial',
    nodes: [
      { id: 'root', label: '7832 週次リターン -0.13%' },
      { id: 'market', label: '市場要因 +0.22pp', fill: '#101A2E', stroke: '#5B9BD5' },
      { id: 'idio', label: '個別要因 -1.11pp' },
    ],
    edges: [
      { from: 'root', to: 'market' },
      { from: 'root', to: 'idio' },
    ],
  };

  el.addEventListener('node-click', (e) => {
    console.log('clicked', e.detail.id);
  });
</script>
```


## API

### 属性（HTML attributes）

属性は**在/不在**で ON/OFF する（`minimap=""` でも有効）。

| 属性 | 説明 | 既定 |
| --- | --- | --- |
| `theme` | `dark` または `light` | `dark` |
| `movable-nodes` | ノードの選択 + ドラッグ移動を許可（位置のみ変更・内容不変） | OFF |
| `collapsible` | ホバー時にコネクタ起点の `−`/`＋` ボタンを表示し、枝を折りたたみ／展開 | OFF |
| `minimap` | 右上に全体俯瞰ミニマップを表示（クリック=パン／枠ドラッグ=パン／枠外ドラッグ=範囲ズーム／`−`・`＋`・fit ボタン） | OFF |

### プロパティ

| プロパティ | 型 | 説明 |
| --- | --- | --- |
| `data` | `GraphInput` | 描画するグラフ。代入時に再レイアウト + 再描画 |

### メソッド

| メソッド | 戻り値 | 説明 |
| --- | --- | --- |
| `fitToContent()` | `void` | 全ノードが収まるよう表示を再フィット |
| `toPng(scale = 1)` | `Promise<Blob>` | 現在の描画を PNG 画像として書き出す |

### イベント

| イベント | `detail` | 説明 |
| --- | --- | --- |
| `node-click` | `NodeClickDetail` | ノード本体クリック時に発火（`bubbles` / `composed`） |


## 入力データ形式（`GraphInput`）

```ts
interface GraphInput {
  schemaVersion: '1.0';
  name?: string;
  rootId?: string;                       // レイアウトの根。未指定なら自動推定
  layout?: 'radial' | 'tree-lr' | 'tree-tb'; // 既定 'radial'
  nodes: GraphInputNode[];
  edges: GraphInputEdge[];
}

interface GraphInputNode {
  id: string;          // 一意・非空。node-click の detail.id にそのまま入る
  label: string;
  type?: 'rect' | 'ellipse' | 'sticky' | 'text'
       | 'diamond' | 'parallelogram' | 'cylinder' | 'doc'; // 既定 'rect'
  fill?: string;       // 塗り色
  stroke?: string;     // 枠線色
  strokeWidth?: number;
  fontColor?: string;
  doc?: string;        // 'doc' ノードの注釈本文
  metadata?: Record<string, string | number>;
}

interface GraphInputEdge {
  from: string;        // GraphInputNode.id
  to: string;          // GraphInputNode.id
  label?: string;
  weight?: number;
}

interface NodeClickDetail {
  id: string;
  label?: string;
  metadata?: Record<string, string | number>;
}
```

バリデーション用の JSON Schema（Draft 2020-12）をサブパス `@anytime-markdown/graph/schema`（= `graph-input.schema.json`）で公開している。
CDN なら `https://cdn.jsdelivr.net/npm/@anytime-markdown/graph/graph-input.schema.json` から取得できる。

> `id` は一意かつ非空であること。重複・空文字・未知の `schemaVersion` は `data` 代入時に例外になる。


## 制約

- **読み取り専用**: ノードの追加・削除・テキスト編集は対象外（`movable-nodes` でも変更できるのは位置のみ）。
- **規模**: 数千ノードまでを想定。1 万ノード超の大規模描画は対象外。


## 開発（このリポジトリ内）

```bash
npm run build --workspace=@anytime-markdown/graph   # dist 生成（ESM + IIFE + .d.ts）
npm run typecheck --workspace=@anytime-markdown/graph
npm test --workspace=@anytime-markdown/graph
```


## ライセンス

MIT
