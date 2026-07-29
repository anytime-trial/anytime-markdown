import { act, renderHook } from "@testing-library/react";

import { useTickets } from "../useTickets";
import type { TicketsGateway } from "../ticketsGateway";

function makeGateway(overrides: Partial<TicketsGateway> = {}): TicketsGateway {
  return {
    list: jest.fn().mockResolvedValue({ tickets: [], invalid: [] }),
    save: jest.fn().mockResolvedValue({ version: "v2", updated_at: "2026-07-29T00:00:00Z" }),
    create: jest.fn(),
    remove: jest.fn().mockResolvedValue(undefined),
    archive: jest.fn().mockResolvedValue({ newPath: ".tickets/archive/T-1.md" }),
    ...overrides,
  };
}

describe("useTickets（gateway 受け取り）", () => {
  it("マウント時に gateway.list を includeArchive を渡して 1 回だけ呼ぶ", async () => {
    const gateway = makeGateway();

    await act(async () => {
      renderHook(() => useTickets(gateway, false));
    });

    expect(gateway.list).toHaveBeenCalledTimes(1);
    expect(gateway.list).toHaveBeenCalledWith(false);
  });

  it("同一 gateway で再レンダーしても再取得しない（非メモ化の無限ループ検知）", async () => {
    const gateway = makeGateway();
    let rerender!: (props: { gateway: TicketsGateway; includeArchive: boolean }) => void;

    await act(async () => {
      const result = renderHook(
        (props: { gateway: TicketsGateway; includeArchive: boolean }) =>
          useTickets(props.gateway, props.includeArchive),
        { initialProps: { gateway, includeArchive: false } },
      );
      rerender = result.rerender;
    });

    expect(gateway.list).toHaveBeenCalledTimes(1);

    await act(async () => {
      rerender({ gateway, includeArchive: false });
    });
    await act(async () => {
      rerender({ gateway, includeArchive: false });
    });

    expect(gateway.list).toHaveBeenCalledTimes(1);
  });

  it("gateway を差し替えると再取得する（旧 gateway 1 回・新 gateway 1 回）", async () => {
    const gatewayA = makeGateway();
    const gatewayB = makeGateway();
    let rerender!: (props: { gateway: TicketsGateway; includeArchive: boolean }) => void;

    await act(async () => {
      const result = renderHook(
        (props: { gateway: TicketsGateway; includeArchive: boolean }) =>
          useTickets(props.gateway, props.includeArchive),
        { initialProps: { gateway: gatewayA, includeArchive: false } },
      );
      rerender = result.rerender;
    });

    expect(gatewayA.list).toHaveBeenCalledTimes(1);

    await act(async () => {
      rerender({ gateway: gatewayB, includeArchive: false });
    });

    expect(gatewayA.list).toHaveBeenCalledTimes(1);
    expect(gatewayB.list).toHaveBeenCalledTimes(1);
  });

  it("includeArchive の変更でも再取得する（2 回目の呼び出し引数が true）", async () => {
    const gateway = makeGateway();
    let rerender!: (props: { gateway: TicketsGateway; includeArchive: boolean }) => void;

    await act(async () => {
      const result = renderHook(
        (props: { gateway: TicketsGateway; includeArchive: boolean }) =>
          useTickets(props.gateway, props.includeArchive),
        { initialProps: { gateway, includeArchive: false } },
      );
      rerender = result.rerender;
    });

    expect(gateway.list).toHaveBeenCalledTimes(1);

    await act(async () => {
      rerender({ gateway, includeArchive: true });
    });

    expect(gateway.list).toHaveBeenCalledTimes(2);
    expect(gateway.list).toHaveBeenNthCalledWith(2, true);
  });

  it("gateway が null なら取得せず data も null のまま", async () => {
    const { result } = renderHook(() => useTickets(null, false));

    expect(result.current.data).toBeNull();

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.data).toBeNull();
  });
});
