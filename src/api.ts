import { invoke } from "@tauri-apps/api/core";

/** Rust 側 `ColorMode` と一致させること */
export type ColorMode =
  | "color16" | "color256" | "color4096" | "color65536"
  | "gray2" | "gray8" | "gray16" | "gray256";

export interface ProcessOptions {
  /** ドットの粗さ（ブロック一辺のピクセル数） */
  blockSize: number;
  colorMode: ColorMode;
}

export interface ColorModeInfo {
  value: ColorMode;
  label: string;
  kind: "color" | "gray";
}

export const COLOR_MODES: readonly ColorModeInfo[] = [
  { value: "color16", label: "16色", kind: "color" },
  { value: "color256", label: "256色", kind: "color" },
  { value: "color4096", label: "4096色", kind: "color" },
  { value: "color65536", label: "65536色", kind: "color" },
  { value: "gray2", label: "2階調", kind: "gray" },
  { value: "gray8", label: "8階調", kind: "gray" },
  { value: "gray16", label: "16階調", kind: "gray" },
  { value: "gray256", label: "256階調", kind: "gray" },
];

export const MIN_BLOCK_SIZE = 1;
export const MAX_BLOCK_SIZE = 64;

/** ブロックサイズを 1〜64 の整数に正規化する */
export function validateBlockSize(value: number): number {
  if (Number.isNaN(value)) return MIN_BLOCK_SIZE;
  return Math.min(MAX_BLOCK_SIZE, Math.max(MIN_BLOCK_SIZE, Math.round(value)));
}

/** 画像をドット化・減色し、PNG バイト列を返す */
export async function processImage(data: Uint8Array, options: ProcessOptions): Promise<Uint8Array> {
  try {
    const result = await invoke<number[]>("process_image", {
      data: Array.from(data),
      options: { blockSize: validateBlockSize(options.blockSize), colorMode: options.colorMode },
    });
    return new Uint8Array(result);
  } catch (e) {
    throw new Error(String(e));
  }
}
