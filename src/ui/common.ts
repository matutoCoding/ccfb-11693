// ---------- UI 小工具 ----------
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, attrs: Record<string, string> = {}, ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else e.setAttribute(k, v);
  }
  for (const c of children) e.append(c);
  return e;
}

export function fmtDate(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function labeled(label: string, control: HTMLElement): HTMLElement {
  return el('label', { class: 'field' }, el('span', {}, label), control);
}

export function numberInput(value: number, min: number, max: number, onChange: (v: number) => void): HTMLInputElement {
  const i = el('input', { type: 'number', value: String(value), min: String(min), max: String(max) });
  i.addEventListener('change', () => {
    let v = parseFloat(i.value);
    if (isNaN(v)) v = value;
    v = Math.min(max, Math.max(min, v));
    i.value = String(v);
    onChange(v);
  });
  return i;
}
