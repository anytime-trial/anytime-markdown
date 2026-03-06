# ラウンドトリップテスト項目一覧

更新日: 2026-03-05 テスト総数: 523 テスト中 45 テスト（下記1ファイル分）

---

## 仕様

### 概要

Markdown をエディタに読み込み、再度 Markdown として書き出したとき、内容が変わらないことを検証する結合テスト。

### テスト対象パイプライン

```
ソースモード → sanitizeMarkdown → preserveBlankLines → ProseMirror (WYSIWYG) → tiptap-markdown serializer → getMarkdownFromEditor (restoreBlankLines) → ソースモード
```

### テスト関数の種類

| 関数名 | パイプライン | 検証方式 |
| --- | --- | --- |
| `roundTrip` | `setContent` → `getMarkdownFromEditor` | `toContain`（要素の存在確認） |
| `fullRoundTrip` | `sanitizeMarkdown` → `preserveBlankLines` → `setContent` → `getMarkdownFromEditor` | `toBe`（完全一致） |
| `templateRoundTrip` | ファイル読込 → `sanitizeMarkdown` → `preserveBlankLines` → `setContent` → `getMarkdownFromEditor` | `toBe(original.trimEnd())`（末尾空白除き完全一致） |

---

## [ファイル: roundTrip.test.ts（45件）](packages/editor-core/src/__tests__/roundTrip.test.ts#L1)

### [1. ラウンドトリップ: markdown → Editor → markdown（5件）](packages/editor-core/src/__tests__/roundTrip.test.ts#L10)

`roundTrip` 関数使用（`toContain` 検証）

| \# | テスト名 | 検証内容 | IN | OUT（期待値） |
| --- | --- | --- | --- | --- |
| 1 | 見出しとテキスト | `# Hello`と本文が保持される | `# Hello\n\nsome text` | `# Hello` `some text` 含む |
| 2 | コードブロック（言語指定あり） | フェンスの開閉とコード内容 | ```` ```javascript\nconst x = 1;\n``` ```` | ```` ```javascript ```` `const x = 1;` ```` ``` ```` 含む |
| 3 | 空行を含む mermaid コードブロック | mermaid 内の空行が消えない | ```` ```mermaid\ngraph TD\n\nA --> B\n\nB --> C\n``` ```` | ```` ```mermaid ```` `graph TD` `A --> B` `B --> C` 含む |
| 4 | 複数のコードブロック（mermaid + plantuml） | 2種類のダイアグラムブロック | ```` ```mermaid\n...\n```\n\n```plantuml\n...\n``` ```` | ```` ```mermaid ```` ```` ```plantuml ```` `@startuml` 含む |
| 5 | 画像 + コードブロック | 画像 URL とフェンスコードの共存 | ```` ![alt](https://example.com/img.png)\n\n```js\nconst y = 2;\n``` ```` | `![alt](...)` ```` ```js ```` `const y = 2;` 含む |

### [2. ラウンドトリップ: 見出し（5件）](packages/editor-core/src/__tests__/roundTrip.test.ts#L67)

`roundTrip` 関数使用（`toBe` 完全一致検証）

| \# | テスト名 | 検証内容 | IN | OUT（期待値） |
| --- | --- | --- | --- | --- |
| 1 | h1 レベルの見出し | h1 保持 | `# 見出し1` | IN と同一 |
| 2 | h2 レベルの見出し | h2 保持 | `## 見出し2` | IN と同一 |
| 3 | h3 レベルの見出し | h3 保持 | `### 見出し3` | IN と同一 |
| 4 | h4 レベルの見出し | h4 保持 | `#### 見出し4` | IN と同一 |
| 5 | h5 レベルの見出し | h5 保持 | `##### 見出し5` | IN と同一 |

### [3. ラウンドトリップ: インライン装飾（7件）](packages/editor-core/src/__tests__/roundTrip.test.ts#L94)

