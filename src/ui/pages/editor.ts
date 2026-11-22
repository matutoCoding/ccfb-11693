// 组织设计页:工具面板 + 画布编辑器 + 生成器/变换/图片导入/浮长审计
import { store } from '../../core/store';
import {
  generatePlain,
  generateTwill,
  generateSatin,
  satinStepOptions,
  replaceCells,
  invertCells,
  rotateCW,
  mirrorHorizontal,
  resizePattern,
  getCell,
} from '../../core/weave';
import { analyzeAll, auditPattern, runsForYarn } from '../../core/float';
import { verifyGeometryAgainstCells } from '../../core/geometry';
import { loadImage, imageToCells } from '../../core/imageImport';
import { h, clear, toast, modal, exportPatternPNG } from '../dom';
import { download } from '../../core/util';
import { navigate } from '../router';
import { WeaveEditor, type EditTool } from '../WeaveEditor';
import type { WeavePattern } from '../../core/types';

let editor: WeaveEditor | null = null;

export function disposeEditor(): void {
  editor?.dispose();
  editor = null;
}

export function renderEditorPage(container: HTMLElement): void {
  const p = store.activePattern;
  if (!p) {
    clear(container);
    container.append(h('div', { class: 'empty' },
      '请先选择或新建一个花型 ',
      h('button', { class: 'primary', onclick: () => navigate('patterns') }, '去花型库'),
    ));
    return;
  }
  clear(container);
  container.append(buildHead(p));

  const layout = h('div', { class: 'editor-layout' });
  const left = h('div', { class: 'editor-panel' });
  const center = h('div', { class: 'editor-canvas-wrap' });
  const right = h('div', { class: 'editor-panel' });

  buildLeft(left, p);
  buildRight(right, p);
  layout.append(left, center, right);
  container.append(layout);

  editor?.dispose();
  editor = new WeaveEditor(p, {
    onChange: () => {
      store.touch();
      buildRight(right, p);
    },
    onHoverInfo: (info) => {
      const el = document.getElementById('hover-info');
      if (el) el.textContent = info;
    },
  });
  editor.setTiling(store.settings.repeatX, store.settings.repeatY);
  center.append(editor.element);
}

function buildHead(p: WeavePattern): HTMLElement {
  const nameInput = h('input', { value: p.name, style: 'width:200px' }) as HTMLInputElement;
  nameInput.addEventListener('change', () => store.renamePattern(p.id, nameInput.value || p.name));
  return h('div', { class: 'page-head' },
    h('div', { style: 'display:flex;align-items:center;gap:12px' },
      h('h2', { style: 'margin:0' }, '组织设计'),
      nameInput,
      h('span', { class: 'badge' }, `${p.width}×${p.height}`),
    ),
    h('div', { class: 'toolbar' },
      h('button', { onclick: () => navigate('preview') }, '织物预览 →'),
      h('button', {
        onclick: () => {
          download(`${p.name}-组织图.png`, exportPatternPNG(p.cells, p.width, p.height, p.name));
          toast('组织图已导出 PNG');
        },
      }, '导出组织图'),
    ),
  );
}

