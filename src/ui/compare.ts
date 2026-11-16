// ---------- 对比页: 两种组织并排渲染 ----------
import { loadPatterns } from '../store';
import { FabricRenderer } from '../gl/renderer';
import { setupRendererFor } from './preview';
import { el } from './common';

export function renderComparePage(root: HTMLElement) {
  const patterns = loadPatterns();
  const wrap = el('div', { class: 'page compare' });
  if (patterns.length < 1) {
    wrap.append(el('p', { class: 'muted' }, '请先在花型库中创建花型。'));
    root.append(wrap);
    return;
  }

  const mkSide = (defaultId: string) => {
    const sel = el('select', {});
    for (const p of patterns) sel.append(el('option', { value: p.id }, `${p.name} (${p.width}×${p.height})`));
    sel.value = defaultId;
    const canvas = el('canvas', { class: 'gl-canvas half' });
    const box = el('div', { class: 'compare-side' }, sel, canvas);
    return { sel, canvas, box, renderer: null as FabricRenderer | null };
  };

  const A = mkSide(patterns[0].id);
  const B = mkSide(patterns[Math.min(1, patterns.length - 1)].id);

  const syncChk = el('input', { type: 'checkbox' });
  syncChk.checked = true;

  const bar = el('div', { class: 'toolbar' },
    el('h2', {}, '组织对比'),
    el('label', { class: 'field inline' }, syncChk, el('span', {}, ' 同步视角')),
  );

  wrap.append(bar, el('div', { class: 'compare-cols' }, A.box, B.box));
  root.append(wrap);

  const setup = (side: ReturnType<typeof mkSide>) => {
    side.renderer = setupRendererFor(side.canvas, side.sel.value);
    side.renderer?.attachControls(() => {
      if (syncChk.checked) syncCameras(side === A ? B : A, side);
    });
  };
  const syncCameras = (dst: ReturnType<typeof mkSide>, src: ReturnType<typeof mkSide>) => {
    if (!dst.renderer || !src.renderer) return;
    dst.renderer.camera = { ...src.renderer.camera };
    dst.renderer.dirty = true;
  };
  A.sel.onchange = () => setup(A);
  B.sel.onchange = () => setup(B);
  setup(A); setup(B);

  const loop = () => {
    if (!document.body.contains(A.canvas)) return;
    for (const s of [A, B]) if (s.renderer?.dirty) s.renderer.render();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
