import { renderHook, act } from "@testing-library/react";
import { useMergeDiff } from "../hooks/useMergeDiff";

describe("useMergeDiff", () => {
  test("初期状態 → diffResult null、canUndo/canRedo false", () => {
    const { result } = renderHook(() => useMergeDiff());
    expect(result.current.diffResult).toBeNull();
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
    expect(result.current.leftText).toBe("");
    expect(result.current.rightText).toBe("");
  });

  test("テキスト設定 → diffResult 生成", () => {
    const { result } = renderHook(() => useMergeDiff());
    act(() => {
      result.current.setLeftText("line1\nold\n");
      result.current.setRightText("line1\nnew\n");
    });
    expect(result.current.diffResult).not.toBeNull();
    expect(result.current.diffResult!.blocks.length).toBeGreaterThan(0);
    expect(result.current.totalBlocks).toBeGreaterThan(0);
  });

  test("mergeBlock left-to-right → 右テキスト更新", () => {
    const { result } = renderHook(() => useMergeDiff());
    act(() => {
      result.current.setLeftText("line1\nold\n");
      result.current.setRightText("line1\nnew\n");
    });
    const blockId = result.current.diffResult!.blocks[0].id;
    act(() => result.current.mergeBlock(blockId, "left-to-right"));
    expect(result.current.rightText).toBe(result.current.leftText);
  });

  test("mergeBlock right-to-left → 左テキスト更新 + コールバック", () => {
    const onLeftTextChange = jest.fn();
    const { result } = renderHook(() => useMergeDiff(onLeftTextChange));
    act(() => {
      result.current.setLeftText("line1\nold\n");
      result.current.setRightText("line1\nnew\n");
    });
    const blockId = result.current.diffResult!.blocks[0].id;
    act(() => result.current.mergeBlock(blockId, "right-to-left"));
    expect(result.current.leftText).toBe("line1\nnew\n");
    expect(onLeftTextChange).toHaveBeenCalledWith("line1\nnew\n");
  });

  test("mergeAllBlocks left-to-right → 右テキストが左と同一に", () => {
    const { result } = renderHook(() => useMergeDiff());
    act(() => {
      result.current.setLeftText("aaa\n");
      result.current.setRightText("bbb\n");
    });
    act(() => result.current.mergeAllBlocks("left-to-right"));
    expect(result.current.rightText).toBe("aaa\n");
  });

  test("mergeAllBlocks right-to-left → 左テキストが右と同一に", () => {
    const onLeftTextChange = jest.fn();
    const { result } = renderHook(() => useMergeDiff(onLeftTextChange));
    act(() => {
      result.current.setLeftText("aaa\n");
      result.current.setRightText("bbb\n");
    });
    act(() => result.current.mergeAllBlocks("right-to-left"));
    expect(result.current.leftText).toBe("bbb\n");
    expect(onLeftTextChange).toHaveBeenCalledWith("bbb\n");
  });

  test("undo → 前の状態に戻る", () => {
    const { result } = renderHook(() => useMergeDiff());
    act(() => {
      result.current.setLeftText("line1\nold\n");
      result.current.setRightText("line1\nnew\n");
    });
    const blockId = result.current.diffResult!.blocks[0].id;
    act(() => result.current.mergeBlock(blockId, "left-to-right"));
    expect(result.current.canUndo).toBe(true);

    act(() => result.current.undo());
    expect(result.current.leftText).toBe("line1\nold\n");
    expect(result.current.rightText).toBe("line1\nnew\n");
  });

  test("redo → undo を取り消す", () => {
    const { result } = renderHook(() => useMergeDiff());
    act(() => {
      result.current.setLeftText("line1\nold\n");
      result.current.setRightText("line1\nnew\n");
    });
    const blockId = result.current.diffResult!.blocks[0].id;
    act(() => result.current.mergeBlock(blockId, "left-to-right"));
    const mergedRight = result.current.rightText;

    act(() => result.current.undo());
    expect(result.current.canRedo).toBe(true);

    act(() => result.current.redo());
    expect(result.current.rightText).toBe(mergedRight);
  });

  test("undo 後に新しいマージ → redo スタッククリア", () => {
    const { result } = renderHook(() => useMergeDiff());
    act(() => {
      result.current.setLeftText("a\nb\n");
      result.current.setRightText("a\nc\n");
    });
    const blockId = result.current.diffResult!.blocks[0].id;

    // merge → undo → merge again
    act(() => result.current.mergeBlock(blockId, "left-to-right"));
    act(() => result.current.undo());
    expect(result.current.canRedo).toBe(true);

    // 再度テキストを変更してマージ
    const newBlockId = result.current.diffResult!.blocks[0].id;
    act(() => result.current.mergeBlock(newBlockId, "right-to-left"));
    expect(result.current.canRedo).toBe(false);
  });

  test("goToNextBlock / goToPrevBlock → インデックス制御", () => {
    const { result } = renderHook(() => useMergeDiff());
    act(() => {
      result.current.setLeftText("a\nb\nc\n");
      result.current.setRightText("A\nB\nC\n");
    });
    // 全行が異なるので少なくとも1ブロック
    expect(result.current.totalBlocks).toBeGreaterThanOrEqual(1);
    expect(result.current.currentBlockIndex).toBe(0);

    if (result.current.totalBlocks > 1) {
      act(() => result.current.goToNextBlock());
      expect(result.current.currentBlockIndex).toBe(1);

      act(() => result.current.goToPrevBlock());
      expect(result.current.currentBlockIndex).toBe(0);
    }

    // 先頭で goToPrev → 0 のまま
    act(() => result.current.goToPrevBlock());
    expect(result.current.currentBlockIndex).toBe(0);
  });
});
