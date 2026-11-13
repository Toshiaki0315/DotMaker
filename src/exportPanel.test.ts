import { describe, it, expect, vi } from "vitest";
import { createExportPanel } from "./exportPanel";
import type { ExportOptions } from "./api";

function setup() {
  const root = document.createElement("div");
  document.body.replaceChildren(root);
  const onExport = vi.fn<(o: ExportOptions) => void>();
  const panel = createExportPanel(root, onExport);
  const q = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  return {
    root,
    panel,
    onExport,
    png: q<HTMLInputElement>('input[name="dm-format"][value="png"]'),
    jpeg: q<HTMLInputElement>('input[name="dm-format"][value="jpeg"]'),
    quality: q<HTMLInputElement>("#dm-quality"),
    qualityValue: q<HTMLOutputElement>("output"),
    button: q<HTMLButtonElement>("button"),
  };
}

function choose(radio: HTMLInputElement) {
  radio.checked = true;
  radio.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("createExportPanel", () => {
  it("既定は PNG・品質90 で、初期状態は無効", () => {
    const t = setup();
    expect(t.panel.getOptions()).toEqual({ format: "png", quality: 90 });
    expect(t.png.checked).toBe(true);
    expect(t.qualityValue.textContent).toBe("90");
    expect(t.button.disabled).toBe(true);
    expect(t.root.querySelector("legend")?.textContent).toBe("書き出し");
    expect(t.quality.labels?.[0]?.textContent).toBe("JPEG品質");
  });

  it("有効化しても PNG 選択中は品質スライダーは無効", () => {
    const t = setup();
    t.panel.setDisabled(false);
    expect(t.button.disabled).toBe(false);
    expect(t.png.disabled).toBe(false);
    expect(t.quality.disabled).toBe(true);
  });

  it("JPEG を選ぶと品質スライダーが有効になり、品質を変更できる", () => {
    const t = setup();
    t.panel.setDisabled(false);
    choose(t.jpeg);
    expect(t.quality.disabled).toBe(false);
    t.quality.value = "55";
    t.quality.dispatchEvent(new Event("input"));
    expect(t.qualityValue.textContent).toBe("55");
    expect(t.panel.getOptions()).toEqual({ format: "jpeg", quality: 55 });
    choose(t.png);
    expect(t.quality.disabled).toBe(true);
  });

  it("書き出しボタンで現在のオプションを通知する", () => {
    const t = setup();
    t.panel.setDisabled(false);
    choose(t.jpeg);
    t.button.click();
    expect(t.onExport).toHaveBeenCalledWith({ format: "jpeg", quality: 90 });
  });

  it("無効化すると全入力とボタンが無効", () => {
    const t = setup();
    t.panel.setDisabled(false);
    choose(t.jpeg);
    t.panel.setDisabled(true);
    expect([t.png, t.jpeg, t.quality, t.button].every((e) => e.disabled)).toBe(true);
  });

  it("setBusy 中はボタンが無効になり表示が変わる", () => {
    const t = setup();
    t.panel.setDisabled(false);
    t.panel.setBusy(true);
    expect(t.button.disabled).toBe(true);
    expect(t.button.textContent).toBe("書き出し中…");
    t.panel.setBusy(false);
    expect(t.button.disabled).toBe(false);
    expect(t.button.textContent).toBe("書き出し…");
  });
});
