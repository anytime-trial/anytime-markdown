/**
 * `<anytime-markdown-view>`（lean）— read-only の markdown 表示要素。
 *
 * markdown-viewer の基底 {@link AnytimeMarkdownEditorElement} を継承し（図表描画は含まない
 * 素の codeBlock 表示）、mount オプションを read-only + viewerToolbar（フォントサイズ -/+ と
 * dark/light 切替のみの最小ツールバー）+ ステータスバー非表示 に強制する。
 * figure 同梱版（markdown-rich の同名クラス）と同一タグ・同一 I/F の軽量双子。
 */
import { AnytimeMarkdownEditorElement } from "./AnytimeMarkdownEditorElement";
import {
  type MountVanillaMarkdownEditorOptions,
  type VanillaMarkdownEditorHandle,
} from "./host/vanillaMarkdownEditor";

export class AnytimeMarkdownViewElement extends AnytimeMarkdownEditorElement {
  protected override mountEditor(
    container: HTMLElement,
    options: MountVanillaMarkdownEditorOptions,
  ): VanillaMarkdownEditorHandle {
    return super.mountEditor(container, {
      ...options,
      readOnly: true,
      viewerToolbar: true,
      hideStatusBar: true,
    });
  }
}
