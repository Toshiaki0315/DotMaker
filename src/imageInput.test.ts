import { describe, it, expect, vi, beforeEach } from "vitest";
import { copyPngToClipboard, imageFromDataTransfer, isImageFile, setupImageInput } from "./imageInput";

const file = (name: string, type: string) => new File([new Uint8Array([1, 2, 3])], name, { type });

/** jsdom には DataTransfer が無いため、必要な部分だけを持つ代用品を作る */
function dataTransfer(opts: { files?: File[]; items?: File[] } = {}): DataTransfer {
  const files = opts.files ?? [];
  const items = (opts.items ?? []).map((f) => ({ kind: "file", type: f.type, getAsFile: () => f }));
  return {
    files: Object.assign([...files], { item: (i: number) => files[i] ?? null }),
    items: [...items, { kind: "string", type: "text/plain", getAsFile: () => null }],
    dropEffect: "none",
  } as unknown as DataTransfer;
}

function dispatch(target: EventTarget, type: string, dt: DataTransfer | null) {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(ev, type === "paste" ? "clipboardData" : "dataTransfer", { value: dt });
  target.dispatchEvent(ev);
  return ev;
}

describe("isImageFile", () => {
  it("image/* の MIME タイプは画像", () => {
    expect(isImageFile(file("a.png", "image/png"))).toBe(true);
    expect(isImageFile(file("a.bmp", "image/bmp"))).toBe(true);
  });
  it("MIME タイプが空でも拡張子で判定する（HEIC など）", () => {
    expect(isImageFile(file("IMG_0001.HEIC", ""))).toBe(true);
    expect(isImageFile(file("a.heif", ""))).toBe(true);
    expect(isImageFile(file("a.tif", ""))).toBe(true);
    expect(isImageFile(file("a.JPG", ""))).toBe(true);
  });
  it("画像以外は false", () => {
    expect(isImageFile(file("a.txt", "text/plain"))).toBe(false);
    expect(isImageFile(file("noext", ""))).toBe(false);
    expect(isImageFile(file("a.pdf", "application/pdf"))).toBe(false);
  });
});

describe("imageFromDataTransfer", () => {
  it("files の中から最初の画像を返す", () => {
    const img = file("b.png", "image/png");
    expect(imageFromDataTransfer(dataTransfer({ files: [file("a.txt", "text/plain"), img] }))).toBe(img);
  });
  it("files が空なら items（クリップボードの画像）から取得する", () => {
    const img = file("image.png", "image/png");
    expect(imageFromDataTransfer(dataTransfer({ items: [img] }))).toBe(img);
  });
  it("画像が無ければ null", () => {
    expect(imageFromDataTransfer(dataTransfer({ files: [file("a.txt", "text/plain")] }))).toBeNull();
    expect(imageFromDataTransfer(dataTransfer())).toBeNull();
    expect(imageFromDataTransfer(null)).toBeNull();
  });
});

describe("setupImageInput", () => {
  let zone: HTMLElement;
  let onFile: ReturnType<typeof vi.fn<(f: File) => void>>;
  let onReject: ReturnType<typeof vi.fn<(m: string) => void>>;
  let dispose: () => void;

  beforeEach(() => {
    document.body.innerHTML = '<div id="zone"></div><input id="num" type="number" />';
    zone = document.querySelector("#zone")!;
    onFile = vi.fn();
    onReject = vi.fn();
    dispose = setupImageInput(zone, document, onFile, onReject);
  });

  it("ドラッグ中はドロップ可能表示になり、離れると戻る", () => {
    const over = dispatch(zone, "dragover", dataTransfer());
    expect(over.defaultPrevented).toBe(true);
    dispatch(zone, "dragenter", dataTransfer());
    expect(zone.classList.contains("dm-dragging")).toBe(true);
    dispatch(zone, "dragleave", dataTransfer());
    expect(zone.classList.contains("dm-dragging")).toBe(false);
  });

  it("dataTransfer が無い dragover でも落ちない", () => {
    expect(dispatch(zone, "dragover", null).defaultPrevented).toBe(true);
  });

  it("子要素への出入りでは表示が消えない", () => {
    dispatch(zone, "dragenter", dataTransfer());
    dispatch(zone, "dragenter", dataTransfer()); // 子要素に入る
    dispatch(zone, "dragleave", dataTransfer()); // 親から出る
    expect(zone.classList.contains("dm-dragging")).toBe(true);
    dispatch(zone, "dragleave", dataTransfer());
    expect(zone.classList.contains("dm-dragging")).toBe(false);
  });

  it("画像ファイルをドロップすると onFile を呼ぶ", () => {
    const img = file("photo.jpg", "image/jpeg");
    dispatch(zone, "dragenter", dataTransfer());
    const ev = dispatch(zone, "drop", dataTransfer({ files: [img] }));
    expect(ev.defaultPrevented).toBe(true);
    expect(onFile).toHaveBeenCalledWith(img);
    expect(zone.classList.contains("dm-dragging")).toBe(false);
  });

  it("画像以外をドロップすると onReject を呼ぶ", () => {
    dispatch(zone, "drop", dataTransfer({ files: [file("a.txt", "text/plain")] }));
    expect(onFile).not.toHaveBeenCalled();
    expect(onReject).toHaveBeenCalledWith("画像ファイルではありません");
  });

  it("画像をペーストすると onFile を呼び、既定動作を止める", () => {
    const img = file("image.png", "image/png");
    const ev = dispatch(document, "paste", dataTransfer({ items: [img] }));
    expect(onFile).toHaveBeenCalledWith(img);
    expect(ev.defaultPrevented).toBe(true);
  });

  it("画像以外のペースト（数値入力へのテキスト等）は邪魔しない", () => {
    const ev = dispatch(document.querySelector("#num")!, "paste", dataTransfer());
    expect(onFile).not.toHaveBeenCalled();
    expect(onReject).not.toHaveBeenCalled();
    expect(ev.defaultPrevented).toBe(false);
  });

  it("dispose 後は反応しない", () => {
    dispose();
    dispatch(zone, "drop", dataTransfer({ files: [file("a.png", "image/png")] }));
    dispatch(document, "paste", dataTransfer({ items: [file("b.png", "image/png")] }));
    expect(onFile).not.toHaveBeenCalled();
  });
});

describe("copyPngToClipboard", () => {
  it("PNG を image/png の ClipboardItem として書き込む", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    class FakeItem {
      constructor(public data: Record<string, Blob>) {}
    }
    await copyPngToClipboard(new Uint8Array([137, 80]), { write } as unknown as Clipboard, FakeItem as unknown as typeof ClipboardItem);
    const item = write.mock.calls[0][0][0] as FakeItem;
    expect(Object.keys(item.data)).toEqual(["image/png"]);
    expect(item.data["image/png"].type).toBe("image/png");
    expect(item.data["image/png"].size).toBe(2);
  });

  it("クリップボードが使えない環境ではエラー", async () => {
    await expect(copyPngToClipboard(new Uint8Array(), undefined, undefined)).rejects.toThrow(
      "この環境ではクリップボードに画像をコピーできません",
    );
  });
});
