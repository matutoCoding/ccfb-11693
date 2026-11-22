// 纱线库:粗细 / 颜色 / 捻度 / 光泽 / 类型,经纬在花型中分别指定
import { store } from '../../core/store';
import { h, clear, toast, modal, confirmDialog } from '../dom';
import { uid, hexToRgb } from '../../core/util';
import type { Yarn, YarnKind } from '../../core/types';

export function renderYarnsPage(container: HTMLElement): void {
  clear(container);
  container.append(
    h('div', { class: 'page-head' },
      h('div', {},
        h('h2', {}, '纱线库'),
        h('div', { class: 'sub' }, '光泽控制各向异性高光强度,捻度控制表面螺旋纹理'),
      ),
      h('button', { class: 'primary', onclick: () => editDialog(null) }, '+ 新建纱线'),
    ),
  );

  const list = h('div', { style: 'max-width:860px' });
  for (const y of store.yarns) {
    const used = store.patterns.filter((p) => p.warpYarnId === y.id || p.weftYarnId === y.id).length;
    const row = h('div', { class: 'yarn-row' },
      h('div', {
        style: `width:34px;height:34px;border-radius:50%;background:${y.color};border:1px solid var(--border);flex-shrink:0;box-shadow:0 0 10px ${y.color}55`,
      }),
      h('div', { class: 'name' },
        h('div', {}, y.name),
        h('small', {}, `Ø${y.thickness.toFixed(2)} · 捻度${y.twist.toFixed(1)} · 光泽${(y.luster * 100) | 0}% · ${y.kind === 'filament' ? '长丝' : '短纤'} · ${used} 个花型使用`),
      ),
      h('button', { onclick: () => editDialog(y) }, '编辑'),
      h('button', {
        class: 'danger',
        onclick: async () => {
          if (used > 0) return toast(`该纱线被 ${used} 个花型引用,不能删除`, 3000);
          if (await confirmDialog(`删除纱线「${y.name}」?`)) {
            store.deleteYarn(y.id);
            toast('已删除');
          }
        },
      }, '删除'),
    );
    list.append(row);
  }
  container.append(list);

  // 当前花型的经纬指定
  const p = store.activePattern;
  if (p) {
    container.append(h('div', { class: 'split', style: 'max-width:860px' }));
    const card = h('div', { class: 'card', style: 'max-width:860px' });
    card.append(h('h4', { style: 'margin:0 0 12px;color:var(--accent)' }, `当前花型「${p.name}」的经纬纱指定`));
    card.append(
      yarnAssignRow('经纱', p.warpYarnId, (id) => {
        p.warpYarnId = id;
        store.touch();
      }),
      yarnAssignRow('纬纱', p.weftYarnId, (id) => {
        p.weftYarnId = id;
        store.touch();
      }),
    );
    container.append(card);
  }
}

function yarnAssignRow(label: string, selected: string, onPick: (id: string) => void): HTMLElement {
  const sel = h('select', { style: 'flex:1' }) as HTMLSelectElement;
  for (const y of store.yarns) sel.append(h('option', { value: y.id }, y.name));
  sel.value = selected;
  sel.addEventListener('change', () => {
    onPick(sel.value);
    toast(`${label}已更换,预览将自动重建`);
  });
  return h('div', { class: 'form-row', style: 'max-width:420px' }, h('label', {}, label), sel);
}

function editDialog(existing: Yarn | null): void {
  const y: Yarn = existing
    ? { ...existing }
    : { id: uid(), name: '新纱线', color: '#c8b89a', thickness: 1, twist: 1.5, luster: 0.6, kind: 'filament' };

  const nameInput = h('input', { value: y.name }) as HTMLInputElement;
  const colorInput = h('input', { type: 'color', value: y.color }) as HTMLInputElement;
  const thickness = h('input', { type: 'range', min: '0.5', max: '2', step: '0.05', value: String(y.thickness) }) as HTMLInputElement;
  const twist = h('input', { type: 'range', min: '0', max: '4', step: '0.1', value: String(y.twist) }) as HTMLInputElement;
  const luster = h('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(y.luster) }) as HTMLInputElement;
  const kind = h('select') as HTMLSelectElement;
  kind.append(h('option', { value: 'filament' }, '长丝(丝绸/涤纶,高光泽)'), h('option', { value: 'spun' }, '短纤(棉/毛,低光泽)'));
  kind.value = y.kind;

  const tNum = h('span', { class: 'num' }, y.thickness.toFixed(2));
  const wNum = h('span', { class: 'num' }, y.twist.toFixed(1));
  const lNum = h('span', { class: 'num' }, `${(y.luster * 100) | 0}%`);
  thickness.addEventListener('input', () => (tNum.textContent = Number(thickness.value).toFixed(2)));
  twist.addEventListener('input', () => (wNum.textContent = Number(twist.value).toFixed(1)));
  luster.addEventListener('input', () => (lNum.textContent = `${(Number(luster.value) * 100) | 0}%`));

  const rgb = hexToRgb(y.color);
  const swatch = h('div', {
    style: `height:60px;border-radius:8px;margin-bottom:12px;background:linear-gradient(135deg, ${y.color}, rgb(${rgb.map((v) => v * 180 | 0).join(',')}));border:1px solid var(--border)`,
  });
  colorInput.addEventListener('input', () => {
    const c = hexToRgb(colorInput.value);
    swatch.style.background = `linear-gradient(135deg, ${colorInput.value}, rgb(${c.map((v) => (v * 180) | 0).join(',')}))`;
  });

  const content = h('div', {},
    swatch,
    h('div', { class: 'form-row' }, h('label', {}, '名称'), nameInput),
    h('div', { class: 'form-row' }, h('label', {}, '颜色'), colorInput),
    h('div', { class: 'form-row' }, h('label', {}, '类型'), kind),
    h('div', { class: 'form-row' }, h('label', {}, '粗细 Ø'), h('div', { class: 'range-row', style: 'flex:1' }, thickness, tNum)),
    h('div', { class: 'form-row' }, h('label', {}, '捻度'), h('div', { class: 'range-row', style: 'flex:1' }, twist, wNum)),
    h('div', { class: 'form-row' }, h('label', {}, '光泽'), h('div', { class: 'range-row', style: 'flex:1' }, luster, lNum)),
  );
  const actions = h('div', { class: 'modal-actions' });
  const cancel = h('button', {}, '取消');
  const ok = h('button', { class: 'primary' }, existing ? '保存' : '创建');
  actions.append(cancel, ok);
  content.append(actions);
  const m = modal(existing ? '编辑纱线' : '新建纱线', content);

  cancel.onclick = () => m.close();
  ok.onclick = () => {
    y.name = nameInput.value || y.name;
    y.color = colorInput.value;
    y.thickness = Number(thickness.value);
    y.twist = Number(twist.value);
    y.luster = Number(luster.value);
    y.kind = kind.value as YarnKind;
    if (existing) store.updateYarn(y);
    else store.addYarn(y);
    m.close();
    toast('已保存');
  };
}
