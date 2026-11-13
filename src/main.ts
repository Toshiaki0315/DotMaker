import { processImage } from "./api";
import { createControls, type ControlState } from "./controls";
import { latestOnly } from "./latest";

// DOM への配線のみ（ロジックは api.ts / controls.ts / latest.ts でテスト済み）
const fileInput = document.querySelector<HTMLInputElement>("#file-input")!;
const fileName = document.querySelector<HTMLElement>("#file-name")!;
const status = document.querySelector<HTMLElement>("#status")!;
const original = document.querySelector<HTMLImageElement>("#original")!;
const result = document.querySelector<HTMLImageElement>("#result")!;

let source: Uint8Array | null = null;
const convert = latestOnly(processImage);

function showImage(img: HTMLImageElement, blob: Blob) {
  if (img.src) URL.revokeObjectURL(img.src);
  img.src = URL.createObjectURL(blob);
}

async function render(state: ControlState) {
  if (!source) return;
  status.textContent = "変換中…";
  try {
    const r = await convert(source, state);
    if (r.stale) return;
    showImage(result, new Blob([r.value as BlobPart], { type: "image/png" }));
    status.textContent = "";
  } catch (e) {
    status.textContent = (e as Error).message;
  }
}

const controls = createControls(document.querySelector<HTMLElement>("#controls")!, render);
controls.setDisabled(true);

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  fileName.textContent = file.name;
  source = new Uint8Array(await file.arrayBuffer());
  showImage(original, file);
  controls.setDisabled(false);
  await render(controls.getState());
});
