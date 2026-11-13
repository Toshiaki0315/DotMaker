import { checkbox, el, numberField } from "./dom";
import {
  ASPECT_PRESETS,
  MAX_DIMENSION,
  aspectCrop,
  clampCrop,
  clampDimension,
  linkedHeight,
  linkedWidth,
  type CropRect,
  type Size,
} from "./geometry";

export interface EditState {
  crop: CropRect | null;
  resize: Size | null;
}

export interface EditPanel {
  /** 新しい画像のサイズを設定し、値をリセットする（通知しない） */
  setImageSize(size: Size): void;
  getState(): EditState;
  setDisabled(disabled: boolean): void;
}

/**
 * トリミング（画角プリセット・数値指定）とリサイズ（縦横比保持）の入力欄を `root` に構築する。
 */
export function createEditPanel(root: HTMLElement, onChange: (state: EditState) => void): EditPanel {
  let image: Size = { width: 1, height: 1 };
  let crop: CropRect = { x: 0, y: 0, width: 1, height: 1 };
  let size: Size = { width: 1, height: 1 };
  let disabled = true;

  // --- トリミング ---
  const cropToggle = checkbox("dm-crop-enabled", "トリミングする", false);
  const cropEnabled = cropToggle.querySelector("input")!;
  const aspect = el("select", { id: "dm-aspect" });
  ASPECT_PRESETS.forEach((p) => aspect.add(new Option(p.label, p.value)));
  const [xLabel, cropX] = numberField("dm-crop-x", "X");
  const [yLabel, cropY] = numberField("dm-crop-y", "Y");
  const [wLabel, cropW] = numberField("dm-crop-width", "幅");
  const [hLabel, cropH] = numberField("dm-crop-height", "高さ");
  const cropFieldset = el("fieldset", { className: "dm-crop" }, [
    el("legend", {}, ["トリミング"]),
    cropToggle,
    el("div", { className: "dm-grid" }, [
      el("label", { htmlFor: "dm-aspect" }, ["画角"]),
      aspect,
      xLabel, cropX, yLabel, cropY, wLabel, cropW, hLabel, cropH,
    ]),
  ]);

  // --- リサイズ ---
  const resizeToggle = checkbox("dm-resize-enabled", "リサイズする", false);
  const resizeEnabled = resizeToggle.querySelector("input")!;
  const [rwLabel, resizeW] = numberField("dm-resize-width", "幅");
  const [rhLabel, resizeH] = numberField("dm-resize-height", "高さ");
  const keepToggle = checkbox("dm-keep-aspect", "縦横比を保持", true);
  const keepAspect = keepToggle.querySelector("input")!;
  for (const i of [resizeW, resizeH]) {
    i.min = "1";
    i.max = String(MAX_DIMENSION);
  }
  const resizeFieldset = el("fieldset", { className: "dm-resize" }, [
    el("legend", {}, ["リサイズ"]),
    resizeToggle,
    el("div", { className: "dm-grid" }, [rwLabel, resizeW, rhLabel, resizeH]),
    keepToggle,
  ]);

  root.replaceChildren(cropFieldset, resizeFieldset);

  // --- 状態 → DOM ---
  const ratio = () => ASPECT_PRESETS.find((p) => p.value === aspect.value)!.ratio;
  const base = (): Size => (cropEnabled.checked ? { width: crop.width, height: crop.height } : image);

  const render = () => {
    cropX.value = String(crop.x);
    cropY.value = String(crop.y);
    cropW.value = String(crop.width);
    cropH.value = String(crop.height);
    resizeW.value = String(size.width);
    resizeH.value = String(size.height);
    const all = [cropEnabled, aspect, cropX, cropY, cropW, cropH, resizeEnabled, resizeW, resizeH, keepAspect];
    all.forEach((i) => (i.disabled = disabled));
    if (!disabled) {
      [aspect, cropX, cropY, cropW, cropH].forEach((i) => (i.disabled = !cropEnabled.checked));
      [resizeW, resizeH, keepAspect].forEach((i) => (i.disabled = !resizeEnabled.checked));
    }
  };

  /** トリミング範囲の変更に合わせて出力サイズを追従させる */
  const syncSize = () => {
    if (!resizeEnabled.checked) {
      size = { ...base() };
    } else if (keepAspect.checked) {
      size = { width: size.width, height: linkedHeight(base(), size.width) };
    }
  };

  const getState = (): EditState => ({
    crop: cropEnabled.checked ? { ...crop } : null,
    resize: resizeEnabled.checked ? { ...size } : null,
  });

  const commit = () => {
    render();
    onChange(getState());
  };

  // --- イベント ---
  cropEnabled.addEventListener("change", () => {
    syncSize();
    commit();
  });
  aspect.addEventListener("change", () => {
    crop = aspectCrop(image.width, image.height, ratio());
    syncSize();
    commit();
  });
  const onCropInput = (field: keyof CropRect) => () => {
    const next = { ...crop, [field]: Number({ x: cropX, y: cropY, width: cropW, height: cropH }[field].value) };
    const r = ratio();
    if (r && field === "width") next.height = Math.round((next.width * r[1]) / r[0]);
    if (r && field === "height") next.width = Math.round((next.height * r[0]) / r[1]);
    crop = clampCrop(next, image.width, image.height);
    syncSize();
    commit();
  };
  cropX.addEventListener("change", onCropInput("x"));
  cropY.addEventListener("change", onCropInput("y"));
  cropW.addEventListener("change", onCropInput("width"));
  cropH.addEventListener("change", onCropInput("height"));

  resizeEnabled.addEventListener("change", () => {
    syncSize();
    commit();
  });
  resizeW.addEventListener("change", () => {
    const width = clampDimension(Number(resizeW.value));
    size = { width, height: keepAspect.checked ? linkedHeight(base(), width) : size.height };
    commit();
  });
  resizeH.addEventListener("change", () => {
    const height = clampDimension(Number(resizeH.value));
    size = { width: keepAspect.checked ? linkedWidth(base(), height) : size.width, height };
    commit();
  });
  keepAspect.addEventListener("change", () => {
    syncSize();
    commit();
  });

  render();

  return {
    setImageSize(s) {
      image = { ...s };
      aspect.value = "free";
      crop = { x: 0, y: 0, width: s.width, height: s.height };
      size = { ...s };
      cropX.max = String(s.width - 1);
      cropY.max = String(s.height - 1);
      cropW.max = String(s.width);
      cropH.max = String(s.height);
      cropX.min = cropY.min = "0";
      cropW.min = cropH.min = "1";
      render();
    },
    getState,
    setDisabled(value) {
      disabled = value;
      render();
    },
  };
}
