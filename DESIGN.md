---
version: alpha
name: Anytime Markdown
description: Anytime Markdown / Anytime Trail の web-app と markdown-editor が共有するデザイントークン。値は markdown-editor の定数から scripts/extract-design-tokens.mjs で抽出する。
colors:
  primary: "#3D4A52"
  primary-dark: "#90caf9"
  primary-strong: "#222A30"
  primary-strong-dark: "#42a5f5"
  on-primary: "#FBF9F3"
  on-primary-dark: "rgba(0,0,0,0.87)"
  secondary: "#e8a012"
  on-secondary: "#000000"
  background: "#F2EFE8"
  background-dark: "#0D1117"
  surface: "#FBF9F3"
  surface-dark: "#121212"
  on-surface: "#1F1E1C"
  on-surface-dark: "#ffffffde"
  on-surface-variant: "#5C5A55"
  on-surface-variant-dark: "#ffffff99"
  on-surface-disabled: "#A9A6A0"
  on-surface-disabled-dark: "#ffffff73"
  editor-text: "#1F1E1C"
  editor-text-dark: "#E2E8F0"
  divider: "rgba(31,30,28,0.12)"
  divider-dark: "rgba(255,255,255,0.12)"
  hover: "rgba(31,30,28,0.04)"
  hover-dark: "rgba(255,255,255,0.08)"
  selected: "rgba(31,30,28,0.08)"
  selected-dark: "rgba(255,255,255,0.16)"
  error: "#6B2A20"
  error-dark: "#f44336"
  warning: "#4A5A6B"
  warning-dark: "#9B7BD8"
  success: "#4B5A3E"
  success-dark: "#66bb6a"
  info: "#3D4A52"
  info-dark: "#42a5f5"
  code-surface: "#EBE8DF"
  code-surface-dark: "#161B22"
  heading-surface: "#DDD9CE"
  heading-surface-dark: "#1A202C"
  heading-link: "#1F1E1C"
  heading-link-dark: "#63B3ED"
  admonition-note: "#1f6feb"
  admonition-tip: "#238636"
  admonition-important: "#8957e5"
  admonition-warning: "#d29922"
  admonition-caution: "#da3633"
typography:
  headline-h1:
    fontFamily: '"Nunito", "Klee One", sans-serif'
    fontSize: 2em
    fontWeight: 700
    letterSpacing: -0.01em
  headline-h2:
    fontFamily: '"Nunito", "Klee One", sans-serif'
    fontSize: 1.5em
    fontWeight: 700
    letterSpacing: -0.01em
  headline-h3:
    fontFamily: '"Nunito", "Klee One", sans-serif'
    fontSize: 1.25em
    fontWeight: 700
    letterSpacing: -0.01em
  headline-h4:
    fontFamily: '"Nunito", "Klee One", sans-serif'
    fontSize: 1.1em
    fontWeight: 700
    letterSpacing: -0.01em
  body-md:
    fontFamily: '"Nunito", "Klee One", "Helvetica", "Arial", sans-serif'
    fontSize: 17px
    lineHeight: 1.6
  body-md-professional:
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif'
    fontSize: 17px
    lineHeight: 1.6
  ui-md:
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif'
    fontSize: 0.875rem
  ui-sm:
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif'
    fontSize: 0.8125rem
  label-md:
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif'
    fontSize: 0.75rem
  label-sm:
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif'
    fontSize: 0.625rem
  tooltip:
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif'
    fontSize: 12px
rounded:
  none: 0px
  sm: 12px
  md: 20px
  lg: 28px
  sm-professional: 4px
  md-professional: 8px
  lg-professional: 12px
spacing:
  3xs: 4px
  xxs: 8px
  xs: 12px
  sm: 16px
  md: 24px
  lg: 32px
  xl: 40px
  xxl: 48px
