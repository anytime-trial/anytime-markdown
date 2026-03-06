# モード変換テスト項目一覧

更新日: 2026-03-05
テスト総数: 523 テスト中 28 テスト（下記1ファイル分）

---

## モード変換の仕様

### 概要

ソースモード（生 Markdown）と WYSIWYG モード（ProseMirror エディタ）間の変換処理。ユーザーがモードを切り替えても、Markdown の内容・書式・改行数が変わらないことを保証する。

### データフロー

```
ソースモード → sanitizeMarkdown → preserveBlankLines → ProseMirror (WYSIWYG) → tiptap-markdown serializer → getMarkdownFromEditor (restoreBlankLines) → ソースモード
```

| フェーズ | 関数 | 定義ファイル | 処理内容 |
|---------|------|------------|---------|
| 1. 入力サニタイズ | `sanitizeMarkdown` | `sanitizeMarkdown.ts` | 危険な HTML タグを DOMPurify で除去。許可タグ（`<mark>`, `<kbd>`, `<details>` 等）は保持。コードブロック内は処理対象外。Math・脚注・コメントの前処理も実行。 |
| 2. 入力前処理 | `preserveBlankLines` | `sanitizeMarkdown.ts` | ProseMirror が正規化で失う改行情報を不可視マーカーで記録。連続空行（`\n{3,}`）→ ZWSP (`\u200B`) マーカー段落、ブロック間の tight transition（空行なし）→ ZWNJ (`\u200C`) マーカー。 |
| 3. WYSIWYG 編集 | ProseMirror + tiptap-markdown | （外部ライブラリ） | ブロック間を常に `\n\n` に正規化（`flushClose(2)`）。連続空行は1つに圧縮。 |
| 4. 出力取得 | `getMarkdownFromEditor` | `types.ts` | tiptap-markdown シリアライザから Markdown を取得。`restoreBlankLines` → `postprocessMathBlock` → コメントデータ付加の順に後処理。 |
| 5. 出力後処理 | `restoreBlankLines` | `sanitizeMarkdown.ts` | ZWNJ + `\n\n` → `\n`（tight transition 復元）、ZWSP 段落 → 空行（連続空行復元）。マーカーを全除去して元の改行数に戻す。 |

### 保証する不変条件

