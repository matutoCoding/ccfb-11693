// ---------- 花型列表页 ----------
import { Pattern, uid } from '../types';
import { loadPatterns, upsertPattern, deletePattern, exportPatternFile, importPatternFile, loadSettings, loadYarns } from '../store';
import { genPlain } from '../weave';
import { imageToGrid } from '../imageImport';
import { el, fmtDate, labeled, numberInput } from './common';

function thumb(p: Pattern): HTMLCanvasElement {
  const cv = el('canvas', { class: 'thumb' });
  cv.width = p.width; cv.height = p.height;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(p.width, p.height);
  for (let i = 0; i < p.grid.length; i++) {
    const v = p.grid[i] ? 230 : 40;
    img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v * 0.9; img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

export function renderPatternsPage(root: HTMLElement) {
  const list = loadPatterns();
  const yarns = loadYarns();

  const wrap = el('div', { class: 'page' });
  const bar = el('div', { class: 'toolbar' },
    el('h2', {}, '花型库'),
    el('button', { class: 'primary' }, '＋ 新建花型'),
    el('button', {}, '图片转组织'),
    el('button', {}, '导入 JSON'),
  );
  const [btnNew, btnImage, btnImport] = Array.from(bar.querySelectorAll('button'));
  const fileInput = el('input', { type: 'file', accept: '.json', style: 'display:none' });

  btnNew.addEventListener('click', () => {
    const s = loadSettings();
    const p: Pattern = {
      id: uid(), name: `新花型 ${new Date().toLocaleDateString()}`,
      width: s.defaultWidth, height: s.defaultHeight,
      grid: genPlain(s.defaultWidth, s.defaultHeight),
      warpYarnId: yarns[0]?.id ?? '', weftYarnId: yarns[1]?.id ?? yarns[0]?.id ?? '',
      createdAt: Date.now(), updatedAt: Date.now(),
    };
    upsertPattern(p);
    location.hash = `#/weave/${p.id}`;
  });
  btnImport.addEventListener('click', () => fileInput.click());

  // ----- 图片转组织 -----
  const imgFileInput = el('input', { type: 'file', accept: 'image/*', style: 'display:none' });
  const imgForm = el('div', { class: 'toolbar img-form', style: 'display:none' });
  let optW = 128, optH = 128, optColors = 4, optEnds = 8;
  imgForm.append(
    el('span', {}, '图片转组织:'),
    labeled('宽度', numberInput(optW, 8, 512, (v) => (optW = v | 0))),
    labeled('高度', numberInput(optH, 8, 512, (v) => (optH = v | 0))),
    labeled('颜色数上限', numberInput(optColors, 2, 8, (v) => (optColors = v | 0))),
    labeled('缎纹枚数', numberInput(optEnds, 5, 8, (v) => (optEnds = v >= 8 ? 8 : 5))),
  );
  const btnDoImage = el('button', { class: 'primary' }, '选择图片并转换');
  imgForm.append(btnDoImage);
  btnImage.addEventListener('click', () => {
    imgForm.style.display = imgForm.style.display === 'none' ? '' : 'none';
  });
  btnDoImage.addEventListener('click', () => imgFileInput.click());
  imgFileInput.addEventListener('change', async () => {
    const f = imgFileInput.files?.[0];
    if (!f) return;
    try {
      const { grid } = await imageToGrid(f, { width: optW, height: optH, maxColors: optColors, satinEnds: optEnds });
      const p: Pattern = {
        id: uid(), name: f.name.replace(/\.\w+$/, '') || '图片花型',
        width: optW, height: optH, grid,
        warpYarnId: yarns[0]?.id ?? '', weftYarnId: yarns[1]?.id ?? yarns[0]?.id ?? '',
        createdAt: Date.now(), updatedAt: Date.now(),
      };
      upsertPattern(p);
      location.hash = `#/weave/${p.id}`;
    } catch (e) {
      alert('转换失败: ' + (e as Error).message);
    }
  });

  fileInput.addEventListener('change', async () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    try {
      const p = await importPatternFile(f);
      upsertPattern(p);
      rerender();
    } catch (e) {
      alert('导入失败: ' + (e as Error).message);
    }
  });

  const grid = el('div', { class: 'card-grid' });
  for (const p of list) {
    const card = el('div', { class: 'card' },
      thumb(p),
      el('div', { class: 'card-body' },
        el('div', { class: 'card-title' }, p.name),
        el('div', { class: 'muted' }, `${p.width}×${p.height} · 更新 ${fmtDate(p.updatedAt)}`),
        el('div', { class: 'card-actions' }),
      ),
    );
    const actions = card.querySelector('.card-actions')!;
    const mk = (label: string, fn: () => void, cls = '') => {
      const b = el('button', { class: cls }, label);
      b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
      actions.append(b);
    };
    mk('组织设计', () => (location.hash = `#/weave/${p.id}`), 'primary');
    mk('织物预览', () => (location.hash = `#/preview/${p.id}`));
    mk('复制', () => {
      const c: Pattern = { ...p, id: uid(), name: p.name + ' 副本', grid: new Uint8Array(p.grid), createdAt: Date.now(), updatedAt: Date.now() };
      upsertPattern(c); rerender();
    });
    mk('改名', () => {
      const n = prompt('新名称', p.name);
      if (n) { p.name = n; upsertPattern(p); rerender(); }
    });
    mk('导出', () => exportPatternFile(p));
    mk('删除', () => {
      if (confirm(`删除「${p.name}」?`)) { deletePattern(p.id); rerender(); }
    }, 'danger');
    card.addEventListener('dblclick', () => (location.hash = `#/weave/${p.id}`));
    grid.append(card);
  }
  if (!list.length) grid.append(el('p', { class: 'muted' }, '还没有花型,点击「新建花型」开始。'));

  function rerender() { root.replaceChildren(); renderPatternsPage(root); }

  wrap.append(bar, imgForm, fileInput, imgFileInput, grid);
  root.append(wrap);
}