`roundTrip` 関数使用（`toContain` 検証）

| \# | テスト名 | 検証内容 | IN | OUT（期待値） |
| --- | --- | --- | --- | --- |
| 1 | 太字（`**text**`） | 太字記法の保持 | `**太字テキスト**` | `**太字テキスト**` 含む |
| 2 | イタリック（`*text*`） | 斜体記法の保持 | `*斜体テキスト*` | `*斜体テキスト*` 含む |
| 3 | 打ち消し線（`~~text~~`） | 取消線記法の保持 | `~~取消線~~` | `~~取消線~~` 含む |
| 4 | インラインコード（`` `code` ``） | インラインコードの保持 | `` `inline code` `` | `` `inline code` `` 含む |
| 5 | リンク（`[text](url)`） | リンク記法の保持 | `[リンク](https://example.com)` | `[リンク](https://example.com)` 含む |
| 6 | ハイライト（`==text==`） | ハイライト記法の保持 | `==ハイライト==` | `==ハイライト==` 含む |
| 7 | 下線は HTML ベースのため toContain で検証 | `<u>`タグのテキスト保持 | `<u>下線テキスト</u>` | `下線テキスト` 含む |

### [4. ラウンドトリップ: ブロック要素（6件）](packages/editor-core/src/__tests__/roundTrip.test.ts#L146)

`roundTrip` 関数使用（`toContain` 検証）

| \# | テスト名 | 検証内容 | IN | OUT（期待値） |
| --- | --- | --- | --- | --- |
| 1 | ブロック引用（`> text`） | 引用記法の保持 | `> 引用テキスト\n` | `> 引用テキスト` 含む |
| 2 | 箇条書きリスト（`- item`） | 3項目の内容保持 | `- アイテム1\n- アイテム2\n- アイテム3\n` | `アイテム1` `アイテム2` `アイテム3` 含む |
| 3 | 番号付きリスト（`1. item`） | 3項目の内容・番号記法保持 | `1. 最初\n2. 次\n3. 最後\n` | `最初` `次` `最後` 含む、`\d+\.\s` マッチ |
| 4 | ネストされたリスト | 親子リスト構造の保持 | `- 親\n - 子1\n - 子2\n` | `親` `子1` `子2` 含む |
| 5 | タスクリスト（`- [ ]` / `- [x]`） | チェックボックス記法の保持 | `- [ ] 未完了タスク\n- [x] 完了タスク\n` | `未完了タスク` `完了タスク` `[ ]` `[x]` 含む |
| 6 | 水平線（`---`） | 水平線と前後テキストの保持 | `上のテキスト\n\n---\n\n下のテキスト\n` | `上のテキスト` `下のテキスト` `---` 含む |

### [5. ラウンドトリップ: テーブル（1件）](packages/editor-core/src/__tests__/roundTrip.test.ts#L211)

直接 `createTestEditor({ withTable: true })` 使用（`toContain` 検証）

