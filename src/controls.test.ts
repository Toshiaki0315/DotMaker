import { describe, it, expect, vi, beforeEach } from "vitest";
import { createControls, kindOf, modesForKind, type ControlState } from "./controls";

function setup(initial?: Partial<ControlState>) {
  const root = document.createElement("div");
  document.body.replaceChildren(root);
  const onChange = vi.fn<(s: ControlState) => void>();
  const controls = createControls(root, onChange, initial);
  const slider = root.querySelector<HTMLInputElement>("#dm-block-size")!;
  const sliderValue = root.querySelector<HTMLOutputElement>("output")!;
  const contrast = root.querySelector<HTMLInputElement>("#dm-contrast")!;
  const contrastValue = root.querySelector<HTMLOutputElement>('output[for="dm-contrast"]')!;
  const kindRadio = (v: string) =>
    root.querySelector<HTMLInputElement>(`input[name="dm-kind"][value="${v}"]`)!;
  const modeRadios = () =>
    Array.from(root.querySelectorAll<HTMLInputElement>('input[name="dm-mode"]'));
  const modeRadio = (v: string) =>
    root.querySelector<HTMLInputElement>(`input[name="dm-mode"][value="${v}"]`)!;
  return { root, onChange, controls, slider, sliderValue, contrast, contrastValue, kindRadio, modeRadios, modeRadio };
}

