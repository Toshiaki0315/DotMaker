import { COLOR_MODES, ColorMode, processImage } from "./api";

// DOM への配線のみ（ロジックは api.ts でテスト済み）
const fileInput = document.querySelector<HTMLInputElement>("#file-input")!;
const blockSize = document.querySelector<HTMLInputElement>("#block-size")!;
const blockSizeValue = document.querySelector<HTMLElement>("#block-size-value")!;
const colorMode = document.querySelector<HTMLSelectElement>("#color-mode")!;
const status = document.querySelector<HTMLElement>("#status")!;
const original = document.querySelector<HTMLImageElement>("#original")!;
const result = document.querySelector<HTMLImageElement>("#result")!;

for (const m of COLOR_MODES) {
  colorMode.add(new Option(`${m.kind === "color" ? "カラー" : "モノクロ"} ${m.label}`, m.value));
}
colorMode.value = "color256";

let source: Uint8Array | null = null;

async function render() {
  if (!source) return;
  status.textContent = "変換中…";
  try {
    const png = await processImage(source, {
      blockSize: Number(blockSize.value),
      colorMode: colorMode.value as ColorMode,
    });
    URL.revokeObjectURL(result.src);
    result.src = URL.createObjectURL(new Blob([png as BlobPart], { type: "image/png" }));
    status.textContent = "";
  } catch (e) {
    status.textContent = (e as Error).message;
  }
}

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  source = new Uint8Array(await file.arrayBuffer());
  URL.revokeObjectURL(original.src);
  original.src = URL.createObjectURL(file);
  await render();
});
blockSize.addEventListener("input", () => {
  blockSizeValue.textContent = blockSize.value;
});
blockSize.addEventListener("change", render);
colorMode.addEventListener("change", render);
