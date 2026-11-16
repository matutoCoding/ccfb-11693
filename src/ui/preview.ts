// ---------- 织物预览页(WebGL2 渲染) ----------
import { getPattern, loadYarns, loadSettings } from '../store';
import { buildInstances, STRIDE } from '../geometry';
import { FabricRenderer } from '../gl/renderer';
import { verifyInstancesAgainstGrid } from '../weave';
import { hexToRgb } from '../types';
import { el, labeled } from './common';

export function setupRendererFor(canvas: HTMLCanvasElement, patternId: string): FabricRenderer | null {
  const p = getPattern(patternId);
  if (!p) return null;
  const yarns = loadYarns();
  const s = loadSettings();
  const warp = yarns.find((y) => y.id === p.warpYarnId) ?? yarns[0];
  const weft = yarns.find((y) => y.id === p.weftYarnId) ?? yarns[0];
  const r = new FabricRenderer(canvas, s.radialSegments);
  const inst = buildInstances(p.grid, p.width, p.height, warp, weft);
  r.setInstances(inst, p.width, p.height);
  r.warpProps = { color: hexToRgb(warp.color), gloss: warp.gloss, twist: warp.twist / 200 };
  r.weftProps = { color: hexToRgb(weft.color), gloss: weft.gloss, twist: weft.twist / 200 };
  r.light.azimuth = s.lightAzimuth;
  r.light.elevation = s.lightElevation;
  return r;
}

export function renderPreviewPage(root: HTMLElement, id: string) {
  const p = getPattern(id);
  if (!p) { root.append(el('p', {}, '花型不存在')); return; }
  const s = loadSettings();

  const wrap = el('div', { class: 'page preview' });
  const canvas = el('canvas', { class: 'gl-canvas' });
  let renderer: FabricRenderer | null = null;
  try {
    renderer = setupRendererFor(canvas, id);
  } catch (e) {
    root.append(el('p', { class: 'bad' }, String(e)));
    return;
  }
  if (!renderer) { root.append(el('p', {}, '花型不存在')); return; }
  const R = renderer;

  // ===== 工具栏 =====
  const modeSel = el('select', {},
    el('option', { value: '0' }, '纱线颜色'),
    el('option', { value: '1' }, '浮长热力图'),
    el('option', { value: '2' }, '经纬双色'),
  );
  modeSel.onchange = () => { R.colorMode = parseInt(modeSel.value); R.dirty = true; };

  const az = el('input', { type: 'range', min: '0', max: '360', value: String(R.light.azimuth) });
  az.oninput = () => { R.light.azimuth = parseFloat(az.value); R.dirty = true; };
  const elv = el('input', { type: 'range', min: '5', max: '90', value: String(R.light.elevation) });
  elv.oninput = () => { R.light.elevation = parseFloat(elv.value); R.dirty = true; };
  const auto = el('input', { type: 'checkbox' });
  auto.checked = s.autoRotateLight;

  const verifyOut = el('span', { class: 'muted' });
  const btnVerify = el('button', {}, '浮长一致性核对');
  btnVerify.onclick = () => {
    // 用与渲染相同的几何生成函数重建实例并逐格核对
    const yarns = loadYarns();
    const warp = yarns.find((y) => y.id === p.warpYarnId) ?? yarns[0];
    const weft = yarns.find((y) => y.id === p.weftYarnId) ?? yarns[0];
    const inst = buildInstances(p.grid, p.width, p.height, warp, weft);
    const err = verifyInstancesAgainstGrid(p.grid, p.width, p.height, inst, STRIDE);
    verifyOut.textContent = err ? `✗ ${err}` : `✓ ${p.width}×${p.height} 共 ${p.width * p.height} 格,组织图与渲染几何逐格一致`;
    verifyOut.className = err ? 'bad' : 'ok';
  };

  const btnShot = el('button', {}, '导出渲染截图');
  btnShot.onclick = () => R.screenshot(`${p.name}-渲染.png`);

  const toolbar = el('div', { class: 'toolbar' },
    el('button', {}, '← 返回'),
    labeled('显示', modeSel),
    labeled('光源方位', az),
    labeled('光源高度', elv),
    el('label', { class: 'field inline' }, auto, el('span', {}, ' 光源旋转')),
    btnVerify, verifyOut, btnShot,
  );
  (toolbar.children[0] as HTMLButtonElement).onclick = () => (location.hash = `#/weave/${p.id}`);

  wrap.append(toolbar, canvas, el('p', { class: 'muted' },
    `${p.name} · ${p.width}×${p.height} · 拖拽旋转视角,滚轮缩放。浮长热力图: 蓝=短浮长,红=长浮长(≥8)。`));
  root.append(wrap);

  R.attachControls();
  // 渲染循环: 仅在需要时重绘; 帧耗时过高时自动降低纱线分段数保帧率
  const fpsEl = el('span', { class: 'muted' });
  toolbar.append(fpsEl);
  let lastT = performance.now(), emaMs = 16, frames = 0, fpsT = lastT;
  const loop = () => {
    if (!document.body.contains(canvas)) return;
    if (auto.checked) { R.light.azimuth = (R.light.azimuth + 0.6) % 360; az.value = String(R.light.azimuth); R.dirty = true; }
    if (R.dirty) {
      R.render();
      const now = performance.now();
      emaMs = emaMs * 0.9 + (now - lastT) * 0.1;
      if (emaMs > 50 && R.getRadial() > 4) R.setRadial(R.getRadial() - 2); // 自动降质
      frames++;
      if (now - fpsT > 1000) {
        fpsEl.textContent = ` ${frames} FPS · 质量 ${R.getRadial()}段`;
        frames = 0; fpsT = now;
      }
      lastT = now;
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
