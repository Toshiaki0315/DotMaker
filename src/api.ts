import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import type { CropRect, Size } from "./geometry";

/** Rust 側 `ColorMode` と一致させること */
export type ColorMode =
  | "color16" | "color256" | "color4096" | "color65536"
  | "gray2" | "gray8" | "gray16" | "gray256";

export interface ProcessOptions {
  /** ドットの粗さ（ブロック一辺のピクセル数） */
  blockSize: number;
  colorMode: ColorMode;
  /** 切り抜き範囲（元画像座標）。null/省略で切り抜かない */
  crop?: CropRect | null;
  /** 出力サイズ。null/省略でリサイズしない */
  resize?: Size | null;
}

/** Rust 側 `ExportFormat` と一致させること */
export type ExportFormat = "png" | "jpeg";

export interface ExportOptions {
  format: ExportFormat;
  /** JPEG 品質 (1〜100) */
  quality: number;
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

/** ファイル選択で受け付ける形式（仕様 2.4 の入力フォーマット） */
export const ACCEPTED_FILE_TYPES = [
  "image/jpeg", "image/png", "image/gif", "image/tiff", "image/bmp",
  "image/heic", "image/heif", ".heic", ".heif",
].join(",");

export const MIN_BLOCK_SIZE = 1;
export const MAX_BLOCK_SIZE = 64;

const EXTENSIONS: Record<ExportFormat, string[]> = { png: ["png"], jpeg: ["jpg", "jpeg"] };

/** ブロックサイズを 1〜64 の整数に正規化する */
export function validateBlockSize(value: number): number {
  if (Number.isNaN(value)) return MIN_BLOCK_SIZE;
  return Math.min(MAX_BLOCK_SIZE, Math.max(MIN_BLOCK_SIZE, Math.round(value)));
}

function toRustOptions(options: ProcessOptions) {
  return {
    blockSize: validateBlockSize(options.blockSize),
    colorMode: options.colorMode,
    crop: options.crop ?? null,
    resize: options.resize ?? null,
  };
}

async function call<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    throw new Error(String(e));
  }
}

/** 画像をトリミング・リサイズ・ドット化・減色し、PNG バイト列を返す */
export async function processImage(data: Uint8Array, options: ProcessOptions): Promise<Uint8Array> {
  const result = await call<number[]>("process_image", { data: Array.from(data), options: toRustOptions(options) });
  return new Uint8Array(result);
}

/** 元画像を（向きを反映して）表示用 PNG に変換する。HEIC も表示できる */
export async function previewOriginal(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await call<number[]>("preview_original", { data: Array.from(data) }));
}

/** 画像の幅・高さを取得する */
export function imageInfo(data: Uint8Array): Promise<Size> {
  return call<Size>("image_info", { data: Array.from(data) });
}

/** 画像を処理してファイルに書き出し、実際の保存先パスを返す */
export function exportImage(
  data: Uint8Array,
  options: ProcessOptions,
  exportOptions: ExportOptions,
  path: string,
): Promise<string> {
  const quality = Math.min(100, Math.max(1, Math.round(exportOptions.quality)));
  return call<string>("export_image", {
    data: Array.from(data),
    options: toRustOptions(options),
    export: { format: exportOptions.format, quality },
    path,
  });
}

/** 保存ファイル名の候補（例: photo.jpg → photo_dot.png） */
export function suggestFileName(sourceName: string | null, format: ExportFormat): string {
  const base = (sourceName ?? "dotmaker").replace(/\.[^.]+$/, "");
  return `${base}_dot.${EXTENSIONS[format][0]}`;
}

/** 保存ダイアログを開く。キャンセル時は null */
export function chooseSavePath(format: ExportFormat, defaultPath: string): Promise<string | null> {
  return save({
    defaultPath,
    filters: [{ name: format === "png" ? "PNG" : "JPEG", extensions: EXTENSIONS[format] }],
  });
}