| \# | テスト名 | 検証内容 | IN | OUT（期待値） |
| --- | --- | --- | --- | --- |
| 1 | 基本的なテーブル | パイプ記法・ヘッダー・データ行の保持 | \` | 名前 |

### [6. ラウンドトリップ: 複合要素（4件）](packages/editor-core/src/__tests__/roundTrip.test.ts#L234)

`roundTrip` 関数使用（`toContain` / `toMatch` 検証）

| \# | テスト名 | 検証内容 | IN | OUT（期待値） |
| --- | --- | --- | --- | --- |
| 1 | 見出し + 段落 + リスト | 3種ブロック要素の共存 | `## タイトル\n\n説明文です。\n\n- 項目A\n- 項目B` | `## タイトル` `説明文です` `項目A` `項目B` 含む |
| 2 | 見出し + リスト（ProseMirror が `\n\n` に正規化する） | ブロック間の`\n\n`正規化 | `### 構成\n\n- editor-core\n- web-app\n- vscode-extension` | `### 構成\n\n- editor-core` にマッチ |
| 3 | ブロック引用 + コードブロック | 引用とフェンスコードの共存 | ```` > 引用文\n\n```js\nconsole.log('hello');\n``` ```` | `> 引用文` ```` ```js ```` `console.log('hello');` 含む |
| 4 | 画像 + テーブル | 画像 URL とテーブル記法の共存 | \` | A |

### [7. 空行保持ラウンドトリップ（2件）](packages/editor-core/src/__tests__/roundTrip.test.ts#L286)

`preserveBlankLines` → `setContent` → `getMarkdownFromEditor`（`toBe` 完全一致検証）

| \# | テスト名 | 検証内容 | IN | OUT（期待値） |
| --- | --- | --- | --- | --- |
| 1 | 連続空行が保持される | 段落間の`\n\n\n\n`が保持される | `paragraph1\n\n\n\nparagraph2` | IN と同一 |
| 2 | 見出し間の連続空行が保持される | 見出し間の`\n\n\n\n`が保持される | `# Heading1\n\n\n\n## Heading2` | IN と同一 |

### [8. テンプレートファイル ラウンドトリップ（5件）](packages/editor-core/src/__tests__/roundTrip.test.ts#L309)

`templateRoundTrip` 関数使用（`toBe(original.trimEnd())` 完全一致検証）

| \# | テスト名 | 検証内容 | IN | OUT（期待値） |
| --- | --- | --- | --- | --- |
| 1 | defaultContent.md | テーブル付きテンプレートの完全一致 | ファイル内容 | `original.trimEnd()` と同一 |
| 2 | welcomeContent.md | ウェルカムテンプレートの完全一致 | ファイル内容 | `original.trimEnd()` と同一 |
| 3 | blogPost.md | ブログテンプレートの完全一致 | ファイル内容 | `original.trimEnd()` と同一 |
| 4 | meetingNotes.md | 議事録テンプレートの完全一致 | ファイル内容 | `original.trimEnd()` と同一 |
| 5 | readme.md | READMEテンプレートの完全一致 | ファイル内容 | `original.trimEnd()` と同一 |

### [9. エッジケース ラウンドトリップ（15件）](packages/editor-core/src/__tests__/roundTrip.test.ts#L357)

`fullRoundTrip` 関数使用（`toBe` 完全一致検証）