- **改行数の保持**: 元の Markdown の改行数が変換後も維持される（増えない・減らない）
- **HTML 安全性**: `<script>`, `<iframe>` 等の危険タグは除去される
- **許可タグの保持**: `<mark>`, `<kbd>`, `<sub>`, `<sup>`, `<u>`, `<br>`, `<hr>`, `<details>`, `<summary>` は除去されない
- **コードブロックの不可侵**: コードフェンス内の内容は一切変更されない
- **Markdown 記法の保持**: `>`, `**`, `*`, `~~`, `` ` `` 等の記法がサニタイズで壊れない

---

## [ファイル A: modeConversion.test.ts（28件）](packages/editor-core/src/__tests__/modeConversion.test.ts#L1)

ユニットテスト（エディタ不要 or モックエディタ使用）

### [1. sanitizeMarkdown（21件）](packages/editor-core/src/__tests__/modeConversion.test.ts#L7)

ソースモードの Markdown を WYSIWYG エディタに渡す前に HTML をサニタイズする。コードブロック内はそのまま保持し、コードブロック外のみ DOMPurify で処理する。許可タグ（`<mark>`, `<kbd>`, `<details>` 等）は残し、`<script>`, `<div>` 等は除去。Math・脚注・コメントの前処理もここで行う。

| # | テスト名 | 検証内容 | IN | OUT（期待値） |
|---|---------|---------|-----|--------------|
| 1 | コードブロック内のHTMLタグを保持する | ```` ```html ````内の`<div>`が除去されない | `` ```html\n<div class="foo">bar</div>\n```\n `` | IN と同一 |
| 2 | コードブロック外の不許可HTMLタグを除去しテキストを保持する | `<script>`除去、テキスト保持 | `hello <script>alert(1)</script> world\n` | `<script>` なし、`hello` `world` 含む |
| 3 | 許可タグ（details, mark等）を保持する | `<details>`,`<summary>`が残る | `<details><summary>Title</summary>\n\ncontent\n\n</details>\n` | `<details>` `<summary>` `</details>` 含む |
| 4 | コードブロック内の > < & 文字を保持する | ```` ```js ````内の比較演算子がエスケープされない | `` ```js\nif (a > 0 && b < 1) { return a & b; }\n```\n `` | IN と同一 |
| 5 | 空行を含むコードブロックを正常に処理する | ```` ```mermaid ````内の空行が消えない | `` ```mermaid\ngraph TD\n\nA --> B\n\nB --> C\n```\n `` | IN と同一 |
| 6 | 複数のコードブロックを正常に処理する | 2つのコードブロック間テキストが保持される | `` text before\n\n```js\nconst a = 1;\n```\n\nmiddle text\n\n```python\nprint('hello')\n```\n\ntext after\n `` | IN と同一 |
| 7 | コードブロック前後の改行を保持する | フェンス前後の`\n\n`が消えない | `` before\n\n```js\ncode\n```\n\nafter\n `` | IN と同一 |
| 8 | `<mark>`テキスト`</mark>`を保持する | ハイライトタグ保持 | `これは<mark>重要</mark>です\n` | `<mark>重要</mark>` 含む |
| 9 | `<kbd>`テキスト`</kbd>`を保持する | キーボードタグ保持 | `<kbd>Ctrl+C</kbd>でコピー\n` | `<kbd>Ctrl+C</kbd>` 含む |
| 10 | `<sub>`テキスト`</sub>`を保持する | 下付きタグ保持 | `H<sub>2</sub>O\n` | `<sub>2</sub>` 含む |
| 11 | `<sup>`テキスト`</sup>`を保持する | 上付きタグ保持 | `x<sup>2</sup>+1\n` | `<sup>2</sup>` 含む |
| 12 | `<u>`テキスト`</u>`を保持する | 下線タグ保持 | `<u>下線テキスト</u>\n` | `<u>下線テキスト</u>` 含む |
| 13 | `<br>`を保持する | 改行タグ保持 | `行1<br>行2\n` | `<br>` 含む |
| 14 | `<hr>`を保持する | 水平線タグ保持 | `上<hr>下\n` | `<hr>` 含む |
| 15 | 不許可タグを除去しテキストを保持する | タグ除去、テキスト保持 | `<div>ブロック</div><span>インライン</span>\n` | `<div>` `<span>` なし、`ブロック` `インライン` 含む |
| 16 | コメントハイライト span が保護・復元される | `data-comment-id`変換・復元 | `Hello <!-- comment-start:c1 -->world<!-- comment-end:c1 --> end.\n` | `data-comment-id="c1"` 含む、`CMT` なし |
| 17 | コメントポイント span が保護・復元される | `data-comment-point`変換・復元 | `Hello <!-- comment-point:c2 --> end.\n` | `data-comment-point="c2"` 含む、`CMTP` なし |
| 18 | マークダウン記法をサニタイズで壊さない | `>`, `**`がエスケープされない | `> 引用テキスト\n\n**太字テキスト**\n` | `> 引用テキスト` `**太字テキスト**` 含む |
| 19 | テキスト前後の改行をDOMPurifyが除去しない | 先頭・末尾の`\n\n`が保持される | `\n\nsome <b>text</b>\n\n` | 先頭 `\n\n`、末尾 `\n\n`、`some text` 含む |
| 20 | コードブロック間のテキスト部の改行を保持する | フェンス間の段落改行が消えない | `` ```js\ncode1\n```\n\nparagraph\n\n```js\ncode2\n```\n `` | IN と同一 |
| 21 | 改行のみの部分はそのまま保持する | `\n\n\n\n`がそのまま返る | `aaa\n\n\n\nbbb\n` | IN と同一 |

