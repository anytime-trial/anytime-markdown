import type { DiagramDocument } from '@anytime-markdown/diagram-core';

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
   * そのぶん削られる。操作の説明文は真偽にかかわらず出さない（画面から外した）。
   */
  readonly compact?: boolean;
  /**
   * 保存。**図の全体**を渡す。
   *
   * 配置差分だけを渡していた頃の形から広げてある。要素の追加・改名・手で引いた線は配置差分では
   * 表現できず、差分の中へ押し込むと「配置差分」が図の中身を持つことになる。宿主は受け取った図を
   * `validateDiagramDocument` に通してから書く（画面が組み立てた形をそのまま信じない）。
   *
   * 投げた例外は「保存できなかった」として図の中に出す（宿主のダイアログへ飛ばさない）。
   */
  readonly onSave?: (document: DiagramDocument) => void | Promise<void>;
  /** 下書きの変化。宿主が「未保存あり」の印を出すのに読む。`null` は編集していない状態。 */
  readonly onDraftChange?: (draft: DiagramDocument | null) => void;
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
  getDraft(): DiagramDocument | null;
  destroy(): void;
}
