/** 要素を作成し、プロパティと子要素を設定する */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

/** ラベル付きラジオボタン */
export function radio(name: string, value: string, label: string, checked: boolean): HTMLLabelElement {
  const input = el("input", { type: "radio", name, value, checked });
  return el("label", { className: "dm-radio" }, [input, label]);
}

/** ラベル付きチェックボックス */
export function checkbox(id: string, label: string, checked: boolean): HTMLLabelElement {
  const input = el("input", { type: "checkbox", id, checked });
  return el("label", { className: "dm-check" }, [input, label]);
}

/** ラベル付き数値入力（ラベルと入力を返す） */
export function numberField(id: string, label: string): [HTMLLabelElement, HTMLInputElement] {
  const input = el("input", { type: "number", id, step: "1" });
  return [el("label", { htmlFor: id }, [label]), input];
}
