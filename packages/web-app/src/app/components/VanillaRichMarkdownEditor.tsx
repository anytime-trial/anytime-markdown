'use client';

/**
 * 脱React G3-2 / WC 化: rich markdown エディタを **Web Component
 * `<anytime-markdown-rich-editor>` 経由** で mount する web-app 用ラッパ。
 *
 * `dynamic(..., { ssr: false })` で遅延読込する前提のため、重量 rich モジュール
 * （mermaid/katex 等の遅延 import 起点）と Custom Element 登録は本ファイル経由でのみ静的参照する。
 *
 * ライフサイクル（mount-once / live props の handle.update / エラー fallback）は
 * `VanillaMarkdownEditorMount` をそのまま流用し、その `mount` だけをカスタム要素生成アダプタ
 * （{@link createWebComponentMount}）へ差し替える。これにより editor 実体が
 * `<anytime-markdown-rich-editor>` として DOM に入る。app レベルのフル options
 * （fileSystemProvider / 各 callback / settings 等）は要素の `options` プロパティで渡す。
 */

import '@anytime-markdown/markdown-rich/src/element';
import {
  VanillaMarkdownEditorMount,
  type VanillaMarkdownEditorMountProps,
} from '@anytime-markdown/markdown-react-islands';
import {
  getWebImportProvider,
  setWebImportProvider,
} from '@anytime-markdown/markdown-viewer/src/webImport/webImportProvider';
import { useEffect, useMemo } from 'react';

import { createWebImportProvider } from '../../lib/webImportProvider';
import { createWebComponentMount } from './markdownWebComponentMount';

const mountRichWebComponent = createWebComponentMount('anytime-markdown-rich-editor');

export default function VanillaRichMarkdownEditor(
  props: Readonly<Omit<VanillaMarkdownEditorMountProps, 'mount'>>,
) {
  const webImportProvider = useMemo(() => createWebImportProvider(), []);

  useEffect(() => {
    if (!webImportProvider) return undefined;
    setWebImportProvider(webImportProvider);
    return () => {
      if (getWebImportProvider() === webImportProvider) {
        setWebImportProvider(null);
      }
    };
  }, [webImportProvider]);

  return <VanillaMarkdownEditorMount mount={mountRichWebComponent} {...props} />;
}
