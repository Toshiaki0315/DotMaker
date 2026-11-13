/** Rust 側 `CropRect` と一致させること（元画像のピクセル座標） */
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Rust 側 `Size` と一致させること */
export interface Size {
  width: number;
  height: number;
}

/** Rust 側 `MAX_DIMENSION` と一致させること */
export const MAX_DIMENSION = 8192;

export type AspectRatio = readonly [number, number];

export interface AspectPreset {
  value: string;
  label: string;
  ratio: AspectRatio | null;
}

export const ASPECT_PRESETS: readonly AspectPreset[] = [
  { value: "free", label: "自由", ratio: null },
  ...(["1:1", "4:3", "3:4", "3:2", "2:3", "16:9", "9:16"] as const).map((v) => {
    const [w, h] = v.split(":").map(Number);
    return { value: v, label: v, ratio: [w, h] as const };
  }),
];

const toInt = (v: number, fallback: number) => (Number.isFinite(v) ? Math.round(v) : fallback);
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** 指定比率で、画像の中央から最大の範囲を切り抜く矩形。ratio が null なら全体。 */
export function aspectCrop(width: number, height: number, ratio: AspectRatio | null): CropRect {
  if (!ratio) return { x: 0, y: 0, width, height };
  const r = ratio[0] / ratio[1];
  let w: number;
  let h: number;
  if (width / height > r) {
    h = height;
    w = Math.max(1, Math.min(width, Math.round(height * r)));
  } else {
    w = width;
    h = Math.max(1, Math.min(height, Math.round(width / r)));
  }
  return { x: Math.floor((width - w) / 2), y: Math.floor((height - h) / 2), width: w, height: h };
}

/** 矩形を整数化し、画像 (imgW x imgH) の内側に収める */
export function clampCrop(rect: CropRect, imgW: number, imgH: number): CropRect {
  const x = clamp(toInt(rect.x, 0), 0, imgW - 1);
  const y = clamp(toInt(rect.y, 0), 0, imgH - 1);
  return {
    x,
    y,
    width: clamp(toInt(rect.width, 1), 1, imgW - x),
    height: clamp(toInt(rect.height, 1), 1, imgH - y),
  };
}

/** 出力サイズの一辺を 1〜MAX_DIMENSION の整数にする */
export function clampDimension(v: number): number {
  return clamp(toInt(v, 1), 1, MAX_DIMENSION);
}

/** 縦横比 `base` を保ったときの高さ */
export function linkedHeight(base: Size, width: number): number {
  return clampDimension((width * base.height) / base.width);
}

/** 縦横比 `base` を保ったときの幅 */
export function linkedWidth(base: Size, height: number): number {
  return clampDimension((height * base.width) / base.height);
}
