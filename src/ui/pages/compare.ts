// 对比页:两个花型并排渲染,共享同一套渲染参数与光源,差异只来自组织本身
import { store } from '../../core/store';
import { h, clear } from '../dom';
import { FabricView } from '../FabricView';
import { analyzeAll } from '../../core/float';

let views: FabricView[] = [];

export function renderComparePage(container: HTMLElement): void {
  clear(container);
  for (const v of views) v.dispose();
  views = [];

  if (store.patterns.length < 2) {
    container.append(h('div', { class: 'empty' }, '至少需要 2 个花型才能对比,请先在花型库创建'));
    return;
  }

  container.append(
    h('div', { class: 'page-head' },
      h('div', {},
        h('h2', {}, '组织对比'),
        h('div', { class: 'sub' }, '两侧共享光源、循环数与渲染参数,可直接对比光泽、纹理与浮长差异'),
      ),
    ),
  );

  const layout = h('div', { class: 'compare-layout' });
  const idA = store.activePatternId ?? store.patterns[0].id;
  const idB = store.patterns.find((p) => p.id !== idA)?.id ?? store.patterns[1]?.id;
  layout.append(compareSlot(0, idA), compareSlot(1, idB));
  container.append(layout);
}

function compareSlot(slot: number, selectedId: string): HTMLElement {
  const view = new FabricView();
  views[slot] = view;

  const sel = h('select', { style: 'width:260px' }) as HTMLSelectElement;
  for (const p of store.patterns) sel.append(h('option', { value: p.id }, `${p.name} (${p.width}×${p.height})`));
  sel.value = selectedId;

  const statsBox = h('div', { class: 'hud', style: 'left:auto;right:12px;pointer-events:auto;min-width:190px' });

  const mount = (id: string) => {
    const p = store.patterns.find((x) => x.id === id);
    if (!p) return;
    view.setPattern(p);
    const s = analyzeAll(p, store.settings.longFloatThreshold);
    statsBox.innerHTML =
      `<b>${p.name}</b><br>` +
      `经浮长 最大 ${s.warp.maxLength} / 均 ${s.warp.meanLength.toFixed(2)}<br>` +
      `纬浮长 最大 ${s.weft.maxLength} / 均 ${s.weft.meanLength.toFixed(2)}<br>` +
      `长浮长段 经${s.warp.longFloats} 纬${s.weft.longFloats}<br>` +
      `经纱 ${store.getYarn(p.warpYarnId)?.name ?? '-'}<br>` +
      `纬纱 ${store.getYarn(p.weftYarnId)?.name ?? '-'}`;
  };

  sel.addEventListener('change', () => mount(sel.value));
  mount(selectedId);

  view.wrap.append(
    h('div', { style: 'position:absolute;top:12px;left:12px;z-index:2' }, sel),
    statsBox,
  );
  return view.wrap;
}

export function disposeCompare(): void {
  for (const v of views) v.dispose();
  views = [];
}
