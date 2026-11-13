import { describe, it, expect, vi, beforeEach } from "vitest";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => invokeMock(...args) }));

import { COLOR_MODES, processImage, validateBlockSize } from "./api";

describe("COLOR_MODES", () => {
  it("仕様のカラー4種・モノクロ4種を含む", () => {
    expect(COLOR_MODES.map((m) => m.value)).toEqual([
      "color16", "color256", "color4096", "color65536",
      "gray2", "gray8", "gray16", "gray256",
    ]);
    expect(COLOR_MODES.filter((m) => m.kind === "color")).toHaveLength(4);
    expect(COLOR_MODES.filter((m) => m.kind === "gray")).toHaveLength(4);
  });
});

describe("validateBlockSize", () => {
  it("1〜64 の整数はそのまま返す", () => {
    expect(validateBlockSize(1)).toBe(1);
    expect(validateBlockSize(64)).toBe(64);
  });
  it("範囲外は丸める", () => {
    expect(validateBlockSize(0)).toBe(1);
    expect(validateBlockSize(-5)).toBe(1);
    expect(validateBlockSize(1000)).toBe(64);
  });
  it("小数は四捨五入、NaN は 1", () => {
    expect(validateBlockSize(7.6)).toBe(8);
    expect(validateBlockSize(Number.NaN)).toBe(1);
  });
});

describe("processImage", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("process_image コマンドをバイト配列と camelCase オプションで呼ぶ", async () => {
    invokeMock.mockResolvedValue([137, 80, 78, 71]);
    const result = await processImage(new Uint8Array([1, 2, 3]), { blockSize: 8, colorMode: "gray2" });
    expect(invokeMock).toHaveBeenCalledWith("process_image", {
      data: [1, 2, 3],
      options: { blockSize: 8, colorMode: "gray2" },
    });
    expect(result).toBeInstanceOf(Uint8Array);
    expect(Array.from(result)).toEqual([137, 80, 78, 71]);
  });

  it("blockSize は検証済みの値で送る", async () => {
    invokeMock.mockResolvedValue([]);
    await processImage(new Uint8Array(), { blockSize: 999, colorMode: "color16" });
    expect(invokeMock.mock.calls[0][1].options.blockSize).toBe(64);
  });

  it("Rust 側のエラーは Error として投げ直す", async () => {
    invokeMock.mockRejectedValue("画像の読み込みに失敗しました: x");
    await expect(processImage(new Uint8Array(), { blockSize: 2, colorMode: "gray2" }))
      .rejects.toThrow("画像の読み込みに失敗しました: x");
  });
});
