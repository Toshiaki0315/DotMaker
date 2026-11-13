import { describe, it, expect, vi } from "vitest";
import { createEditPanel, type EditState } from "./editPanel";

function setup(size = { width: 400, height: 300 }) {
  const root = document.createElement("div");
  document.body.replaceChildren(root);
  const onChange = vi.fn<(s: EditState) => void>();
  const panel = createEditPanel(root, onChange);
  panel.setImageSize(size);
  panel.setDisabled(false);
  const q = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  return {
    root,
    panel,
    onChange,
    cropEnabled: q<HTMLInputElement>("#dm-crop-enabled"),
    aspect: q<HTMLSelectElement>("#dm-aspect"),
    cropX: q<HTMLInputElement>("#dm-crop-x"),
    cropY: q<HTMLInputElement>("#dm-crop-y"),
    cropW: q<HTMLInputElement>("#dm-crop-width"),
    cropH: q<HTMLInputElement>("#dm-crop-height"),
    resizeEnabled: q<HTMLInputElement>("#dm-resize-enabled"),
    resizeW: q<HTMLInputElement>("#dm-resize-width"),
    resizeH: q<HTMLInputElement>("#dm-resize-height"),
    keepAspect: q<HTMLInputElement>("#dm-keep-aspect"),
  };
}