function buildLeft(panel: HTMLElement, p: WeavePattern): void {
  clear(panel);

  // 画笔
  panel.append(h('h4', {}, '编辑工具'));
  const tools: Array<[EditTool, string]> = [
    ['paint', '✏️ 画笔(右键擦除)'],
    ['line', '📏 直线'],
    ['rect', '▭ 矩形'],
    ['fill', '🪣 填充(循环连通)'],
    ['pick', '🎯 取组织点'],
  ];
  for (const [t, label] of tools) {
    const btn = h('button', { class: 'tool-btn' + (t === 'paint' ? ' active' : '') }, label);
    btn.addEventListener('click', () => {
      panel.querySelectorAll('.tool-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      editor?.setTool(t);
    });
    panel.append(btn);
  }
  const paintRow = h('div', { class: 'gen-row', style: 'margin-top:8px' },
    h('button', {
      class: 'primary',
      style: 'flex:1',
      onclick: () => editor?.setPaintValue(1),
    }, '画经浮点'),
    h('button', {
      style: 'flex:1',
      onclick: () => editor?.setPaintValue(0),
    }, '画纬浮点'),
  );
  panel.append(paintRow);

  panel.append(h('div', { class: 'split' }));

  // 一键生成
  panel.append(h('h4', {}, '基本组织生成'));
  const nInput = numInput(8);
  const kInput = numInput(2);
  const sInput = numInput(1);
  panel.append(
    h('button', { class: 'tool-btn', onclick: () => applyGen(p, generatePlain(2, 2), 2, 2) }, '平纹(棋盘格)'),
  );
  const twillRow = h('div', { class: 'gen-row' },
    h('span', { style: 'width:34px' }, '循环'), nInput, h('span', { style: 'width:20px' }, '枚'), kInput, h('span', {}, '经浮'),
  );
  panel.append(twillRow);
  panel.append(h('button', {
    class: 'tool-btn',
    onclick: () => {
      const n = val(nInput, 2, 64);
      const k = val(kInput, 1, n - 1);
      applyGen(p, generateTwill(n, n, n, k, 1), n, n);
    },
  }, '斜纹(n 枚 k 经浮)'));

  const satinN = numInput(8);
  const satinS = numInput(5);
  panel.append(h('div', { class: 'gen-row' }, h('span', { style: 'width:34px' }, '枚数'), satinN, h('span', { style: 'width:20px' }, '飞'), satinS));
  panel.append(h('button', {
    class: 'tool-btn',
    onclick: () => {
      const n = val(satinN, 5, 64);
      const s = val(satinS, 2, n - 2);
      const opts = satinStepOptions(n);
      if (!opts.includes(s)) {
        toast(`${n} 枚可用飞数:${opts.join(', ')}`, 3200);
        return;
      }
      applyGen(p, generateSatin(n, n, n, s), n, n);
    },
  }, '缎纹(枚数与飞数互质)'));

  panel.append(h('div', { class: 'split' }));

  // 变换
  panel.append(h('h4', {}, '变换'));
  panel.append(
    h('div', { class: 'gen-row' },
      h('button', { style: 'flex:1', onclick: () => { invertCells(p); afterMutate(p, panel); } }, '经纬反转'),
      h('button', { style: 'flex:1', onclick: () => { rotateCW(p); afterMutate(p, panel); } }, '顺时针旋转'),
    ),
    h('button', { class: 'tool-btn', onclick: () => { mirrorHorizontal(p); afterMutate(p, panel); } }, '水平镜像'),
  );

  // 改尺寸
  const wInput = numInput(p.width);
  const hInput = numInput(p.height);
  panel.append(h('div', { class: 'gen-row', style: 'margin-top:8px' }, h('span', {}, '改为'), wInput, h('span', {}, '×'), hInput));
  panel.append(h('button', {
    class: 'tool-btn',
    onclick: () => {
      const w = val(wInput, 2, 512);
      const hh = val(hInput, 2, 512);
      if (w === p.width && hh === p.height) return;
      resizePattern(p, w, hh);
      afterMutate(p, panel);
      toast('已按循环规则缩放');
    },
  }, '调整尺寸(自动循环平铺)'));

  panel.append(h('div', { class: 'split' }));

  // 图片导入
  panel.append(h('h4', {}, '图片转组织'));
  panel.append(h('button', { class: 'tool-btn', onclick: () => importDialog(p, panel) }, '🖼️ 导入图片并量化'));

  panel.append(h('div', { class: 'split' }));
  panel.append(h('h4', {}, '循环平铺预览'));
  const tx = numInput(store.settings.repeatX);
  const ty = numInput(store.settings.repeatY);
  panel.append(h('div', { class: 'gen-row' }, tx, h('span', {}, '×'), ty));
  panel.append(h('button', {
    class: 'tool-btn',
    onclick: () => {
      const x = Math.min(8, val(tx, 1, 8));
      const y = Math.min(8, val(ty, 1, 8));
      store.updateSettings({ repeatX: x, repeatY: y });
      editor?.setTiling(x, y);
    },
  }, '应用平铺'));
}

function buildRight(panel: HTMLElement, p: WeavePattern): void {
  clear(panel);
  const threshold = store.settings.longFloatThreshold;
  const stats = analyzeAll(p, threshold);
  const audit = auditPattern(p, threshold);
  const geoIssues = verifyGeometryAgainstCells(p);

  panel.append(
    h('h4', {}, '一致性校验'),
    h('div', { class: 'check-list' },
      h('div', {}, audit.ok ? '✅ 浮长审计通过' : '❌ 浮长审计发现问题'),
      h('div', {}, `核对段数 ${audit.checkedRuns},格子 ${audit.checkedCells}/${p.width * p.height}`),
      h('div', {}, geoIssues.length === 0 ? '✅ 几何高度与组织点完全一致' : '❌ 几何一致性异常'),
    ),
  );
  if (audit.issues.length || geoIssues.length) {
    const box = h('div', { class: 'audit-box' });
    for (const iss of audit.issues.slice(0, 30)) box.append(h('div', { class: 'audit-issue' }, iss.message));
    for (const iss of geoIssues.slice(0, 30)) box.append(h('div', { class: 'audit-issue' }, iss.message));
    panel.append(box);
  }

  panel.append(h('div', { class: 'split' }));
  panel.append(h('h4', {}, '浮长统计'));
  panel.append(
    statBlock('经纱浮长(经浮点)', stats.warp, threshold),
    statBlock('纬纱浮长(纬浮点)', stats.weft, threshold),
  );

  panel.append(h('div', { class: 'split' }));
  panel.append(h('h4', {}, '单根纱线查询'));
  const kindSel = h('select') as HTMLSelectElement;
  kindSel.append(h('option', { value: 'warp' }, '经纱(按列)'), h('option', { value: 'weft' }, '纬纱(按行)'));
  const idxInput = numInput(0);
  const result = h('div', { class: 'audit-box' });
  const runQuery = () => {
    const kind = kindSel.value as 'warp' | 'weft';
    const max = kind === 'warp' ? p.width - 1 : p.height - 1;
    const i = Math.min(max, Math.max(0, val(idxInput, 0, max)));
    const runs = runsForYarn(p, kind, i);
    clear(result);
    if (!runs.length) {
      result.append(h('div', { class: 'muted' }, '该纱线无浮长段(全沉在下层)'));
    }
    for (const r of runs) {
      const long = r.length >= threshold;
      result.append(h('div', { style: long ? 'color:var(--warn)' : '' },
        `起点 ${r.start} · 长度 ${r.length} 根${long ? ' ⚠ 长浮长' : ''}`));
    }
  };
  idxInput.addEventListener('change', runQuery);
  kindSel.addEventListener('change', runQuery);
  panel.append(
    h('div', { class: 'gen-row' }, kindSel, h('span', {}, '#'), idxInput),
    h('button', { class: 'tool-btn', onclick: runQuery }, '查询该纱线浮长'),
    result,
  );

  panel.append(h('div', { class: 'split' }));
  panel.append(h('div', { id: 'hover-info', class: 'muted' }, '鼠标悬停组织图查看逐格信息'));
}

function statBlock(title: string, s: { totalRuns: number; maxLength: number; meanLength: number; longFloats: number }, threshold: number): HTMLElement {
  return h('div', { style: 'margin-bottom:12px' },
    h('div', { style: 'font-weight:600;margin-bottom:4px' }, title),
    h('div', { class: 'stat-line' }, h('span', {}, '浮长段总数'), h('span', { class: 'v' }, String(s.totalRuns))),
    h('div', { class: 'stat-line' }, h('span', {}, '最大浮长'), h('span', { class: 'v' }, `${s.maxLength} 根`)),
    h('div', { class: 'stat-line' }, h('span', {}, '平均浮长'), h('span', { class: 'v' }, s.meanLength.toFixed(2))),
    h('div', { class: 'stat-line' }, h('span', {}, `长浮长(≥${threshold})`), h('span', { class: 'v', style: s.longFloats ? 'color:var(--warn)' : '' }, String(s.longFloats))),
  );
}

function applyGen(p: WeavePattern, cells: Uint8Array, w: number, h: number): void {
  // 生成器产出的是组织循环,这里按循环平铺到花型完整尺寸
  if (cells.length !== p.width * p.height) {
    const tiled = new Uint8Array(p.width * p.height);
    const base = { cells, width: w, height: h };
    for (let r = 0; r < p.height; r++) {
      for (let c = 0; c < p.width; c++) {
        tiled[r * p.width + c] = getCell(base as WeavePattern, c, r);
      }
    }
    cells = tiled;
  }
  replaceCells(p, cells, p.width, p.height);
  editor?.refresh();
  store.touch();
  toast('已生成,浮长统计已同步更新');
}

function afterMutate(p: WeavePattern, panel: HTMLElement): void {
  editor?.setPattern(p);
  store.touch();
  buildLeft(panel, p);
}

function numInput(value: number): HTMLInputElement {
  return h('input', { type: 'number', value: String(value), min: '1', max: '512', style: 'width:60px' }) as HTMLInputElement;
}

function val(input: HTMLInputElement, min: number, max: number): number {
  const n = parseInt(input.value, 10);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function importDialog(p: WeavePattern, panel: HTMLElement): void {
  const fileInput = h('input', { type: 'file', accept: 'image/*' }) as HTMLInputElement;
  const wInput = numInput(p.width);
  const hInput = numInput(p.height);
  const colorsInput = numInput(4);
  const dither = h('input', { type: 'checkbox' }) as HTMLInputElement;
  const preview = h('img', { style: 'max-width:100%;border-radius:6px;display:none' }) as HTMLImageElement;
  const info = h('div', { class: 'muted' });
  let result: ReturnType<typeof imageToCells> | null = null;

  const content = h('div', {},
    h('div', { class: 'form-row' }, h('label', {}, '选择图片'), fileInput),
    h('div', { class: 'form-row' }, h('label', {}, '输出尺寸'), h('div', { style: 'display:flex;gap:6px;align-items:center;flex:1' }, wInput, h('span', {}, '×'), hInput)),
    h('div', { class: 'form-row' }, h('label', {}, '颜色数量'), colorsInput),
    h('div', { class: 'form-row' }, h('label', {}, '抖动'), dither),
    h('button', {
      id: 'convert-btn',
      disabled: 'true',
      onclick: () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        info.textContent = '量化中…';
        loadImage(file).then((img) => {
          result = imageToCells(img, {
            width: val(wInput, 2, 512),
            height: val(hInput, 2, 512),
            maxColors: val(colorsInput, 2, 8),
            dither: dither.checked,
          });
          preview.src = result.quantizedPreview;
          preview.style.display = 'block';
          info.textContent = `量化为 ${result.palette.length} 色,阈值亮度 ${result.threshold.toFixed(1)},亮色→经浮点`;
        }).catch((err) => toast(err.message));
      },
    }, '执行量化预览'),
    preview,
    info,
  );
  fileInput.addEventListener('change', () => {
    (content.querySelector('#convert-btn') as HTMLButtonElement).disabled = false;
  });

  const actions = h('div', { class: 'modal-actions' });
  const cancel = h('button', {}, '取消');
  const ok = h('button', { class: 'primary', disabled: 'true' }, '应用为组织图');
  preview.addEventListener('load', () => (ok.disabled = false));
  actions.append(cancel, ok);
  content.append(actions);
  const m = modal('图片转提花组织', content, 520);

  cancel.onclick = () => m.close();
  ok.onclick = () => {
    if (!result) return;
    replaceCells(p, result.cells, result.width, result.height);
    m.close();
    afterMutate(p, panel);
    toast('已转换为二值提花组织');
  };
}
