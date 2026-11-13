import { describe, it, expect, vi, beforeEach } from "vitest";

const invokeMock = vi.fn();
const saveMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => invokeMock(...args) }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: (...args: unknown[]) => saveMock(...args) }));

import {
  COLOR_MODES,
  chooseSavePath,
  exportImage,
  imageInfo,
  processImage,
  suggestFileName,
  validateBlockSize,
} from "./api";

beforeEach(() => {
  invokeMock.mockReset();
  saveMock.mockReset();
});

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
  it("process_image コマンドをバイト配列と camelCase オプションで呼ぶ", async () => {
    invokeMock.mockResolvedValue([137, 80, 78, 71]);
    const result = await processImage(new Uint8Array([1, 2, 3]), { blockSize: 8, colorMode: "gray2" });
    expect(invokeMock).toHaveBeenCalledWith("process_image", {
      data: [1, 2, 3],
      options: { blockSize: 8, colorMode: "gray2", crop: null, resize: null },
    });
    expect(result).toBeInstanceOf(Uint8Array);
    expect(Array.from(result)).toEqual([137, 80, 78, 71]);
  });

  it("切り抜き・リサイズ指定を渡す", async () => {
    invokeMock.mockResolvedValue([]);
    const crop = { x: 1, y: 2, width: 3, height: 4 };
    const resize = { width: 5, height: 6 };
    await processImage(new Uint8Array(), { blockSize: 2, colorMode: "color16", crop, resize });
    expect(invokeMock.mock.calls[0][1].options).toEqual({ blockSize: 2, colorMode: "color16", crop, resize });
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

describe("imageInfo", () => {
  it("image_info コマンドで幅・高さを取得する", async () => {
    invokeMock.mockResolvedValue({ width: 640, height: 480 });
    await expect(imageInfo(new Uint8Array([9]))).resolves.toEqual({ width: 640, height: 480 });
    expect(invokeMock).toHaveBeenCalledWith("image_info", { data: [9] });
  });
  it("エラーは Error として投げ直す", async () => {
    invokeMock.mockRejectedValue("bad");
    await expect(imageInfo(new Uint8Array())).rejects.toThrow("bad");
  });
});

describe("exportImage", () => {
  it("export_image コマンドを呼び、保存先パスを返す", async () => {
    invokeMock.mockResolvedValue("/tmp/out.jpg");
    const path = await exportImage(
      new Uint8Array([1]),
      { blockSize: 4, colorMode: "color256" },
      { format: "jpeg", quality: 80 },
      "/tmp/out",
    );
    expect(path).toBe("/tmp/out.jpg");
    expect(invokeMock).toHaveBeenCalledWith("export_image", {
      data: [1],
      options: { blockSize: 4, colorMode: "color256", crop: null, resize: null },
      export: { format: "jpeg", quality: 80 },
      path: "/tmp/out",
    });
  });
  it("品質は 1〜100 の整数に丸める", async () => {
    invokeMock.mockResolvedValue("x");
    await exportImage(new Uint8Array(), { blockSize: 1, colorMode: "gray2" }, { format: "jpeg", quality: 150.2 }, "x");
    expect(invokeMock.mock.calls[0][1].export.quality).toBe(100);
    await exportImage(new Uint8Array(), { blockSize: 1, colorMode: "gray2" }, { format: "jpeg", quality: -1 }, "x");
    expect(invokeMock.mock.calls[1][1].export.quality).toBe(1);
  });
  it("エラーは Error として投げ直す", async () => {
    invokeMock.mockRejectedValue("保存に失敗しました");
    await expect(
      exportImage(new Uint8Array(), { blockSize: 1, colorMode: "gray2" }, { format: "png", quality: 90 }, "x"),
    ).rejects.toThrow("保存に失敗しました");
  });
});

describe("suggestFileName", () => {
  it("元ファイル名の拡張子を差し替え、_dot を付ける", () => {
    expect(suggestFileName("photo.HEIC", "png")).toBe("photo_dot.png");
    expect(suggestFileName("my.cat.jpeg", "jpeg")).toBe("my.cat_dot.jpg");
    expect(suggestFileName("noext", "png")).toBe("noext_dot.png");
  });
  it("元ファイル名が無ければ dotmaker", () => {
    expect(suggestFileName(null, "png")).toBe("dotmaker_dot.png");
  });
});

describe("chooseSavePath", () => {
  it("フォーマットに合ったフィルタで保存ダイアログを開く", async () => {
    saveMock.mockResolvedValue("/Users/me/a.png");
    await expect(chooseSavePath("png", "a.png")).resolves.toBe("/Users/me/a.png");
    expect(saveMock).toHaveBeenCalledWith({
      defaultPath: "a.png",
      filters: [{ name: "PNG", extensions: ["png"] }],
    });
  });
  it("JPEG フィルタ", async () => {
    saveMock.mockResolvedValue(null);
    await expect(chooseSavePath("jpeg", "a.jpg")).resolves.toBeNull();
    expect(saveMock.mock.calls[0][0].filters).toEqual([{ name: "JPEG", extensions: ["jpg", "jpeg"] }]);
  });
});
