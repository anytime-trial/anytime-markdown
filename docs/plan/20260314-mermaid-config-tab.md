# Mermaid Config タブ & ダイアログ分離

## 意図

- Mermaid 全画面表示に Config タブを追加し、`%%{init: ...}%%` ディレクティブを GUI で編集可能にする
- Mermaid / PlantUML の全画面ダイアログを分離し、各ダイアグラムに最適化した UI を提供する

## 選択理由

- **コード内埋め込み方式 (A)**: ノード属性追加不要、ソースモード/エクスポートでも設定維持、Mermaid 公式構文準拠
- **ダイアログ分離**: 将来の個別拡張が容易、コードの見通し向上

## 実装タスク

### Task 1: ディレクティブ抽出/合成ユーティリティ

**ファイル**: `packages/editor-core/src/utils/mermaidConfig.ts` (新規)

```typescript
// %%{init: {...}}%% を code から抽出
extractMermaidConfig(code: string): { config: string; body: string }
// config JSON と body を結合して code に戻す
mergeMermaidConfig(config: string, body: string): string
```

- 正規表現: `/^%%\{init:\s*([\s\S]*?)\}%%\s*/`
- config が空 or `{}` の場合はディレクティブを付与しない
- パース失敗時は config をそのまま文字列として保持（ユーザーの入力を壊さない）

### Task 2: MermaidFullscreenDialog (新規)

**ファイル**: `packages/editor-core/src/components/MermaidFullscreenDialog.tsx`

- `DiagramFullscreenDialog` から Mermaid 固有部分を移植
- コードエリアに Code / Config タブを追加
- タブ切替は MUI `Tabs` + `Tab`
- Config タブは JSON テキストエリア（`%%{init: ...}%%` の中身）
- Config 変更時に `mergeMermaidConfig()` で合成し `onFsCodeChange` 経由で TipTap に反映
- 全画面オープン時に `extractMermaidConfig()` で分離、クローズ時に合成
- Props: `DiagramFullscreenDialog` から `isPlantUml`, `plantUmlUrl` を除去、`isMermaid` は不要（常に true）

### Task 3: PlantUmlFullscreenDialog (新規)

**ファイル**: `packages/editor-core/src/components/PlantUmlFullscreenDialog.tsx`

- `DiagramFullscreenDialog` から PlantUML 固有部分を移植
- `isMermaid`, `svg` 関連を除去
- Config タブなし（PlantUML はコード内で `skinparam` 等を記述）

### Task 4: DiagramBlock 呼び出し更新

**ファイル**: `packages/editor-core/src/components/codeblock/DiagramBlock.tsx`

- `DiagramFullscreenDialog` の import を `MermaidFullscreenDialog` と `PlantUmlFullscreenDialog` に変更
- `isMermaid` で条件分岐して適切なダイアログを表示

### Task 5: 旧ダイアログ削除

**ファイル**: `packages/editor-core/src/components/DiagramFullscreenDialog.tsx` (削除)

### Task 6: i18n キー追加

**ファイル**: `en.json`, `ja.json`

- `codeTab`: "Code" / "コード"
- `configTab`: "Config" / "設定"

### Task 7: テスト更新

**ファイル**: `DiagramBlock.test.tsx`

- モックを `MermaidFullscreenDialog` / `PlantUmlFullscreenDialog` に変更

### Task 8: ビルド検証・テスト実行

## 参照資料

- [Mermaid Directives](https://mermaid.js.org/config/directives.html)
- 既存: `DiagramFullscreenDialog.tsx` (267行)
