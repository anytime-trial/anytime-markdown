/**
 * C4 Sequence Model
 *
 * trail-viewer の C4 L3 要素の右クリック「シーケンス表示」で生成する
 * 構造化シーケンスモデル。SequenceAnalyzer (trail-activity) が生成し、
 * trace-viewer の buildC4SequenceLayout が graph-core nodes/edges に変換する。
 */

export interface SequenceParticipant {
    /** 参加者の一意 ID（要素単位ライフライン: "elem_<elementId>"）。 */
    readonly id: string;
    /** 対応する C4 element の ID。 */
    readonly elementId: string;
    /** 表示ラベル（要素名）。 */
    readonly label: string;
}

/** alt の各分岐。condition には if 条件式テキストや "else" を入れる。 */
export interface SequenceAltBranch {
    readonly condition: string;
    readonly steps: readonly SequenceStep[];
}

/**
 * シーケンスフラグメント。
 * - sequence: 順次実行（フラグメント矩形は描画しない）
 * - alt: if/else 分岐。1 つ以上の branch を持ち、最後の branch が else 相当
 * - loop: for/while/do-while/forEach 系の繰り返し
 * - opt: else を持たない if（オプショナル実行）
 */
export type SequenceFragment =
    | { readonly kind: 'sequence'; readonly steps: readonly SequenceStep[] }
    | { readonly kind: 'alt'; readonly branches: readonly SequenceAltBranch[] }
    | { readonly kind: 'loop'; readonly condition: string; readonly steps: readonly SequenceStep[] }
    | { readonly kind: 'opt'; readonly condition: string; readonly steps: readonly SequenceStep[] };

/**
 * シーケンスステップ。
 * call は実呼び出し、fragment は入れ子の制御構造。
 */
export type SequenceStep =
    | {
          readonly kind: 'call';
          /** 送信元参加者 ID（SequenceParticipant.id を参照）。 */
          readonly from: string;
          /** 送信先参加者 ID。 */
          readonly to: string;
          /** 呼び出し先関数名（実関数名）。 */
          readonly fnName: string;
          /** 呼び出し元関数名（activation グループ識別用）。 */
          readonly callerFnName: string;
          /** 呼び出し元ソース行番号（任意）。 */
          readonly line?: number;
          /** チェーン識別子。In→A→Out の各鎖を区別。 */
          readonly chainId: string;
      }
    | { readonly kind: 'fragment'; readonly fragment: SequenceFragment };

/**
 * SequenceAnalyzer が返す C4 シーケンスの完全モデル。
 */
export interface SequenceModel {
    readonly version: 1;
    /** 起点 C4 要素 ID（右クリックされた要素）。 */
    readonly rootElementId: string;
    readonly participants: readonly SequenceParticipant[];
    /** トップレベルフラグメント（通常 sequence）。 */
    readonly root: SequenceFragment;
    /** ステップ数上限超過で打ち切られた場合 true。 */
    readonly truncated?: boolean;
}
