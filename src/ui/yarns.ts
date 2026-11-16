// ---------- 纱线库页 ----------
import { uid } from '../types';
import { loadYarns, saveYarns } from '../store';
import { el } from './common';

export function renderYarnsPage(root: HTMLElement) {
  const yarns = loadYarns();
  const wrap = el('div', { class: 'page' });
  const bar = el('div', { class: 'toolbar' }, el('h2', {}, '纱线库'));
  const btnNew = el('button', { class: 'primary' }, '＋ 新建纱线');
  btnNew.onclick = () => {
    yarns.push({ id: uid(), name: '新纱线', color: '#cccccc', thickness: 0.8, twist: 500, gloss: 0.5 });
    saveYarns(yarns); rerender();
  };
  bar.append(btnNew);

  const tbl = el('table', { class: 'yarn-table' });
  tbl.append(el('tr', {},
    el('th', {}, '颜色'), el('th', {}, '名称'), el('th', {}, '粗细(直径)'),
    el('th', {}, '捻度(捻/米)'), el('th', {}, '光泽'), el('th', {}, '操作')));

  for (const y of yarns) {
    const color = el('input', { type: 'color', value: y.color });
    color.oninput = () => { y.color = color.value; saveYarns(yarns); };
    const name = el('input', { type: 'text', value: y.name });
    name.onchange = () => { y.name = name.value; saveYarns(yarns); };

    const mkRange = (val: number, min: number, max: number, step: number, fn: (v: number) => void) => {
      const r = el('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(val) });
      const out = el('span', { class: 'range-val' }, String(val));
      r.oninput = () => { out.textContent = r.value; fn(parseFloat(r.value)); saveYarns(yarns); };
      return el('div', { class: 'range-wrap' }, r, out);
    };

    const del = el('button', { class: 'danger' }, '删除');
    del.onclick = () => { if (confirm(`删除纱线「${y.name}」?`)) { saveYarns(loadYarns().filter((z) => z.id !== y.id)); rerender(); } };

    tbl.append(el('tr', {},
      el('td', {}, color), el('td', {}, name),
      el('td', {}, mkRange(y.thickness, 0.2, 1.0, 0.05, (v) => (y.thickness = v))),
      el('td', {}, mkRange(y.twist, 0, 2000, 50, (v) => (y.twist = v))),
      el('td', {}, mkRange(y.gloss, 0, 1, 0.05, (v) => (y.gloss = v))),
      el('td', {}, del),
    ));
  }

  wrap.append(bar, tbl,
    el('p', { class: 'muted' }, '粗细为相对格子间距的直径(1.0 = 纱线刚好相切);光泽影响渲染的各向异性高光强度;捻度影响表面丝缕纹理。经纬纱在花型的「组织设计」页分别指定。'));
  root.append(wrap);

  function rerender() { root.replaceChildren(); renderYarnsPage(root); }
}
