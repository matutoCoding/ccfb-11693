// 设置页:渲染默认参数 / 长浮长阈值 / 存储管理
import { store, DEFAULT_SETTINGS } from '../../core/store';
import { buildBundle, parseBundle } from '../../core/storage';
import { h, clear, toast, confirmDialog } from '../dom';
import { download } from '../../core/util';

export function renderSettingsPage(container: HTMLElement): void {
  clear(container);
  const s = store.settings;
  container.append(h('div', { class: 'page-head' }, h('h2', {}, '设置')));

  const card = h('div', { class: 'card', style: 'max-width:680px' });

  card.append(
    h('h4', { style: 'margin-top:0;color:var(--accent)' }, '渲染默认值'),
    range('环境遮蔽强度', 0, 1, s.aoStrength, 0.05, (v) => store.updateSettings({ aoStrength: v })),
    colorRow('背景色', s.bgColor, (v) => store.updateSettings({ bgColor: v })),
  );

  const twistCb = h('input', { type: 'checkbox' }) as HTMLInputElement;
  twistCb.checked = s.twistVisible;
  twistCb.addEventListener('change', () => store.updateSettings({ twistVisible: twistCb.checked }));
  card.append(h('div', { class: 'form-row' }, h('label', {}, '捻纹可见'), twistCb));

  card.append(
    h('h4', { style: 'color:var(--accent)' }, '浮长判定'),
    range('长浮长阈值(连续压过几根判定为长浮长)', 2, 16, s.longFloatThreshold, 1, (v) =>
      store.updateSettings({ longFloatThreshold: v }),
    ),
    h('p', { class: 'muted' }, '该阈值同时影响组织设计页与对比页的长浮长计数和告警'),
  );

  card.append(
    h('h4', { style: 'color:var(--accent)' }, '循环平铺默认值'),
    range('横向循环', 1, 8, s.repeatX, 1, (v) => store.updateSettings({ repeatX: v })),
    range('纵向循环', 1, 8, s.repeatY, 1, (v) => store.updateSettings({ repeatY: v })),
  );

  // 存储管理
  const storageUsed = new Blob([localStorage.getItem('jacquard.patterns.v1') ?? '']).size;
  card.append(
    h('h4', { style: 'color:var(--accent)' }, '本地存储'),
    h('p', { class: 'muted' },
      `花型 ${store.patterns.length} 个 · 纱线 ${store.yarns.length} 条 · 花型数据约 ${(storageUsed / 1024).toFixed(1)} KB`,
    ),
    h('div', { class: 'toolbar' },
      h('button', { onclick: exportAll }, '导出全部数据(JSON)'),
      h('button', { onclick: importData }, '导入数据(JSON)'),
      h('button', {
        class: 'danger',
        onclick: async () => {
          if (await confirmDialog('将清空浏览器中的全部花型、纱线和设置,且无法恢复。建议先导出备份。确认清空?')) {
            localStorage.clear();
            location.reload();
          }
        },
      }, '清空全部数据'),
      h('button', {
        onclick: () => {
          store.updateSettings(DEFAULT_SETTINGS);
          toast('渲染设置已恢复默认');
        },
      }, '恢复默认设置'),
    ),
  );

  // 性能说明
  card.append(
    h('h4', { style: 'color:var(--accent)' }, '性能说明'),
    h('div', { class: 'check-list' },
      h('div', {}, '· 512×512 组织 = 524,288 个纱线实例段,经/纬各自一次实例化绘制'),
      h('div', {}, '· 相机旋转与光源移动只重绘不重建几何,交互帧率不受组织尺寸影响'),
      h('div', {}, '· 编辑组织后几何缓冲增量重建(实测约 50ms,已自动合并连续修改)'),
      h('div', {}, '· 卡顿可减小循环平铺数或关闭捻纹,降低 GPU 填充压力'),
    ),
  );

  container.append(card);
}

function range(label: string, min: number, max: number, value: number, step: number, onInput: (v: number) => void): HTMLElement {
  const input = h('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value) }) as HTMLInputElement;
  const num = h('span', { class: 'num' }, String(value));
  input.addEventListener('input', () => {
    num.textContent = input.value;
    onInput(Number(input.value));
  });
  return h('div', { style: 'margin-bottom:14px' },
    h('div', { class: 'muted', style: 'margin-bottom:4px' }, label),
    h('div', { class: 'range-row' }, input, num),
  );
}

function colorRow(label: string, value: string, onInput: (v: string) => void): HTMLElement {
  const input = h('input', { type: 'color', value }) as HTMLInputElement;
  input.addEventListener('input', () => onInput(input.value));
  return h('div', { class: 'form-row', style: 'max-width:300px' }, h('label', {}, label), input);
}

function exportAll(): void {
  const bundle = buildBundle(store.patterns, store.yarns);
  download(`jacquard-bundle-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(bundle, null, 2), 'application/json');
  toast('已导出');
}

function importData(): void {
  const input = h('input', { type: 'file', accept: '.json' }) as HTMLInputElement;
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const { patterns, yarns } = parseBundle(String(reader.result));
        store.importPatterns(patterns, yarns);
        toast(`导入 ${patterns.length} 个花型`);
      } catch (err) {
        toast('导入失败:' + (err as Error).message, 3500);
      }
    };
    reader.readAsText(file);
  });
  input.click();
}
