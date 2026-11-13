/** 画像として受け付ける拡張子（MIME タイプが空の場合の判定用。HEIC は空になりやすい） */
const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "tif", "tiff", "bmp", "heic", "heif"];

/** ファイルが画像か（MIME タイプ、または拡張子で判定） */
export function isImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "";
  return IMAGE_EXTENSIONS.includes(ext);
}

/** ドロップ・ペーストされたデータから最初の画像ファイルを取り出す */
export function imageFromDataTransfer(dt: DataTransfer | null): File | null {
  if (!dt) return null;
  const fromFiles = Array.from(dt.files).find(isImageFile);
  if (fromFiles) return fromFiles;
  for (const item of Array.from(dt.items)) {
    const f = item.kind === "file" ? item.getAsFile() : null;
    if (f && isImageFile(f)) return f;
  }
  return null;
}

/**
 * `zone` への画像ファイルの Drag & Drop と、`doc` 全体での画像ペーストを受け付ける。
 * ドラッグ中は `zone` に `dm-dragging` クラスを付ける。登録を解除する関数を返す。
 */
export function setupImageInput(
  zone: HTMLElement,
  doc: Document,
  onFile: (file: File) => void,
  onReject: (message: string) => void,
): () => void {
  let depth = 0;
  const setDragging = (on: boolean) => zone.classList.toggle("dm-dragging", on);

  const onDragEnter = (e: DragEvent) => {
    e.preventDefault();
    depth++;
    setDragging(true);
  };
  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  };
  const onDragLeave = () => {
    depth = Math.max(0, depth - 1);
    if (depth === 0) setDragging(false);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    depth = 0;
    setDragging(false);
    const file = imageFromDataTransfer(e.dataTransfer);
    if (file) onFile(file);
    else onReject("画像ファイルではありません");
  };
  const onPaste = (e: ClipboardEvent) => {
    const file = imageFromDataTransfer(e.clipboardData);
    if (!file) return; // テキストのペーストなどは既定動作に任せる
    e.preventDefault();
    onFile(file);
  };

  zone.addEventListener("dragenter", onDragEnter);
  zone.addEventListener("dragover", onDragOver);
  zone.addEventListener("dragleave", onDragLeave);
  zone.addEventListener("drop", onDrop);
  doc.addEventListener("paste", onPaste);

  return () => {
    zone.removeEventListener("dragenter", onDragEnter);
    zone.removeEventListener("dragover", onDragOver);
    zone.removeEventListener("dragleave", onDragLeave);
    zone.removeEventListener("drop", onDrop);
    doc.removeEventListener("paste", onPaste);
  };
}

/** PNG バイト列をクリップボードに画像としてコピーする */
export async function copyPngToClipboard(
  png: Uint8Array,
  clipboard: Clipboard | undefined = globalThis.navigator?.clipboard,
  Item: typeof ClipboardItem | undefined = globalThis.ClipboardItem,
): Promise<void> {
  if (!clipboard?.write || !Item) {
    throw new Error("この環境ではクリップボードに画像をコピーできません");
  }
  const blob = new Blob([png as BlobPart], { type: "image/png" });
  await clipboard.write([new Item({ "image/png": blob })]);
}
