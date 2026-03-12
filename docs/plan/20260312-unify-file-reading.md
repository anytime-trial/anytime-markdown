# ファイル読み込みロジック共通化

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** `handleImport`（左パネル / 通常モード）と `loadFile`（右パネル）のファイル読み込みロジックを共通ユーティリティに抽出する。

**Architecture:** `readFileAsText` 関数を `utils/fileReading.ts` に配置し、エンコーディング自動検出・改行コード正規化を一箇所に集約する。\
既存の `handleImport` は `readAsText` で簡易読み込みしていたが、共通化後は `readAsArrayBuffer` + BOM 検出に統一される。

**Tech Stack:** TypeScript, FileReader API, TextDecoder

---


## Task 1: `utils/fileReading.ts` の新規作成

**Files:**

- Create: `packages/editor-core/src/utils/fileReading.ts`

**Step 1: ユーティリティ関数を作成**

`InlineMergeView.tsx` から `detectEncoding`, `detectLineEnding` を移動し、`readFileAsText` を追加する。

```ts
export interface ReadFileResult {
  text: string;
  encoding: string;
  lineEnding: string;
}

export function detectEncoding(buffer: ArrayBuffer): { encoding: string; bomLength: number } {
  // InlineMergeView.tsx:60-72 と同一
}

export function detectLineEnding(text: string): string {
  // InlineMergeView.tsx:74-83 と同一
}

export function readFileAsText(file: File): Promise<ReadFileResult> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (!(reader.result instanceof ArrayBuffer)) return;
      const buffer = reader.result;
      const { encoding, bomLength } = detectEncoding(buffer);
      let text: string;
      if (encoding.startsWith("UTF-16 LE")) {
        text = new TextDecoder("utf-16le").decode(buffer.slice(bomLength));
      } else if (encoding.startsWith("UTF-16 BE")) {
        text = new TextDecoder("utf-16be").decode(buffer.slice(bomLength));
      } else {
        text = new TextDecoder("utf-8").decode(buffer.slice(bomLength));
      }
      const lineEnding = detectLineEnding(text);
      const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      resolve({ text: normalized, encoding, lineEnding });
    };
    reader.readAsArrayBuffer(file);
  });
}
```

**Step 2: ビルド確認**

Run: `cd packages/editor-core && npx tsc --noEmit --pretty 2>&1 | head -20`\
Expected: エラーなし


## Task 2: `InlineMergeView.tsx` の `loadFile` を共通関数で置換

**Files:**

- Modify: `packages/editor-core/src/components/InlineMergeView.tsx`

**Step 1: import 追加、ローカル関数削除**

- `import { readFileAsText } from "../utils/fileReading"` を追加
- `detectEncoding` 関数（60-72行）を削除
- `detectLineEnding` 関数（74-83行）を削除

**Step 2: `loadFile` を `readFileAsText` で書き換え**

```ts
const loadFile = (setter: (text: string) => void, metaSetter: (meta: FileMetadata) => void) => (file: File) => {
  readFileAsText(file).then(({ text, encoding, lineEnding }) => {
    metaSetter({ encoding, lineEnding });
    setter(text);
  });
};
```

**Step 3: ビルド確認**

Run: `cd packages/editor-core && npx tsc --noEmit --pretty 2>&1 | head -20`\
Expected: エラーなし


## Task 3: `useEditorFileOps.ts` の `handleImport` を共通関数で置換

**Files:**

- Modify: `packages/editor-core/src/hooks/useEditorFileOps.ts`

**Step 1: import 追加**

```ts
import { readFileAsText } from "../utils/fileReading";
```

**Step 2: `handleImport` を `readFileAsText` で書き換え**

変更前: `FileReader` + `readAsText` で直接読み込み。\
変更後: `readFileAsText` の Promise を使用。

```ts
const handleImport = useCallback(
  (file: File) => {
    if (!file.name.endsWith(".md") && !file.type.startsWith("text/")) return;
    readFileAsText(file).then(({ text }) => {
      if (sourceMode) {
        setSourceText(sanitizeMarkdown(text));
      } else {
        const { frontmatter, body } = parseFrontmatter(text);
        frontmatterRef.current = frontmatter;
        onFrontmatterChange?.(frontmatter);
        if (editor) {
          editor.commands.setContent(
            getMarkdownStorage(editor).parser.parse(
              preserveBlankLines(sanitizeMarkdown(body)),
            ),
          );
        }
      }
    });
  },
  [sourceMode, setSourceText, editor, frontmatterRef, onFrontmatterChange],
);
```

> `encoding` パラメータによる `readAsText` 指定がなくなるが、`readFileAsText` は BOM 検出で自動判定するため上位互換。

**Step 3: 不要な `encoding` import の確認**

`encoding` は `handleImport` 以外（`handleSaveFile` 等）でも使用しているため、パラメータ自体は残す。\
`handleImport` の依存配列から `encoding` を除外する。

**Step 4: ビルド確認**

Run: `cd packages/editor-core && npx tsc --noEmit --pretty 2>&1 | head -20`\
Expected: エラーなし


## Task 4: コミット

**Step 1: git add & commit**

```bash
git add packages/editor-core/src/utils/fileReading.ts \
       packages/editor-core/src/components/InlineMergeView.tsx \
       packages/editor-core/src/hooks/useEditorFileOps.ts
git commit -m "refactor: ファイル読み込みロジックを readFileAsText に共通化"
```
