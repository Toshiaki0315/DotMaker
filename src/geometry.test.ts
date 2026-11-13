import { describe, it, expect } from "vitest";
import {
  ASPECT_PRESETS,
  MAX_DIMENSION,
  aspectCrop,
  clampCrop,
  clampDimension,
  linkedHeight,
  linkedWidth,
} from "./geometry";

describe("ASPECT_PRESETS", () => {
  it("自由と代表的な比率を持つ", () => {
    expect(ASPECT_PRESETS.map((p) => p.value)).toEqual(["free", "1:1", "4:3", "3:4", "3:2", "2:3", "16:9", "9:16"]);
    expect(ASPECT_PRESETS[0]).toEqual({ value: "free", label: "自由", ratio: null });
    expect(ASPECT_PRESETS.find((p) => p.value === "16:9")!.ratio).toEqual([16, 9]);
  });
});

describe("aspectCrop", () => {
  it("横長画像を 1:1 で中央から最大に切り抜く", () => {
    expect(aspectCrop(400, 300, [1, 1])).toEqual({ x: 50, y: 0, width: 300, height: 300 });
  });
  it("縦長画像を 16:9 で中央から最大に切り抜く", () => {
    expect(aspectCrop(900, 1600, [16, 9])).toEqual({ x: 0, y: 547, width: 900, height: 506 });
  });
  it("比率が同じなら全体", () => {
    expect(aspectCrop(800, 600, [4, 3])).toEqual({ x: 0, y: 0, width: 800, height: 600 });
  });
  it("極端に小さい画像でも 1px 以上", () => {
    expect(aspectCrop(1, 1, [16, 9])).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });
  it("ratio が null なら全体", () => {
    expect(aspectCrop(10, 20, null)).toEqual({ x: 0, y: 0, width: 10, height: 20 });
  });
});

describe("clampCrop", () => {
  it("範囲内ならそのまま（整数化のみ）", () => {
    expect(clampCrop({ x: 1.4, y: 2.6, width: 3, height: 4 }, 10, 10)).toEqual({ x: 1, y: 3, width: 3, height: 4 });
  });
  it("はみ出しは画像内に収める", () => {
    expect(clampCrop({ x: 8, y: -5, width: 10, height: 50 }, 10, 10)).toEqual({ x: 8, y: 0, width: 2, height: 10 });
  });
  it("幅・高さは最低 1、開始位置は最大で端の1px手前", () => {
    expect(clampCrop({ x: 99, y: 99, width: 0, height: -3 }, 10, 5)).toEqual({ x: 9, y: 4, width: 1, height: 1 });
  });
  it("NaN は 0 / 最小値として扱う", () => {
    expect(clampCrop({ x: NaN, y: NaN, width: NaN, height: NaN }, 10, 5)).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });
});

describe("clampDimension", () => {
  it("1〜MAX_DIMENSION の整数に丸める", () => {
    expect(MAX_DIMENSION).toBe(8192);
    expect(clampDimension(0)).toBe(1);
    expect(clampDimension(12.6)).toBe(13);
    expect(clampDimension(99999)).toBe(8192);
    expect(clampDimension(NaN)).toBe(1);
  });
});

describe("linkedHeight / linkedWidth", () => {
  it("元の縦横比を保って対辺を計算する", () => {
    expect(linkedHeight({ width: 400, height: 300 }, 200)).toBe(150);
    expect(linkedWidth({ width: 400, height: 300 }, 30)).toBe(40);
  });
  it("結果も 1〜MAX に収める", () => {
    expect(linkedHeight({ width: 1000, height: 1 }, 10)).toBe(1);
    expect(linkedWidth({ width: 1, height: 1 }, 10000)).toBe(8192);
  });
});
