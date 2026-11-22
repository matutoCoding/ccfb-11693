// 花型列表页:增删改复制 / 导入导出
import { store } from '../../core/store';
import { createPattern } from '../../core/weave';
import { buildBundle, parseBundle } from '../../core/storage';
import { h, clear, toast, modal, confirmDialog, patternThumbnail, exportPatternPNG } from '../dom';
import { navigate } from '../router';
import { download } from '../../core/util';
import type { WeavePattern } from '../../core/types';

export function renderPatternsPage(container: HTMLElement): void {
  clear(container);
  const head = h('div', { class: 'page-head' },
    h('div', {},
      h('h2', {}, '花型库'),
      h('div', { class: 'sub' }, `共 ${store.patterns.length} 个花型,数据保存在浏览器本地存储`),
    ),
    h('div', { class: 'toolbar' },
      h('button', { class: 'primary', onclick: () => createDialog() }, '+ 新建花型'),
      h('button', { onclick: () => exportAll() }, '导出全部'),
      h('button', { onclick: () => importFile() }, '导入'),
    ),
  );
  container.append(head);

  if (store.patterns.length === 0) {
    container.append(h('div', { class: 'empty' }, '还没有花型,点击右上角"新建花型"开始'));
    return;
  }

  const grid = h('div', { class: 'grid-cards' });
  for (const p of store.patterns) {
    grid.append(patternCard(p));
  }
  container.append(grid);
}

function patternCard(p: WeavePattern): HTMLElement {
  const card = h('div', { class: 'card pattern-card' + (p.id === store.activePatternId ? ' active' : '') });
  card.append(patternThumbnail(p.cells, p.width, p.height));
  card.append(
    h('h3', {}, p.name),
    h('div', { class: 'meta' },
      `${p.width}×${p.height} 经${p.width}根 / 纬${p.height}根 · 更新于 ${new Date(p.updatedAt).toLocaleDateString()}`,
    ),
  );
  const actions = h('div', { class: 'actions' },
    h('button', {
      onclick: (e: Event) => {
        e.stopPropagation();
        store.setActive(p.id);
        navigate('editor');
      },
    }, '编辑'),
    h('button', {
      onclick: (e: Event) => {
        e.stopPropagation();
        store.duplicatePattern(p.id);
        toast('已复制');
      },
    }, '复制'),
    h('button', {
      onclick: (e: Event) => {
        e.stopPropagation();
        download(`${p.name}-组织图.png`, exportPatternPNG(p.cells, p.width, p.height, p.name));
      },
    }, '导出图'),
    h('button', {
      class: 'danger',
      onclick: async (e: Event) => {
        e.stopPropagation();
        if (await confirmDialog(`确认删除花型「${p.name}」?此操作不可撤销。`)) {
          store.deletePattern(p.id);
          toast('已删除');
        }
      },
    }, '删除'),
  );
  card.append(actions);
  card.addEventListener('click', () => store.setActive(p.id));
  return card;
}

function createDialog(): void {
  const nameInput = h('input', { value: '新花型 ' + (store.patterns.length + 1) }) as HTMLInputElement;
  const wInput = h('input', { type: 'number', value: '16', min: '2', max: '512' }) as HTMLInputElement;
  const hInput = h('input', { type: 'number', value: '16', min: '2', max: '512' }) as HTMLInputElement;
  const warpSel = yarnSelect(store.yarns[0]?.id);
  const weftSel = yarnSelect(store.yarns[1]?.id ?? store.yarns[0]?.id);
  const content = h('div', {},
    row('名称', nameInput),
    row('宽(经纱)', wInput),
    row('高(纬纱)', hInput),
    row('经纱', warpSel),
    row('纬纱', weftSel),
    h('p', { class: 'muted' }, '新建后可在组织设计页用平纹/斜纹/缎纹一键生成'),
  );
  const actions = h('div', { class: 'modal-actions' });
  const cancel = h('button', {}, '取消');
  const ok = h('button', { class: 'primary' }, '创建');
  actions.append(cancel, ok);
  content.append(actions);
  const m = modal('新建花型', content);
  cancel.onclick = () => m.close();
  ok.onclick = () => {
    const w = clampDim(wInput.value);
    const hh = clampDim(hInput.value);
    if (!w || !hh) return toast('尺寸需在 2~512 之间');
    const p = createPattern(w, hh, nameInput.value || '未命名', warpSel.value, weftSel.value);
    store.addPattern(p);
    m.close();
    toast('已创建,进入组织设计');
    navigate('editor');
  };
}

function clampDim(v: string): number {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 2 && n <= 512 ? n : 0;
}

function row(label: string, input: HTMLElement): HTMLElement {
  return h('div', { class: 'form-row' }, h('label', {}, label), input);
}

function yarnSelect(selected?: string): HTMLSelectElement {
  const sel = h('select') as HTMLSelectElement;
  for (const y of store.yarns) {
    const opt = h('option', { value: y.id }, y.name);
    sel.append(opt);
  }
  if (selected) sel.value = selected;
  return sel;
}

function exportAll(): void {
  if (store.patterns.length === 0) return toast('没有可导出的花型');
  const bundle = buildBundle(store.patterns, store.yarns);
  download(
    `jacquard-bundle-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify(bundle, null, 2),
    'application/json',
  );
  toast(`已导出 ${bundle.patterns.length} 个花型`);
}

function importFile(): void {
  const input = h('input', { type: 'file', accept: '.json,application/json' }) as HTMLInputElement;
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const { patterns, yarns } = parseBundle(String(reader.result));
        const n = store.importPatterns(patterns, yarns);
        toast(`成功导入 ${n} 个花型`);
      } catch (err) {
        toast('导入失败:' + (err as Error).message, 3500);
      }
    };
    reader.readAsText(file);
  });
  input.click();
}
