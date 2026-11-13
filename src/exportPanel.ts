import type { ExportFormat, ExportOptions } from "./api";
import { el, radio } from "./dom";

export interface ExportPanel {
  getOptions(): ExportOptions;
  setDisabled(disabled: boolean): void;
  /** 書き出し処理中の表示に切り替える */
  setBusy(busy: boolean): void;
}

const LABEL = "書き出し…";
const BUSY_LABEL = "書き出し中…";

/** 出力フォーマット・JPEG品質・書き出しボタンを `root` に構築する */
export function createExportPanel(root: HTMLElement, onExport: (options: ExportOptions) => void): ExportPanel {
  let disabled = true;
  let busy = false;

  const formats = el("div", { className: "dm-options" }, [
    radio("dm-format", "png", "PNG", true),
    radio("dm-format", "jpeg", "JPEG", false),
  ]);
  const quality = el("input", { type: "range", id: "dm-quality", min: "1", max: "100", step: "1", value: "90" });
  const qualityValue = el("output", {}, ["90"]);
  qualityValue.htmlFor.add("dm-quality");
  const button = el("button", { type: "button", className: "dm-export-button" }, [LABEL]);

  root.replaceChildren(
    el("fieldset", { className: "dm-export" }, [
      el("legend", {}, ["書き出し"]),
      formats,
      el("div", { className: "dm-slider" }, [el("label", { htmlFor: "dm-quality" }, ["JPEG品質"]), quality, qualityValue]),
      button,
    ]),
  );

  const format = (): ExportFormat =>
    formats.querySelector<HTMLInputElement>('input[name="dm-format"]:checked')!.value as ExportFormat;

  const getOptions = (): ExportOptions => ({ format: format(), quality: Number(quality.value) });

  const render = () => {
    formats.querySelectorAll("input").forEach((i) => (i.disabled = disabled));
    quality.disabled = disabled || format() !== "jpeg";
    button.disabled = disabled || busy;
    button.textContent = busy ? BUSY_LABEL : LABEL;
  };

  formats.addEventListener("change", render);
  quality.addEventListener("input", () => {
    qualityValue.textContent = quality.value;
  });
  button.addEventListener("click", () => onExport(getOptions()));

  render();

  return {
    getOptions,
    setDisabled(value) {
      disabled = value;
      render();
    },
    setBusy(value) {
      busy = value;
      render();
    },
  };
}
