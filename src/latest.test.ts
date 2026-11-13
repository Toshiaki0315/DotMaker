import { describe, it, expect } from "vitest";
import { latestOnly } from "./latest";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
}

describe("latestOnly", () => {
  it("単独の呼び出しは結果をそのまま返す", async () => {
    const run = latestOnly(async (x: number) => x * 2);
    await expect(run(21)).resolves.toEqual({ stale: false, value: 42 });
  });

  it("後から呼ばれた処理があれば、先の結果は stale になる", async () => {
    const d1 = deferred<string>();
    const d2 = deferred<string>();
    const queue = [d1, d2];
    const run = latestOnly(() => queue.shift()!.promise);
    const p1 = run();
    const p2 = run();
    d2.resolve("second");
    d1.resolve("first");
    await expect(p1).resolves.toEqual({ stale: true });
    await expect(p2).resolves.toEqual({ stale: false, value: "second" });
  });

  it("最新の呼び出しのエラーはそのまま投げる", async () => {
    const run = latestOnly(async () => {
      throw new Error("boom");
    });
    await expect(run()).rejects.toThrow("boom");
  });

  it("古い呼び出しのエラーは握りつぶして stale を返す", async () => {
    const d1 = deferred<string>();
    const d2 = deferred<string>();
    const queue = [d1, d2];
    const run = latestOnly(() => queue.shift()!.promise);
    const p1 = run();
    const p2 = run();
    d1.reject(new Error("old"));
    d2.resolve("ok");
    await expect(p1).resolves.toEqual({ stale: true });
    await expect(p2).resolves.toEqual({ stale: false, value: "ok" });
  });
});