components:
  page:
    backgroundColor: "{colors.background}"
    textColor: "{colors.editor-text}"
    typography: "{typography.body-md}"
  page-dark:
    backgroundColor: "{colors.background-dark}"
    textColor: "{colors.editor-text-dark}"
    typography: "{typography.body-md}"
  page-professional:
    typography: "{typography.body-md-professional}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
  card-dark:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.on-surface-dark}"
    rounded: "{rounded.lg}"
  card-professional:
    rounded: "{rounded.lg-professional}"
  caption:
    textColor: "{colors.on-surface-variant}"
    typography: "{typography.label-md}"
  caption-dark:
    textColor: "{colors.on-surface-variant-dark}"
    typography: "{typography.label-md}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
  button-primary-hover:
    backgroundColor: "{colors.primary-strong}"
  button-primary-dark:
    backgroundColor: "{colors.primary-dark}"
    textColor: "{colors.on-primary-dark}"
    rounded: "{rounded.md}"
  button-primary-hover-dark:
    backgroundColor: "{colors.primary-strong-dark}"
  button-primary-professional:
    rounded: "{rounded.md-professional}"
  button-cta:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.on-secondary}"
    rounded: "{rounded.md}"
  button-disabled:
    textColor: "{colors.on-surface-disabled}"
  button-disabled-dark:
    textColor: "{colors.on-surface-disabled-dark}"
  divider:
    backgroundColor: "{colors.divider}"
  divider-dark:
    backgroundColor: "{colors.divider-dark}"
  list-item-hover:
    backgroundColor: "{colors.hover}"
  list-item-hover-dark:
    backgroundColor: "{colors.hover-dark}"
  list-item-selected:
    backgroundColor: "{colors.selected}"
  list-item-selected-dark:
    backgroundColor: "{colors.selected-dark}"
  menu-item:
    typography: "{typography.ui-md}"
  context-menu-item:
    typography: "{typography.ui-sm}"
  badge:
    typography: "{typography.label-sm}"
    rounded: "{rounded.sm}"
  badge-professional:
    rounded: "{rounded.sm-professional}"
  tooltip:
    typography: "{typography.tooltip}"
    rounded: "{rounded.sm}"
  alert-error:
    textColor: "{colors.error}"
  alert-error-dark:
    textColor: "{colors.error-dark}"
  alert-warning:
    textColor: "{colors.warning}"
  alert-warning-dark:
    textColor: "{colors.warning-dark}"
  alert-success:
    textColor: "{colors.success}"
  alert-success-dark:
    textColor: "{colors.success-dark}"
  alert-info:
    textColor: "{colors.info}"
  alert-info-dark:
    textColor: "{colors.info-dark}"
  code-block:
    backgroundColor: "{colors.code-surface}"
    textColor: "{colors.editor-text}"
  code-block-dark:
    backgroundColor: "{colors.code-surface-dark}"
    textColor: "{colors.editor-text-dark}"
  heading-h1:
    backgroundColor: "{colors.heading-surface}"
    textColor: "{colors.heading-link}"
    typography: "{typography.headline-h1}"
  heading-h1-dark:
    backgroundColor: "{colors.heading-surface-dark}"
    textColor: "{colors.heading-link-dark}"
    typography: "{typography.headline-h1}"
  heading-h2:
    typography: "{typography.headline-h2}"
  heading-h3:
    typography: "{typography.headline-h3}"
  heading-h4:
    typography: "{typography.headline-h4}"
  admonition-note:
    textColor: "{colors.admonition-note}"
  admonition-tip:
    textColor: "{colors.admonition-tip}"
  admonition-important:
    textColor: "{colors.admonition-important}"
  admonition-warning:
    textColor: "{colors.admonition-warning}"
  admonition-caution:
    textColor: "{colors.admonition-caution}"
---

# Anytime Markdown

## Overview

Markdown を読み書きするノートブックの温かさを目指す。広い余白でコンテンツへ視線を寄せ、差し色はアンバーゴールド 1 色に限る。

- **アプリの既定はダーク**（`providers.tsx` の初期値 `dark`）。ダークは夜の作業向けの深いネイビー、ライトは和紙と墨の水墨画パレット。
- 見た目のプリセットが 2 つある。既定は `handwritten`（丸い角と Nunito / Klee One の手書き調）、もう一方が `professional`（小さい角と Roboto）。
- 本書はトークン集である。設計の意図・規約の正本は `spec/10.web-app/design.md`（anytime-markdown-docs）で、次の内容は本書に写さない: モーション（§5）、スクロールバー（§6）、ブランドマーク（§7）、アイコン（§8）、レイアウト規則（§9）、文章のトーンと禁則（§10）、アクセシビリティと識別子規約（§11）、本文の行長 measure（§3.4、ユーザー設定で切り替わる）、ランディング（Caravan Press）専用の書体（§3.1.1）。
- 値の抽出元は `packages/markdown-editor/src/constants/colors.ts` / `themePresets.ts` / `dimensions.ts` と `packages/web-app/src/app/[locale]/providers.tsx`。トークンを変えたら `node scripts/extract-design-tokens.mjs` で再抽出して照合する。

## Colors

ライトの値を基本名に置き、ダークの値は同じ名前に `-dark` を付けて並べる（例: `surface` / `surface-dark`）。モードで値が変わらない色は接尾辞を持たない。

