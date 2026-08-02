// マニフェスト契約テスト。
//
// Stop フック記録の drain（`emergency/stopHookSpoolDrain.ts`）と TrailDataServer は
// どちらも拡張ホストの activate でしか起動しない。activationEvents が
// `onView:anytimeTrail.dashboard` だけだと、Trail ビューを開かない限り drain は
// 一度も走らず、Stop フックが書いたスプールは滞留し続ける（2026-08-02 実測: VS Code
// リロード後にデーモンが消滅し、8 件が取り込まれないまま残った）。
//
// spool 方式（0721a8f1e）が解消したのは「記録の全損」であって「取込の遅延」ではない。
// 遅延を構造的に塞ぐのは activationEvents の側なので、ここで契約として固定する。
import manifest from '../../package.json';

describe('vscode-trail-extension manifest: activationEvents', () => {
  it('UI 操作に依存せず activate する（drain とデーモンの起動条件を UI から切り離す）', () => {
    expect(manifest.activationEvents).toContain('onStartupFinished');
  });

  it('既存の onView トリガを失わない', () => {
    expect(manifest.activationEvents).toContain('onView:anytimeTrail.dashboard');
  });
});