function setValue(input: HTMLInputElement | HTMLSelectElement, value: string) {
  input.value = value;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function toggle(input: HTMLInputElement, checked: boolean) {
  input.checked = checked;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

const values = (...inputs: HTMLInputElement[]) => inputs.map((i) => Number(i.value));

describe("createEditPanel: 初期状態", () => {
  it("トリミング・リサイズとも無効で、値は画像全体・元サイズ", () => {
    const t = setup();
    expect(t.panel.getState()).toEqual({ crop: null, resize: null });
    expect(t.cropEnabled.checked).toBe(false);
    expect(t.resizeEnabled.checked).toBe(false);
    expect(t.keepAspect.checked).toBe(true);
    expect(t.aspect.value).toBe("free");
    expect(values(t.cropX, t.cropY, t.cropW, t.cropH)).toEqual([0, 0, 400, 300]);
    expect(values(t.resizeW, t.resizeH)).toEqual([400, 300]);
  });

  it("チェックが外れている項目の入力欄は無効", () => {
    const t = setup();
    expect([t.aspect, t.cropX, t.cropW].every((i) => i.disabled)).toBe(true);
    expect([t.resizeW, t.resizeH, t.keepAspect].every((i) => i.disabled)).toBe(true);
    expect(t.cropEnabled.disabled).toBe(false);
  });

  it("ラベルと見出しが付いている", () => {
    const t = setup();
    expect(Array.from(t.root.querySelectorAll("legend")).map((l) => l.textContent)).toEqual(["トリミング", "リサイズ"]);
    expect(t.cropW.labels?.[0]?.textContent).toBe("幅");
    expect(t.aspect.labels?.[0]?.textContent).toBe("画角");
    expect(Array.from(t.aspect.options).map((o) => o.textContent)).toContain("16:9");
  });

  it("数値入力の範囲が画像サイズに合わせて設定される", () => {
    const t = setup();
    expect([t.cropX.min, t.cropX.max, t.cropW.min, t.cropW.max]).toEqual(["0", "399", "1", "400"]);
    expect([t.resizeW.min, t.resizeW.max]).toEqual(["1", "8192"]);
  });
});

describe("createEditPanel: トリミング", () => {
  it("有効にすると画像全体の範囲で通知する", () => {
    const t = setup();
    toggle(t.cropEnabled, true);
    expect(t.onChange).toHaveBeenLastCalledWith({ crop: { x: 0, y: 0, width: 400, height: 300 }, resize: null });
    expect(t.cropX.disabled).toBe(false);
  });

  it("画角プリセットで中央から切り抜く", () => {
    const t = setup();
    toggle(t.cropEnabled, true);
    setValue(t.aspect, "1:1");
    expect(values(t.cropX, t.cropY, t.cropW, t.cropH)).toEqual([50, 0, 300, 300]);
    expect(t.onChange).toHaveBeenLastCalledWith({ crop: { x: 50, y: 0, width: 300, height: 300 }, resize: null });
    setValue(t.aspect, "free");
    expect(values(t.cropX, t.cropY, t.cropW, t.cropH)).toEqual([0, 0, 400, 300]);
  });

  it("数値入力ははみ出さないよう補正される", () => {
    const t = setup();
    toggle(t.cropEnabled, true);
    setValue(t.cropX, "350");
    expect(values(t.cropX, t.cropW)).toEqual([350, 50]);
    setValue(t.cropH, "9999");
    expect(Number(t.cropH.value)).toBe(300);
    expect(t.panel.getState().crop).toEqual({ x: 350, y: 0, width: 50, height: 300 });
  });

  it("画角固定中に幅を変えると高さが連動する（逆も同様）", () => {
    const t = setup();
    toggle(t.cropEnabled, true);
    setValue(t.aspect, "4:3");
    setValue(t.cropW, "200");
    expect(values(t.cropW, t.cropH)).toEqual([200, 150]);
    setValue(t.cropH, "90");
    expect(values(t.cropW, t.cropH)).toEqual([120, 90]);
    expect(t.aspect.value).toBe("4:3");
  });

  it("無効に戻すと crop は null", () => {
    const t = setup();
    toggle(t.cropEnabled, true);
    toggle(t.cropEnabled, false);
    expect(t.onChange).toHaveBeenLastCalledWith({ crop: null, resize: null });
  });
});

describe("createEditPanel: リサイズ", () => {
  it("有効にすると現在のサイズで通知する", () => {
    const t = setup();
    toggle(t.resizeEnabled, true);
    expect(t.onChange).toHaveBeenLastCalledWith({ crop: null, resize: { width: 400, height: 300 } });
  });

  it("縦横比を保持して幅/高さが連動する", () => {
    const t = setup();
    toggle(t.resizeEnabled, true);
    setValue(t.resizeW, "200");
    expect(values(t.resizeW, t.resizeH)).toEqual([200, 150]);
    setValue(t.resizeH, "60");
    expect(values(t.resizeW, t.resizeH)).toEqual([80, 60]);
  });

  it("縦横比の保持を外すと独立して変更でき、戻すと幅基準で再計算する", () => {
    const t = setup();
    toggle(t.resizeEnabled, true);
    toggle(t.keepAspect, false);
    setValue(t.resizeW, "100");
    expect(values(t.resizeW, t.resizeH)).toEqual([100, 300]);
    toggle(t.keepAspect, true);
    expect(values(t.resizeW, t.resizeH)).toEqual([100, 75]);
    expect(t.onChange).toHaveBeenLastCalledWith({ crop: null, resize: { width: 100, height: 75 } });
  });

  it("サイズは 1〜8192 に収める", () => {
    const t = setup();
    toggle(t.resizeEnabled, true);
    toggle(t.keepAspect, false);
    setValue(t.resizeW, "0");
    setValue(t.resizeH, "100000");
    expect(values(t.resizeW, t.resizeH)).toEqual([1, 8192]);
  });

  it("リサイズ無効中はトリミング範囲のサイズに追従する", () => {
    const t = setup();
    toggle(t.cropEnabled, true);
    setValue(t.aspect, "1:1");
    expect(values(t.resizeW, t.resizeH)).toEqual([300, 300]);
    toggle(t.cropEnabled, false);
    expect(values(t.resizeW, t.resizeH)).toEqual([400, 300]);
  });

  it("リサイズ有効・縦横比保持中にトリミングを変えると、幅を保って高さを再計算する", () => {
    const t = setup();
    toggle(t.resizeEnabled, true);
    setValue(t.resizeW, "200");
    toggle(t.cropEnabled, true);
    setValue(t.aspect, "16:9");
    expect(values(t.resizeW, t.resizeH)).toEqual([200, 113]);
    expect(t.panel.getState()).toEqual({
      crop: { x: 0, y: 37, width: 400, height: 225 },
      resize: { width: 200, height: 113 },
    });
  });
});

describe("createEditPanel: 画像の切り替え・無効化", () => {
  it("setImageSize で値がリセットされる（チェック状態は維持）", () => {
    const t = setup();
    toggle(t.cropEnabled, true);
    setValue(t.aspect, "1:1");
    t.panel.setImageSize({ width: 100, height: 50 });
    expect(t.aspect.value).toBe("free");
    expect(values(t.cropX, t.cropY, t.cropW, t.cropH)).toEqual([0, 0, 100, 50]);
    expect(values(t.resizeW, t.resizeH)).toEqual([100, 50]);
    expect(t.panel.getState().crop).toEqual({ x: 0, y: 0, width: 100, height: 50 });
  });

  it("setDisabled(true) で全入力が無効、false で状態に応じて戻る", () => {
    const t = setup();
    t.panel.setDisabled(true);
    expect(Array.from(t.root.querySelectorAll("input, select")).every((i) => (i as HTMLInputElement).disabled)).toBe(true);
    t.panel.setDisabled(false);
    expect(t.cropEnabled.disabled).toBe(false);
    expect(t.cropX.disabled).toBe(true);
  });
});