### [2. preserveBlankLines（5件）](packages/editor-core/src/__tests__/modeConversion.test.ts#L166)

エディタへの入力前処理。ProseMirror が圧縮・正規化する情報を ZWSP/ZWNJ マーカーで記録する。連続空行（`\n{3,}`）を ZWSP マーカー段落に変換し（空行圧縮対策）、ブロック間の tight transition（空行なし）を ZWNJ でマークする（`\n\n` 正規化対策）。

| # | テスト名 | 検証内容 | IN | OUT（期待値） |
|---|---------|---------|-----|--------------|
| 1 | 3つ以上の改行を ZWSP マーカー段落に変換する | `\n\n\n\n` → ZWSP 挿入 | `text1\n\n\n\ntext2\n` | `text1\n\n\u200B\n\n\u200B\n\ntext2\n` |
| 2 | 2つの改行（通常の段落区切り）はそのまま | `\n\n`が変更されない | `text1\n\ntext2\n` | IN と同一 |
| 3 | コードブロック内の連続改行は保持する | フェンス内部は非対象 | `` text\n\n```\ncode\n\n\n\ncode\n```\n\ntext\n `` | `code\n\n\n\ncode` 含む |
| 4 | 通常の入力をそのまま返す（改行数を変更しない） | 空行ありリスト等がそのまま | `テキスト\n\n- リスト\n` / `- 項目A\n\n1. 項目B\n` / `行1\n行2\n行3\n` | 各 IN と同一 |
| 5 | リスト前後の tight transition に ZWNJ マーカーを付与する | 空行なし→ZWNJ付与、空行あり→なし | `テキスト\n- リスト\n` / `# 見出し\n- リスト\n` / `- リスト\nテキスト\n` / `テキスト\n\n- リスト\n` | `テキスト\u200C\n- リスト\n` / `# 見出し\u200C\n- リスト\n` / `- リスト\u200C\nテキスト\n` / IN と同一 |

### [3. getMarkdownFromEditor — 改行数を変更しない（2件）](packages/editor-core/src/__tests__/modeConversion.test.ts#L139)

WYSIWYG エディタから Markdown 文字列を取得する出口関数。tiptap-markdown シリアライザの出力に対し、`restoreBlankLines` で空行マーカーを復元し、`postprocessMathBlock` で math フェンスを `$$` 記法に変換し、コメントデータを末尾に付加する。

| # | テスト名 | 検証内容 | IN（モックシリアライザ出力） | OUT（期待値） |
|---|---------|---------|--------------------------|--------------|
| 1 | シリアライザ出力の改行数をそのまま保持する | 画像→コードブロック間の`\n`が増えない | `![img](url)\n```js\ncode\n```\n` | `![img](url)\n```js` 含む |
| 2 | 既に空行がある場合、そのまま保持する | 画像→コードブロック間の`\n\n`がそのまま | `![img](url)\n\n```js\ncode\n```\n` | `![img](url)\n\n```js` 含む |

### [4. restoreBlankLines（2件）](packages/editor-core/src/__tests__/modeConversion.test.ts#L209)

エディタからの出力後処理（`getMarkdownFromEditor` 内で呼ばれる）。`preserveBlankLines` が埋め込んだマーカーを除去し、元の改行数を復元する。ZWNJ + `\n\n` → `\n`（tight transition 復元）、ZWSP 段落 → 空行（連続空行復元）。

| # | テスト名 | 検証内容 | IN | OUT（期待値） |
|---|---------|---------|-----|--------------|
| 1 | ZWSP マーカーを除去して空行を復元する | ZWSP 段落 → 空行に戻る | `text1\n\n\u200B\n\n\u200B\n\ntext2\n` | `text1\n\n\n\ntext2\n` |
| 2 | ZWSP がなければそのまま返す | マーカーなしは変更なし | `text1\n\ntext2\n` | IN と同一 |