- **青墨 (#3D4A52) / 淡い空色 (#90caf9):** `primary`。リンクと操作 UI。ホバーは濃墨の重ね (#222A30) / 青 (#42a5f5) の `primary-strong`。MUI の `primary.light` は淡墨のぼかし (#8A918F) / (#e3f2fd)、`warning.light` は (#5D6E80) / (#B89FE8) で、どちらもトークン化していない。
- **アンバーゴールド (#e8a012):** `secondary`。唯一の差し色で CTA と強調に使う。上に載る文字は黒 (#000000)。検索ハイライトはアルファ版 `rgba(232,160,18,0.35)`。
- **和紙の素地 (#F2EFE8) / ほぼ黒のネイビー (#0D1117):** `background`。ライトは純白を使わない。
- **紙肌 (#FBF9F3) / (#121212):** `surface`。カード・ダイアログ・メニューの面。
- **濃墨 (#1F1E1C) / (#ffffffde):** `on-surface`。UI の本文。中墨 (#5C5A55) / (#ffffff99) が補足、淡墨 (#A9A6A0) / (#ffffff73) が無効。
- **エディタ本文 (#1F1E1C) / (#E2E8F0):** `editor-text`。ユーザー設定で上書きできる。
- **細墨線 / 白 12%:** `divider`。ホバー背景は `hover`、選択背景は `selected`（いずれも半透明）。
- **状態色:** `error` 焦墨 (#6B2A20) / (#f44336)、`warning` 藍墨 (#4A5A6B) / 紫苑 (#9B7BD8)、`success` 松葉墨 (#4B5A3E) / (#66bb6a)、`info` 青墨 (#3D4A52) / (#42a5f5)。warning はアンバーと色相を分けるためオレンジ系を使わない。
- **エディタ面:** コードブロック `code-surface` (#EBE8DF) / (#161B22)、見出し背景 `heading-surface` (#DDD9CE) / (#1A202C)、見出しリンク `heading-link` (#1F1E1C) / (#63B3ED)。
- **Admonition（GitHub 準拠・モード共通）:** note (#1f6feb)、tip (#238636)、important (#8957e5)、warning (#d29922)、caution (#da3633)。

## Typography

- **本文（エディタ）:** プリセットの本文書体で 17px・行間 1.6（`editorSettings.ts` の `DEFAULT_SETTINGS`）。handwritten は `"Nunito", "Klee One", "Helvetica", "Arial", sans-serif`、professional は `"Roboto", "Helvetica", "Arial", sans-serif`。
- **見出し（エディタ）:** 本文に対する em 指定で h1 2em / h2 1.5em / h3 1.25em / h4 1.1em、いずれも太さ 700・字間 -0.01em（`editorContentCss.ts`）。handwritten の見出し書体は `"Nunito", "Klee One", sans-serif`（`applyEditorThemeCssVars.ts`）。professional の見出し書体は正本と実装が食い違っているため、トークンに置いていない。
- **UI（chrome）:** MUI テーマの書体 `"Roboto", "Helvetica", "Arial", sans-serif` はプリセットに依存しない。メニュー・ステータスバー 0.875rem、コンテキストメニュー・アウトライン・コメント本文 0.8125rem、チップ・小ボタン・キャプション 0.75rem、バッジ・検索カウンター 0.625rem、ツールチップ 12px（`dimensions.ts`）。

## Layout

4px を最小単位とする 8 段の余白スケール（`dimensions.ts` の `SPACING_*`）: 4 / 8 / 12 / 16 / 24 / 32 / 40 / 48px。エディタ本文の左右余白は `clamp(16px, 4vw, 48px)` で画面幅に追随する。

## Elevation & Depth

面の段差は背景色の明度差で作る（`background` → `surface` → `code-surface` / `heading-surface`）。影の値は MUI 標準に任せており、本書ではトークン化していない。

## Shapes

角丸はプリセットで変わる。基本名が handwritten（sm 12px / md 20px / lg 28px）、`-professional` 接尾辞が professional（4 / 8 / 12px）。カードは `lg`、ボタンと入力は `md`、バッジとツールチップは `sm`。円形のボタンとアバターは 50%（`RADIUS_FULL`）。MUI テーマの `shape.borderRadius` はプリセットの `md` を使う。

handwritten の見出しは四隅の異なる角丸（h1 `12px 8px 10px 6px` など）と斜線ハッチの背景で手書き感を出す。

## Components

- ボタンは `button-primary`（操作）と `button-cta`（アンバー、画面の主要行動）の 2 系統。
- 一覧のホバーと選択は `list-item-hover` / `list-item-selected` の半透明背景で示す。
- 状態の通知は `alert-*` の色に加え、アイコンとラベルを必ず伴う（色だけで伝えない）。
- コードブロックと見出しの面はエディタ専用色（`code-block`・`heading-h1`）を使う。

## Do's and Don'ts

- Do: アンバー (#e8a012) は CTA と強調だけに使う。装飾には使わない。
- Do: 新しい画面はダーク・ライトの両方で確認する。
- Don't: UI コピーに絵文字を使わない。
- Don't: ボタンラベルを全大文字にしない（`text-transform: none`）。
- Don't: セクションの背景にグラデーションを使わない（ヒーローと CTA のオーラに限る）。
- Don't: 状態を色だけで伝えない。アイコン＋ラベル＋色の三重で示す。
