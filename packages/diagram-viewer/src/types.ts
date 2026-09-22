import type { DiagramDocument } from '@anytime-markdown/diagram-core';

/**
 * 宿主が要素へ添える項目 1 つ。
 *
 * viewer は `id` の中身を解釈しない。押されたら宿主へそのまま返すだけで、何を指す鍵なのかは
 * 宿主だけが知っている。図の形式（`DiagramDocument`）に宿主固有の概念を持ち込まないための境界。
 */
export interface DiagramElementAnnexItem {
  readonly id: string;
  readonly label: string;
  /** 支援技術へ読ませる名前。省略時は `label` を使う。 */
  readonly ariaLabel?: string;
}

/**
 * 要素 1 つに添える項目群。札の中へ畳んで出す。
 *
 * 見出しの語（「地図で見る」など）は宿主が渡す。viewer 側の i18n に宿主固有の語を置くと、
 * 使う宿主が増えるたびに viewer の文言が増えて全言語ぶんの写しが要る。件数は viewer が添える
 * （数の書き方は言語に依らない）。
 */
export interface DiagramElementAnnex {
  readonly summary: string;
  readonly items: readonly DiagramElementAnnexItem[];
}

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
   * 開いた時点から編集状態で出し、**編集と閲覧の切り替え・図の中の保存ボタンを出さない**か。
   *
   * 編集そのものを目的に開く宿主（markdown 拡張の系図フェンスのダイアログ）が真で渡す。閲覧から
   * 始めて切替を押させると、開いた人がまず何もできない画面を 1 枚挟むことになる。
   *
   * 保存の口を図から外すぶん、宿主は自分の「適用」から `save()` を呼ぶ。`editable` が偽なら
   * 編集状態にはしない（閲覧専用がこの指定で編集に入れる形にしない）。
   */
  readonly alwaysEditing?: boolean;
  /**
   * 保存。**図の全体**を渡す。
   *
   * 配置差分だけを渡していた頃の形から広げてある。要素の追加・改名・手で引いた線は配置差分では
   * 表現できず、差分の中へ押し込むと「配置差分」が図の中身を持つことになる。宿主は受け取った図を
   * `validateDiagramDocument` に通してから書く（画面が組み立てた形をそのまま信じない）。
   *
   * 投げた例外は「保存できなかった」として図の中に出す（宿主のダイアログへ飛ばさない）。
   *
   * **書いた図を返してよい。** 宿主は受け取った図を検証してから書くので、実際に書かれた形は
   * 渡した下書きと同じとは限らない（`validateDiagramDraft` が正規化する）。返せば
   * `alwaysEditing` の続きの編集がその形から始まり、返さなければ渡した下書きのまま続く。
   */
  readonly onSave?: (document: DiagramDocument) => void | DiagramDocument | Promise<void | DiagramDocument>;
  /** 下書きの変化。宿主が「未保存あり」の印を出すのに読む。`null` は編集していない状態。 */
  readonly onDraftChange?: (draft: DiagramDocument | null) => void;
  /**
   * 札を押して選んだ。`null` は選びを外したこと。
   *
   * 図の外の表示を選びに合わせる宿主が読む（anytime-travel は人物の選びで地図を寄せる）。
   * 内部の `onSelectNode` を公開面へ出したもので、新しい操作を足すものではない。
   */
  readonly onSelect?: (name: string | null, additive: boolean) => void;
  /**
   * 要素ごとに札へ添える項目群。鍵は要素の名前。
   *
   * 関数ではなく写しで受ける。Custom Element の property として渡せる形にするため
   * （関数は属性にも property の JSON にも載らない）。
   */
  readonly elementAnnex?: Readonly<Record<string, DiagramElementAnnex>>;
  /** 添えた項目を押した。渡さなければ項目は押せない表示になる。 */
  readonly onAnnexActivate?: (elementName: string, itemId: string) => void;
}

export interface DiagramViewerUpdate {
  readonly document?: DiagramDocument;
  readonly locale?: string;
  readonly editable?: boolean;
  readonly compact?: boolean;
  /** 添える項目群の差し替え。宿主が図より後に読み終えることがあるため update でも受ける。 */
  readonly elementAnnex?: Readonly<Record<string, DiagramElementAnnex>>;
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
  /**
   * 保存する。図の中の保存ボタンと**同じ経路**（検証・失敗の知らせ・保存中の門）を通る。
   *
   * `alwaysEditing` の宿主が自分の「適用」から呼ぶ。別の経路を宿主側に作ると、保存中に指が
   * 動いたときの扱いや失敗の見せ方が 2 通りに割れる。編集していないときは何もしない。
   */
  save(): Promise<void>;
  destroy(): void;
}
