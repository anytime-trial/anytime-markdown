import { useEffect, useRef } from 'react';

/**
 * vanilla view の mount 契約。`container` に素 DOM を描画し、`update`/`destroy` を返す。
 *
 * trail-viewer の段階的 vanilla 化（refactor/trail-viewer-vanilla）で、まだ React の
 * シェルが残る期間に、React ツリー内へ vanilla view を「島」としてマウントするための型。
 * 全ビューが vanilla 化しシェルも素 DOM 化したら（Phase S5/最終）この橋は撤去する。
 */
export interface VanillaViewHandle<P> {
  /** 親（React シェル or 親 vanilla view）からの props 変化を反映する。 */
  update(props: P): void;
  /** listener 解除・child mount の destroy・タイマー clear。 */
  destroy(): void;
}

/** container に props を描画し handle を返す mount 関数。 */
export type VanillaViewMount<P> = (container: HTMLElement, props: P) => VanillaViewHandle<P>;

/** React ツリー内に vanilla view を島としてマウントする橋（移行期間のみ）。 */
export function VanillaIsland<P>({
  mount,
  props,
}: Readonly<{ mount: VanillaViewMount<P>; props: P }>): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const handle = useRef<VanillaViewHandle<P> | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    handle.current = mount(ref.current, props);
    return () => {
      handle.current?.destroy();
      handle.current = null;
    };
    // mount 関数 / 初回 props は再 mount しない（props 反映は下の update で行う）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // props が変わるたびに update を呼ぶ（依存配列なし = 毎レンダ。handle 側で差分検知する）。
  useEffect(() => {
    handle.current?.update(props);
  });

  return <div ref={ref} style={{ display: 'contents' }} />;
}
