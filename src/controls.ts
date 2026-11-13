import {
  COLOR_MODES,
  MAX_BLOCK_SIZE,
  MAX_CONTRAST,
  MIN_BLOCK_SIZE,
  validateBlockSize,
  validateContrast,
  type ColorMode,
  type ColorModeInfo,
} from "./api";
import { el, radio } from "./dom";

export type ModeKind = ColorModeInfo["kind"];

export interface ControlState {
  blockSize: number;
  colorMode: ColorMode;
  /** コントラスト (-100〜100、0 で変更なし) */
  contrast: number;
}

export interface Controls {
  getState(): ControlState;
  setDisabled(disabled: boolean): void;
}

const DEFAULT_STATE: ControlState = { blockSize: 8, colorMode: "color256", contrast: 0 };
const DEFAULT_MODE: Record<ModeKind, ColorMode> = { color: "color256", gray: "gray256" };
const KIND_LABEL: Record<ModeKind, string> = { color: "カラー", gray: "モノクロ" };
const LEVEL_LEGEND: Record<ModeKind, string> = { color: "色数", gray: "階調" };

export function modesForKind(kind: ModeKind): ColorModeInfo[] {
  return COLOR_MODES.filter((m) => m.kind === kind);
}

export function kindOf(mode: ColorMode): ModeKind {
  return COLOR_MODES.find((m) => m.value === mode)!.kind;
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
    contrast: validateContrast(initial.contrast ?? DEFAULT_STATE.contrast),
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

  // --- コントラスト ---
  const signed = (v: number) => (v > 0 ? `+${v}` : String(v));
  const contrast = el("input", {
    type: "range",
    id: "dm-contrast",
    min: String(-MAX_CONTRAST),
    max: String(MAX_CONTRAST),
    step: "1",
    value: String(state.contrast),
    title: "ダブルクリックで 0 に戻す",
  });
  const contrastValue = el("output", {}, [signed(state.contrast)]);
  contrastValue.htmlFor.add("dm-contrast");
  const commitContrast = () => {
    state.contrast = validateContrast(Number(contrast.value));
    contrastValue.textContent = signed(state.contrast);
    emit();
  };
  contrast.addEventListener("input", () => {
    contrastValue.textContent = signed(Number(contrast.value));
  });
  contrast.addEventListener("change", commitContrast);
  contrast.addEventListener("dblclick", () => {
    contrast.value = "0";
    commitContrast();
  });
  const contrastRow = el("div", { className: "dm-slider" }, [
    el("label", { htmlFor: "dm-contrast" }, ["コントラスト"]),
    contrast,
    contrastValue,
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

  root.replaceChildren(sliderRow, contrastRow, kindFieldset, levelFieldset);
  renderLevels();

  return {
    getState: () => ({ ...state }),
    setDisabled(value) {
      disabled = value;
      applyDisabled();
    },
  };
}