function choose(radio: HTMLInputElement) {
  radio.checked = true;
  radio.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("modesForKind / kindOf", () => {
  it("カラーは4種、モノクロは4種", () => {
    expect(modesForKind("color").map((m) => m.value)).toEqual([
      "color16", "color256", "color4096", "color65536",
    ]);
    expect(modesForKind("gray").map((m) => m.value)).toEqual([
      "gray2", "gray8", "gray16", "gray256",
    ]);
  });
  it("モードから種別を判定する", () => {
    expect(kindOf("color4096")).toBe("color");
    expect(kindOf("gray8")).toBe("gray");
  });
});

describe("createControls: 初期表示", () => {
  beforeEach(() => document.body.replaceChildren());

  it("既定値はブロック8・カラー256色", () => {
    const { controls, slider, sliderValue, kindRadio, modeRadio } = setup();
    expect(controls.getState()).toEqual({ blockSize: 8, colorMode: "color256", contrast: 0 });
    expect(slider.value).toBe("8");
    expect(slider.min).toBe("1");
    expect(slider.max).toBe("64");
    expect(sliderValue.textContent).toBe("8");
    expect(kindRadio("color").checked).toBe(true);
    expect(modeRadio("color256").checked).toBe(true);
  });

  it("初期値を指定できる（モノクロなら階調ラジオが表示される）", () => {
    const { controls, kindRadio, modeRadios, modeRadio } = setup({ blockSize: 3, colorMode: "gray16", contrast: 0 });
    expect(controls.getState()).toEqual({ blockSize: 3, colorMode: "gray16", contrast: 0 });
    expect(kindRadio("gray").checked).toBe(true);
    expect(modeRadios().map((r) => r.value)).toEqual(["gray2", "gray8", "gray16", "gray256"]);
    expect(modeRadio("gray16").checked).toBe(true);
  });

  it("初期ブロックサイズは 1〜64 に正規化される", () => {
    expect(setup({ blockSize: 500 }).controls.getState().blockSize).toBe(64);
  });

  it("ラベルが付いている（アクセシビリティ）", () => {
    const { root, slider } = setup();
    expect(slider.labels?.[0]?.textContent).toContain("ドットの粗さ");
    const legends = Array.from(root.querySelectorAll("legend")).map((l) => l.textContent);
    expect(legends).toEqual(["モード", "色数"]);
    expect(root.querySelector('label:has(input[value="color16"])')?.textContent).toBe("16色");
  });
});

describe("createControls: 操作", () => {
  beforeEach(() => document.body.replaceChildren());

  it("スライダー操作中は表示値だけ更新し、確定時に通知する", () => {
    const { onChange, slider, sliderValue, controls } = setup();
    slider.value = "20";
    slider.dispatchEvent(new Event("input"));
    expect(sliderValue.textContent).toBe("20");
    expect(onChange).not.toHaveBeenCalled();
    slider.dispatchEvent(new Event("change"));
    expect(onChange).toHaveBeenCalledWith({ blockSize: 20, colorMode: "color256", contrast: 0 });
    expect(controls.getState().blockSize).toBe(20);
  });

  it("色数ラジオを選ぶと通知する", () => {
    const { onChange, modeRadio } = setup();
    choose(modeRadio("color4096"));
    expect(onChange).toHaveBeenLastCalledWith({ blockSize: 8, colorMode: "color4096", contrast: 0 });
  });

  it("モノクロに切り替えると階調ラジオに入れ替わり、既定の階調で通知する", () => {
    const { onChange, kindRadio, modeRadios, modeRadio } = setup();
    choose(kindRadio("gray"));
    expect(modeRadios().map((r) => r.value)).toEqual(["gray2", "gray8", "gray16", "gray256"]);
    expect(modeRadio("gray256").checked).toBe(true);
    expect(onChange).toHaveBeenLastCalledWith({ blockSize: 8, colorMode: "gray256", contrast: 0 });
  });

  it("種別ごとに最後に選んだモードを覚えている", () => {
    const { controls, kindRadio, modeRadio } = setup();
    choose(modeRadio("color16"));
    choose(kindRadio("gray"));
    choose(modeRadio("gray2"));
    choose(kindRadio("color"));
    expect(controls.getState().colorMode).toBe("color16");
    expect(modeRadio("color16").checked).toBe(true);
    choose(kindRadio("gray"));
    expect(controls.getState().colorMode).toBe("gray2");
  });

  it("legend の見出しは種別に応じて変わる", () => {
    const { root, kindRadio } = setup();
    choose(kindRadio("gray"));
    expect(root.querySelectorAll("legend")[1].textContent).toBe("階調");
  });
});

describe("createControls: コントラスト", () => {
  beforeEach(() => document.body.replaceChildren());

  it("既定は 0 で、範囲は -100〜100", () => {
    const { contrast, contrastValue } = setup();
    expect([contrast.min, contrast.max, contrast.value]).toEqual(["-100", "100", "0"]);
    expect(contrastValue.textContent).toBe("0");
    expect(contrast.labels?.[0]?.textContent).toBe("コントラスト");
  });

  it("初期値を指定でき、範囲外は丸める", () => {
    expect(setup({ contrast: 30 }).controls.getState().contrast).toBe(30);
    expect(setup({ contrast: -999 }).controls.getState().contrast).toBe(-100);
  });

  it("操作中は表示値（符号付き）を更新し、確定時に通知する", () => {
    const { onChange, contrast, contrastValue } = setup();
    contrast.value = "25";
    contrast.dispatchEvent(new Event("input"));
    expect(contrastValue.textContent).toBe("+25");
    expect(onChange).not.toHaveBeenCalled();
    contrast.dispatchEvent(new Event("change"));
    expect(onChange).toHaveBeenCalledWith({ blockSize: 8, colorMode: "color256", contrast: 25 });
    contrast.value = "-40";
    contrast.dispatchEvent(new Event("input"));
    expect(contrastValue.textContent).toBe("-40");
  });

  it("ダブルクリックで 0 に戻して通知する", () => {
    const { onChange, contrast, contrastValue } = setup({ contrast: 50 });
    contrast.dispatchEvent(new Event("dblclick"));
    expect(contrast.value).toBe("0");
    expect(contrastValue.textContent).toBe("0");
    expect(onChange).toHaveBeenLastCalledWith({ blockSize: 8, colorMode: "color256", contrast: 0 });
  });
});

describe("createControls: 有効/無効", () => {
  it("setDisabled で全入力を無効化・有効化できる", () => {
    const { root, controls, kindRadio } = setup();
    controls.setDisabled(true);
    const inputs = () => Array.from(root.querySelectorAll("input"));
    expect(inputs().every((i) => i.disabled)).toBe(true);
    // 無効中に種別を切り替えても、新しいラジオも無効のまま
    choose(kindRadio("gray"));
    expect(inputs().every((i) => i.disabled)).toBe(true);
    controls.setDisabled(false);
    expect(inputs().every((i) => !i.disabled)).toBe(true);
  });
});
