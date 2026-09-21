import type { DiagramDocument, DiagramLayout } from '@anytime-markdown/diagram-core';

export interface DiagramViewerOptions {
  readonly document: DiagramDocument;
  /** 表示 locale。省略時はブラウザ言語から検出する。 */
  readonly locale?: string;
  /**
   * 編集の入口を出すか。
   *
   * 出すかどうかは宿主が決める（VS Code は常に編集可、web-app は読み込んだ図だけ）。
   * 偽なら図は閲覧専用で、保存済みの配置をそのまま描く。
   */
  readonly editable?: boolean;
  /**
   * 読み物（導入文・末尾の注記）を省いて図に高さを譲るか。
   *
   * 編集の画面が真で渡す。配置を直す作業に読み物は要らない一方、常時数行を占めると図の高さが
   * そのぶん削られる。**凡例と操作の説明は省かない**（線の意味と掴み方は編集中にこそ引く）。
   */
  readonly compact?: boolean;
  /**
   * 保存。差分の全体を渡す。
   *
   * 投げた例外は「保存できなかった」として図の中に出す（宿主のダイアログへ飛ばさない）。
   */
  readonly onSave?: (layout: DiagramLayout) => void | Promise<void>;
  /** 下書きの変化。宿主が「未保存あり」の印を出すのに読む。`null` は編集していない状態。 */
  readonly onDraftChange?: (draft: DiagramLayout | null) => void;
}

export interface DiagramViewerUpdate {
  readonly document?: DiagramDocument;
  readonly locale?: string;
  readonly editable?: boolean;
  readonly compact?: boolean;
}

export interface DiagramViewerHandle {
  /**
   * 図・locale・編集の可否を差し替える。
   *
   * 図を差し替えると選択は空になる（別の図の人物名を次の操作へ持ち越さないため）。
   * 編集中の下書きは**持ち越さない** — 別の図の升目へ当てても意味を持たない。
   */
  update(next: DiagramViewerUpdate): void;
  /** 編集中の下書き。`null` は編集していない状態。 */
  getDraft(): DiagramLayout | null;
  destroy(): void;
}
