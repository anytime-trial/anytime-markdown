# DESIGN.md（システムデザイン）出力仕様

出力 1 本目。**観測値の転記**に徹し、解釈・意図の推定を書かない。読み手はコーディングエージェントであり、この文書だけで見た目を再現できることを目標にする。設計思想・メタファー・語彙は 2 本目（`ux-concept-template.md`）へ分離する。

形式は google-labs-code/design.md 仕様（alpha）に準拠する。YAML frontmatter の機械可読トークンと、Markdown 本文の人間可読な説明の 2 層構造を持つ。

## YAML frontmatter

```yaml
---
version: alpha
name: <プロダクト名>
description: <1 文の要約>
omitted: [<省略したセクション名>]
colors:
  <token-name>: "<CSS color>"
typography:
  <token-name>:
    fontFamily: <family>
    fontSize: <size>
rounded:
  <scale-level>: <dimension>
spacing:
  <scale-level>: <dimension>
components:
  <component-name>:
    <token-name>: <値 または トークン参照>
---
```

- `colors` のトークン名は役割で付ける（`primary` / `secondary` / `tertiary` / `neutral` / `surface` / `onSurface` 等）。観測した用途から命名し、`color1` のような無意味名を使わない。
- **文字色は `histograms.colors`（テキストノードの親要素の色）から引く。** 要素の `color` をそのまま採ると、カード全体を包む `<a>` のようにテキストを持たないラッパーの色まで拾い、画面に存在しない色をトークン化する。`roleStyles` の `textOwner: false` が付いた役割の `color` も同様に採らない（子が上書きしているか、チェックボックスのように文字を描画しない要素である）。
- `typography` のトークン名は役割名（`h1` / `h2` / `body-md` / `label-caps` / `code` 等）。抽出 JSON の `roleStyles` から引く。**頻度表（`histograms`）から作らない** — 見出しは要素数が少なく頻度表に埋もれるため、役割別の値と食い違う。
- `rounded` / `spacing` は観測値をスケール（`sm` / `md` / `lg`）に整理する。整理できない場合は無理にスケール化せず、`omitted` に入れて本文で理由を述べる。
- `components` は観測したコンポーネントを列挙し、値はトークン参照（`colors.primary` 等）で表す。参照に解決できない実測値はそのまま書く。

## 本文セクション（この順序を守る。省略は可、並べ替えは不可）

1. **Overview**（別名 Brand & Style）— 視覚的印象を数文で。ムードの描写に留め、UX の意図やメタファーの解釈を書かない
2. **Colors** — 各色の役割と観測箇所。CSS カスタムプロパティが本体のトークンであれば変数名を併記する
3. **Typography** — 役割ごとのファミリー・サイズ・ウェイト・行間。`roleStyles` の `variantCount` が大きい役割は「単一の代表値にまとまらない」と明記する
4. **Layout**（別名 Layout & Spacing）— コンテナ幅・グリッド・余白の基数
5. **Elevation & Depth**（別名 Elevation）— 影のスケール。使われていなければ「観測されない」と書く
6. **Shapes** — 角丸のスケール。値が揃わない場合は羅列でなく分岐条件の仮説を添える
7. **Components** — コンポーネントごとの実測スタイル
8. **Do's and Don'ts** — **観測から直接導ける規則のみ**。「影をほぼ使わず境界線で面を分ける」のように観測を根拠にできるものに限り、好みや一般論を書かない。導けなければセクションごと省略し `omitted` に記載する

仕様外のセクション（観測条件・限界・確度の注記）は、**正準 8 セクションのすべてより後**に `## 観測条件と限界` として置く。先頭に置くと `Overview` が押し下げられ、正準順を前提に読む機械処理を壊す。

**`:root` が他システムのシムで占有されていても「トークン設計が無い」と結論しない。** CSS 変数は `:root` 以外にも置かれる。たとえば Next.js の `next/font` は変数をラッパー要素の class として付与するため、`:root` の走査には現れない。抽出できた範囲を書き、変数が見つからないことを設計の不在の根拠にしない。

## 確度の扱い

- 1 ページでしか観測していない値には `（1 ページのみ観測）` を付ける
- `roleStyles` の `dominantCount / visibleCount` が過半に満たない役割は、代表値を断定せず変種を併記する
- テーマ・プリセット切替が疑われる場合、値の分岐を「不統一」と書かず、切替軸の仮説として書く
- **一部のページでしか `roleStyles` を取得できていない場合**、どのページ由来かを `Typography` 節の冒頭に 1 行で書く。各コンポーネントの記述へ分散させると読み手が全体の欠損範囲を掴めない
- **単一プロパティだけ値が取れなかった場合**（`border` が空文字列など）、該当セルに `未取得` と書いて残す。プロパティ 1 つのためにセクションや行ごと省略しない。`omitted` に入れるのはセクション全体を出力しなかったときに限る
