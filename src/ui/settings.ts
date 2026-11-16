// ---------- 设置页 ----------
import { loadSettings, saveSettings, storageUsage, clearAll } from '../store';
import { el, labeled, numberInput } from './common';

export function renderSettingsPage(root: HTMLElement) {
  const s = loadSettings();
  const wrap = el('div', { class: 'page' });
  wrap.append(el('div', { class: 'toolbar' }, el('h2', {}, '设置')));

  const form = el('div', { class: 'settings-form' });
  form.append(
    labeled('新建花型默认宽度', numberInput(s.defaultWidth, 2, 512, (v) => { s.defaultWidth = v | 0; saveSettings(s); })),
    labeled('新建花型默认高度', numberInput(s.defaultHeight, 2, 512, (v) => { s.defaultHeight = v | 0; saveSettings(s); })),
    labeled('渲染质量(纱线圆周分段)', numberInput(s.radialSegments, 4, 24, (v) => { s.radialSegments = v | 0; saveSettings(s); })),
    labeled('默认光源方位角', numberInput(s.lightAzimuth, 0, 360, (v) => { s.lightAzimuth = v; saveSettings(s); })),
    labeled('默认光源高度角', numberInput(s.lightElevation, 5, 90, (v) => { s.lightElevation = v; saveSettings(s); })),
  );
  const auto = el('input', { type: 'checkbox' });
  auto.checked = s.autoRotateLight;
  auto.onchange = () => { s.autoRotateLight = auto.checked; saveSettings(s); };
  form.append(el('label', { class: 'field inline' }, auto, el('span', {}, ' 预览页默认开启光源旋转')));

  const danger = el('div', { class: 'settings-form' },
    el('p', { class: 'muted' }, `本地存储占用: ${storageUsage()}(数据保存在浏览器 localStorage)`),
  );
  const btnClear = el('button', { class: 'danger' }, '清空全部数据');
  btnClear.onclick = () => {
    if (confirm('将删除所有花型、纱线和设置,确定?')) { clearAll(); alert('已清空'); }
  };
  danger.append(btnClear);

  wrap.append(form, el('hr'), danger);
  root.append(wrap);
}
