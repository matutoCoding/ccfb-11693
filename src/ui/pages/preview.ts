// 织物预览页:WebGL2 渲染 + 光源/视角控制 + 截图
import { store } from '../../core/store';
import { h, clear, toast } from '../dom';
import { navigate } from '../router';
import { FabricView } from '../FabricView';
import { download } from '../../core/util';
import { auditPattern } from '../../core/float';
import { verifyGeometryAgainstCells } from '../../core/geometry';

let view: FabricView | null = null;

export function renderPreviewPage(container: HTMLElement): void {
  const p = store.activePattern;
  if (!p) {
    clear(container);
    container.append(h('div', { class: 'empty' }, '请先选择花型 ',
      h('button', { class: 'primary', onclick: () => navigate('patterns') }, '去花型库')));
    return;
  }

  clear(container);
  view?.dispose();
  view = new FabricView();

  const layout = h('div', { class: 'preview-layout' });
  const side = h('div', { class: 'editor-panel' });

  container.append(
    h('div', { class: 'page-head' },
      h('div', {},
        h('h2', {}, '织物预览'),
        h('div', { class: 'sub' }, '左键旋转视角 / 滚轮缩放;切到光源模式后拖动可改变光泽方向'),
      ),
      h('div', { class: 'toolbar' },
        h('button', { onclick: () => view?.frame() }, '复位视角'),
        h('button', { class: 'primary', onclick: () => shoot() }, '📷 导出渲染截图'),
      ),
    ),
  );

  buildSide(side, p);
  layout.append(view.wrap, side);
  container.append(layout);
  view.setPattern(p);
}

function buildSide(panel: HTMLElement, p: typeof store.patterns[number]): void {
  clear(panel);
  const s = store.settings;

  // 交互模式
  const modeSel = h('select') as HTMLSelectElement;
  modeSel.append(h('option', { value: 'camera' }, '旋转视角'), h('option', { value: 'light' }, '拖动光源'));
  modeSel.addEventListener('change', () => view?.setMode(modeSel.value as 'camera' | 'light'));

  panel.append(
    h('h4', {}, '鼠标操作'),
    h('div', { class: 'form-row' }, h('label', {}, '拖动模式'), modeSel),
  );

  panel.append(h('div', { class: 'split' }));
  panel.append(h('h4', {}, '光源(转动后光泽变化)'));
  panel.append(
    sliderRow('方位角', 0, 360, s.lightAzimuth, 1, (v) => store.updateSettings({ lightAzimuth: v })),
    sliderRow('仰角', 5, 85, s.lightElevation, 1, (v) => store.updateSettings({ lightElevation: v })),
  );

  panel.append(h('div', { class: 'split' }));
  panel.append(h('h4', {}, '渲染参数'));
  panel.append(
    sliderRow('横向循环', 1, 8, s.repeatX, 1, (v) => store.updateSettings({ repeatX: v })),
    sliderRow('纵向循环', 1, 8, s.repeatY, 1, (v) => store.updateSettings({ repeatY: v })),
    sliderRow('环境遮蔽', 0, 1, s.aoStrength, 0.05, (v) => store.updateSettings({ aoStrength: v })),
  );
  const twistCb = h('input', { type: 'checkbox' }) as HTMLInputElement;
  twistCb.checked = s.twistVisible;
  twistCb.addEventListener('change', () => store.updateSettings({ twistVisible: twistCb.checked }));
  panel.append(h('div', { class: 'form-row' }, h('label', {}, '捻纹可见'), twistCb));

  panel.append(h('div', { class: 'split' }));

  // 实时校验状态
  const audit = auditPattern(p, s.longFloatThreshold);
  const geo = verifyGeometryAgainstCells(p);
  const warpYarn = store.getYarn(p.warpYarnId);
  const weftYarn = store.getYarn(p.weftYarnId);
  panel.append(
    h('h4', {}, '渲染依据校验'),
    h('div', { class: 'check-list' },
      h('div', { class: audit.ok ? 'ok' : '' }, audit.ok ? '✅ 浮长段与组织图逐格一致' : '❌ 审计失败'),
      h('div', { class: geo.length === 0 ? 'ok' : '' }, geo.length === 0 ? '✅ 交织几何与组织点一致' : '❌ 几何异常'),
      h('div', {}, `经纱:${warpYarn?.name ?? '未指定'}`),
      h('div', {}, `纬纱:${weftYarn?.name ?? '未指定'}`),
    ),
    h('p', { class: 'muted', style: 'margin-top:12px' },
      '几何中每根纱线的上下层关系直接取自组织图 cells,因此渲染可见的每一段浮长都能在组织图逐格核对。'),
  );
}

function sliderRow(label: string, min: number, max: number, value: number, step: number, onInput: (v: number) => void): HTMLElement {
  const input = h('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value) }) as HTMLInputElement;
  const num = h('span', { class: 'num' }, String(value));
  input.addEventListener('input', () => {
    const v = Number(input.value);
    num.textContent = String(v);
    onInput(v);
  });
  return h('div', {},
    h('div', { class: 'muted', style: 'margin-bottom:2px' }, label),
    h('div', { class: 'range-row' }, input, num),
  );
}

function shoot(): void {
  if (!view) return;
  const p = store.activePattern!;
  download(`${p.name}-渲染截图.png`, view.screenshot(), 'image/png');
  toast('截图已导出(PNG)');
}

export function disposePreview(): void {
  view?.dispose();
  view = null;
}
