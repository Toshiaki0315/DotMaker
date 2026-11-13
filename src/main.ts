import { chooseSavePath, exportImage, imageInfo, processImage, suggestFileName, type ProcessOptions } from "./api";
import { createControls } from "./controls";
import { createEditPanel } from "./editPanel";
import { createExportPanel } from "./exportPanel";
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

let source: Uint8Array | null = null;
let sourceName: string | null = null;
const convert = latestOnly(processImage);

const controls = createControls($("#controls"), () => render());
const edit = createEditPanel($("#edit"), () => render());
const exporter = createExportPanel($("#export"), (opts) => void runExport(opts));

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

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  const data = new Uint8Array(await file.arrayBuffer());
  try {
    const info = await imageInfo(data);
    source = data;
    sourceName = file.name;
    fileName.textContent = file.name;
    originalSize.textContent = `${info.width} × ${info.height}`;
    showImage(original, file);
    edit.setImageSize(info);
    setEnabled(true);
    await render();
  } catch (e) {
    status.textContent = (e as Error).message;
  }
});
