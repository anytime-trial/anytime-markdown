'use client';

/**
 * 脱React G3-2: vanilla orchestrator（rich codeblock 注入版）を mount する web-app 用ラッパ。
 *
 * `dynamic(..., { ssr: false })` で遅延読込する前提のため、重量 rich モジュール
 * （mermaid/katex 等の遅延 import 起点）は本ファイル経由でのみ静的参照する。
 */

import { mountVanillaRichMarkdownEditor } from '@anytime-markdown/markdown-rich/src/vanilla/mountVanillaRichMarkdownEditor';
import {
  VanillaMarkdownEditorMount,
  type VanillaMarkdownEditorMountProps,
} from '@anytime-markdown/markdown-react-islands';

export default function VanillaRichMarkdownEditor(
  props: Readonly<Omit<VanillaMarkdownEditorMountProps, 'mount'>>,
) {
  return <VanillaMarkdownEditorMount mount={mountVanillaRichMarkdownEditor} {...props} />;
}
