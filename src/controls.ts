import {
  COLOR_MODES,
  MAX_BLOCK_SIZE,
  MIN_BLOCK_SIZE,
  validateBlockSize,
  type ColorMode,
  type ColorModeInfo,
} from "./api";

export type ModeKind = ColorModeInfo["kind"];

export interface ControlState {
  blockSize: number;
  colorMode: ColorMode;
}

export interface Controls {
  getState(): ControlState;
  setDisabled(disabled: boolean): void;
}

const DEFAULT_STATE: ControlState = { blockSize: 8, colorMode: "color256" };
const DEFAULT_MODE: Record<ModeKind, ColorMode> = { color: "color256", gray: "gray256" };
const KIND_LABEL: Record<ModeKind, string> = { color: "カラー", gray: "モノクロ" };
const LEVEL_LEGEND: Record<ModeKind, string> = { color: "色数", gray: "階調" };

export function modesForKind(kind: ModeKind): ColorModeInfo[] {
  return COLOR_MODES.filter((m) => m.kind === kind);
}

export function kindOf(mode: ColorMode): ModeKind {
  return COLOR_MODES.find((m) => m.value === mode)!.kind;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function radio(name: string, value: string, label: string, checked: boolean): HTMLLabelElement {
  const input = el("input", { type: "radio", name, value, checked });
  return el("label", { className: "dm-radio" }, [input, label]);
}

/**
 * ドットの粗さスライダーと、カラー/モノクロ・色数（階調）ラジオボタンを `root` に構築する。
 * 値が確定するたびに `onChange` に最新の状態を通知する。
 */
export function createControls(
  root: HTMLElement,
  onChange: (state: ControlState) => void,
  initial: Partial<ControlState> = {},
): Controls {
  const state: ControlState = {
    blockSize: validateBlockSize(initial.blockSize ?? DEFAULT_STATE.blockSize),
    colorMode: initial.colorMode ?? DEFAULT_STATE.colorMode,
  };
  const lastMode: Record<ModeKind, ColorMode> = { ...DEFAULT_MODE, [kindOf(state.colorMode)]: state.colorMode };
  let disabled = false;

  const emit = () => onChange({ ...state });

  // --- ドットの粗さ ---
  const slider = el("input", {
    type: "range",
    id: "dm-block-size",
    min: String(MIN_BLOCK_SIZE),
    max: String(MAX_BLOCK_SIZE),
    step: "1",
    value: String(state.blockSize),
  });
  const sliderValue = el("output", {}, [String(state.blockSize)]);
  sliderValue.htmlFor.add("dm-block-size");
  slider.addEventListener("input", () => {
    sliderValue.textContent = slider.value;
  });
  slider.addEventListener("change", () => {
    state.blockSize = validateBlockSize(Number(slider.value));
    emit();
  });
  const sliderRow = el("div", { className: "dm-slider" }, [
    el("label", { htmlFor: "dm-block-size" }, ["ドットの粗さ"]),
    slider,
    sliderValue,
  ]);

  // --- カラー / モノクロ ---
  const currentKind = kindOf(state.colorMode);
  const kindFieldset = el("fieldset", { className: "dm-kind" }, [
    el("legend", {}, ["モード"]),
    ...(["color", "gray"] as const).map((k) => radio("dm-kind", k, KIND_LABEL[k], k === currentKind)),
  ]);

  // --- 色数 / 階調 ---
  const levelLegend = el("legend");
  const levelOptions = el("div", { className: "dm-options" });
  const levelFieldset = el("fieldset", { className: "dm-levels" }, [levelLegend, levelOptions]);

  const renderLevels = () => {
    const kind = kindOf(state.colorMode);
    levelLegend.textContent = LEVEL_LEGEND[kind];
    levelOptions.replaceChildren(
      ...modesForKind(kind).map((m) => radio("dm-mode", m.value, m.label, m.value === state.colorMode)),
    );
    applyDisabled();
  };

  const applyDisabled = () => {
    root.querySelectorAll("input").forEach((i) => (i.disabled = disabled));
  };

  kindFieldset.addEventListener("change", (e) => {
    const kind = (e.target as HTMLInputElement).value as ModeKind;
    state.colorMode = lastMode[kind];
    renderLevels();
    emit();
  });
  levelOptions.addEventListener("change", (e) => {
    state.colorMode = (e.target as HTMLInputElement).value as ColorMode;
    lastMode[kindOf(state.colorMode)] = state.colorMode;
    emit();
  });

  root.replaceChildren(sliderRow, kindFieldset, levelFieldset);
  renderLevels();

  return {
    getState: () => ({ ...state }),
    setDisabled(value) {
      disabled = value;
      applyDisabled();
    },
  };
}
