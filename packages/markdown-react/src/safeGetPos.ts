/**
 * ProseMirror の NodeView `getPos` は、ノードが doc から外れた（detached）直後に呼ぶと
 * 内部の `posBeforeChild` が undefined の `.size` を読んで throw する。これは React の
 * node view が render / selector / rAF コールバックで呼ぶ際に、doc 差し替え（ファイル選択・
 * 比較表示）と再レンダリングのタイミングが重なると発生し、EditorErrorBoundary を発火させて
 * エディタ全体をクラッシュさせる。
 *
 * throw を捕捉して undefined（位置不明）を返す。呼び出し側は元々 `pos == null` を
 * ガードしているため、undefined を安全に扱える。これは新しい TipTap が getPos に対して
 * 行っている挙動（detached 時は undefined）に合わせるものでもある。
 */
export function safeGetPos(getPos: () => number | undefined): () => number | undefined {
  return () => {
    try {
      return getPos()
    } catch {
      // detached ノードに対する getPos() の throw は想定内の一過性状態（上記参照）
      return undefined
    }
  }
}
