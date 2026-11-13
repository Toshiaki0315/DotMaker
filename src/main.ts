import {
  ACCEPTED_FILE_TYPES,
  chooseSavePath,
  exportImage,
  imageInfo,
  previewOriginal,
  processImage,
  suggestFileName,
  type ProcessOptions,
} from "./api";
import { createControls } from "./controls";
import { createEditPanel } from "./editPanel";
import { createExportPanel } from "./exportPanel";
import { copyPngToClipboard, setupImageInput } from "./imageInput";
import { latestOnly } from "./latest";

// DOM への配線のみ（ロジックは各モジュールでテスト済み）
const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const fileInput = $<HTMLInputElement>("#file-input");
const fileName = $("#file-name");
const status = $("#status");
const original = $<HTMLImageElement>("#original");
const result = $<HTMLImageElement>("#result");
const originalSize = $("#original-size");
const resultSize = $("#result-size");

fileInput.accept = ACCEPTED_FILE_TYPES;

let source: Uint8Array | null = null;
let lastResult: Uint8Array | null = null;
let sourceName: string | null = null;
const convert = latestOnly(processImage);

const controls = createControls($("#controls"), () => render());
const edit = createEditPanel($("#edit"), () => render());
const exporter = createExportPanel(
  $("#export"),
  (opts) => void runExport(opts),
  () => void copyResult(),
);

function setEnabled(enabled: boolean) {
  controls.setDisabled(!enabled);
  edit.setDisabled(!enabled);
  exporter.setDisabled(!enabled);
}
setEnabled(false);

const currentOptions = (): ProcessOptions => ({ ...controls.getState(), ...edit.getState() });

function showImage(img: HTMLImageElement, blob: Blob) {
  if (img.src) URL.revokeObjectURL(img.src);
  img.src = URL.createObjectURL(blob);
}

async function render() {
  if (!source) return;
  status.textContent = "変換中…";
  try {
    const r = await convert(source, currentOptions());
    if (r.stale) return;
    lastResult = r.value;
    showImage(result, new Blob([r.value as BlobPart], { type: "image/png" }));
    status.textContent = "";
  } catch (e) {
    status.textContent = (e as Error).message;
  }
}

result.addEventListener("load", () => {
  resultSize.textContent = `${result.naturalWidth} × ${result.naturalHeight}`;
});

async function runExport(opts: Parameters<typeof exportImage>[2]) {
  if (!source) return;
  const path = await chooseSavePath(opts.format, suggestFileName(sourceName, opts.format));
  if (!path) return;
  exporter.setBusy(true);
  status.textContent = "書き出し中…";
  try {
    const saved = await exportImage(source, currentOptions(), opts, path);
    status.textContent = `保存しました: ${saved}`;
  } catch (e) {
    status.textContent = (e as Error).message;
  } finally {
    exporter.setBusy(false);
  }
}

async function copyResult() {
  if (!lastResult) return;
  try {
    await copyPngToClipboard(lastResult);
    status.textContent = "変換後の画像をクリップボードにコピーしました";
  } catch (e) {
    status.textContent = (e as Error).message;
  }
}

async function loadFile(file: File) {
  const data = new Uint8Array(await file.arrayBuffer());
  try {
    const [info, preview] = await Promise.all([imageInfo(data), previewOriginal(data)]);
    source = data;
    sourceName = file.name;
    fileName.textContent = file.name;
    originalSize.textContent = `${info.width} × ${info.height}`;
    showImage(original, new Blob([preview as BlobPart], { type: "image/png" }));
    edit.setImageSize(info);
    setEnabled(true);
    await render();
  } catch (e) {
    status.textContent = (e as Error).message;
  }
}

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) void loadFile(file);
  fileInput.value = ""; // 同じファイルを再選択しても change が発火するように
});

setupImageInput(
  $(".app"),
  document,
  (file) => void loadFile(file),
  (message) => {
    status.textContent = message;
  },
);