| \# | テスト名 | 検証内容 | IN | OUT（期待値） |
| --- | --- | --- | --- | --- |
| 1 | 見出し + 段落 + コードブロックの組み合わせ | 3種ブロック要素の完全一致 | ```` ## セクション\n\n説明文。\n\n```js\nconst x = 1;\n``` ```` | IN と同一 |
| 2 | 連続空行を挟む見出し群 | `\n\n\n`区切りの見出し3つ | `# 見出し1\n\n\n## 見出し2\n\n\n### 見出し3` | IN と同一 |
| 3 | 箇条書きリスト + 番号付きリスト連続 | 異種リストの空行区切り | `- A\n- B\n- C\n\n1. 一\n2. 二\n3. 三` | IN と同一 |
| 4 | タスクリスト（未完了 + 完了の混在） | 空行入りタスクリスト | `- [ ] 未完了\n\n- [x] 完了\n\n- [ ] もう一つ` | IN と同一 |
| 5 | タスクリスト（空行なし）が空行なしで保持される | tight タスクリスト | `- [x] エディタの基本操作を覚える\n- [x] ダイアグラムを試す\n- [ ] 自分のドキュメントを書いてみる` | IN と同一 |
| 6 | 見出し直後のリスト（空行なし）が保持される | `### H\n- item` の tight 保持 | `### 構成\n- editor-core\n- web-app\n- vscode-extension` | IN と同一 |
| 7 | 見出し + 空行 + リスト（空行が保持される） | `### H\n\n- item` の空行保持 | `### 構成\n\n- editor-core\n- web-app\n- vscode-extension` | IN と同一 |
| 8 | 見出し直後の番号付きリスト（空行なし）が保持される | `## H\n1. item` の tight 保持 | `## 手順\n1. ファイルを開く\n2. 編集する\n3. 保存する` | IN と同一 |
| 9 | 段落直後のリスト（空行なし）が保持される | `**bold:**\n1. item` の tight 保持 | `**改善内容:**\n1. xs/sm ブレークポイントでボタンを分離\n2. テスト追加` | IN と同一 |
| 10 | 段落 + 空行 + リスト（空行が保持される） | `text\n\n- item` の空行保持 | `改善内容:\n\n- 項目A\n- 項目B` | IN と同一 |
| 11 | 通常リスト（空行なし）が空行なしで保持される | 3項目 tight リスト | `- 項目A\n- 項目B\n- 項目C` | IN と同一 |
| 12 | ネストされた番号付きリストが空行なしで保持される | 親子番号リストの tight 保持 | `1. ファイルを開く\n 1. ツールバーの「開く」をクリック\n 2. .md ファイルを選択\n2. 編集する\n3. 保存する` | IN と同一 |
| 13 | ネストされた引用 | `> > 内側` のネスト引用 | `> 外側\n>\n> > 内側` | IN と同一 |
| 14 | 太字 + 斜体 + 打ち消し線を含む段落 | 複数インライン装飾の共存 | `これは**太字**と*斜体*と~~取消~~を含むテキスト` | IN と同一 |
| 15 | コードブロック → 段落 → コードブロック | フェンス間段落の完全一致 | ```` ```python\nprint('hello')\n```\n\n中間テキスト\n\n```bash\necho hi\n``` ```` | IN と同一 |
| 16 | 水平線で区切られたセクション | `---`区切り3セクション | `セクション1\n\n---\n\nセクション2\n\n---\n\nセクション3` | IN と同一 |
| 17 | リンク + インラインコードを含むリスト | リスト内インライン要素 | `- [リンク](https://example.com)\n- \`コード\`\\n- **太字項目**\` | IN と同一 |
| 18 | 5つの連続空行が保持される | `\n\n\n\n\n\n`の保持 | `段落A\n\n\n\n\n\n段落B` | IN と同一 |
| 19 | mermaid + plantuml 連続コードブロック | 2種ダイアグラムの完全一致 | ```` ```mermaid\ngraph TD\n A --> B\n```\n\n```plantuml\nA -> B\n``` ```` | IN と同一 |

### [10. エッジケース ラウンドトリップ — toContain 検証（4件）](packages/editor-core/src/__tests__/roundTrip.test.ts#L426)

`fullRoundTrip` / `roundTrip` 関数使用（`toContain` 部分一致検証）。ProseMirror の正規化により完全一致が保証されないケース。

| \# | テスト名 | 検証内容 | IN | OUT（期待値） |
| --- | --- | --- | --- | --- |
| 1 | 連続する段落行は ProseMirror がスペース結合する | ソフトブレーク（`\n`→スペース）の確認 | `**A11y レビュー**: 該当なし\n**Designer レビュー**: 該当なし` | `A11y` `Designer` 含む |
| 2 | insertContent でネストされたリストが空行なしで保持される | setContent と insertContent のドキュメント・出力一致 | `1. ファイルを開く\n 1. ツールバーの...\n2. 編集する\n3. 保存する` | setContent と insertContent で Doc・Md 一致 |
| 3 | 画像の後にテーブル | 画像 + テーブル記法の保持 | \` | A |
| 4 | 段落 → リスト → 段落の混在（ProseMirror 正規化） | 強調段落→リスト→強調段落 | `**レビュー結果:**\n1. 問題なし\n2. 修正済み\n\n**結論:**\n承認` | `問題なし` `修正済み` `結論` 含む |
