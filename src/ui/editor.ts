// ---------- 组织设计页(格子编辑 + 浮长统计) ----------
import { getPattern, upsertPattern, loadYarns, downloadBlob } from '../store';
import { genPlain, genTwill, genSatin, columnFloatRuns, floatSummary, FloatRun } from '../weave';
import { el, labeled, numberInput } from './common';

const CELL_MAX = 26;

export function renderEditorPage(root: HTMLElement, id: string) {
  const found = getPattern(id);
  if (!found) { root.append(el('p', {}, '花型不存在')); return; }
  const p = found;
  const yarns = loadYarns();

  let brush: 0 | 1 = 1;
  let selCol = 0;
  let highlight: FloatRun | null = null;
  let showTile = true;

  const wrap = el('div', { class: 'page editor' });

  // ===== 工具栏 =====
  const toolbar = el('div', { class: 'toolbar' });
  const btnWarp = el('button', { class: 'primary' }, '绘经浮 ■');
  const btnWeft = el('button', {}, '绘纬浮 □');
  btnWarp.onclick = () => { brush = 1; btnWarp.className = 'primary'; btnWeft.className = ''; };
  btnWeft.onclick = () => { brush = 0; btnWeft.className = 'primary'; btnWarp.className = ''; };

  const mkBtn = (label: string, fn: () => void, title = '') => {
    const b = el('button', { title }, label);
    b.onclick = fn;
    return b;
  };

  // 一键生成
  const genSelect = el('select', {},
    el('option', { value: '' }, '一键生成…'),
    el('option', { value: 'plain' }, '平纹'),
    el('option', { value: 'twill21' }, '斜纹 2/1'),
    el('option', { value: 'twill31' }, '斜纹 3/1'),
    el('option', { value: 'twill22' }, '斜纹 2/2'),
    el('option', { value: 'satin5' }, '五枚缎纹'),
    el('option', { value: 'satin8' }, '八枚缎纹'),
  );
  genSelect.onchange = () => {
    const v = genSelect.value;
    if (!v) return;
    if (v === 'plain') p.grid = genPlain(p.width, p.height);
    else if (v === 'twill21') p.grid = genTwill(p.width, p.height, 2, 1);
    else if (v === 'twill31') p.grid = genTwill(p.width, p.height, 3, 1);
    else if (v === 'twill22') p.grid = genTwill(p.width, p.height, 2, 2);
    else if (v === 'satin5') p.grid = genSatin(p.width, p.height, 5, 2);
    else if (v === 'satin8') p.grid = genSatin(p.width, p.height, 8, 3);
    genSelect.value = '';
    commit();
  };

  // 尺寸
  const wInput = numberInput(p.width, 2, 512, (v) => resize(v | 0, p.height));
  const hInput = numberInput(p.height, 2, 512, (v) => resize(p.width, v | 0));

  // 经纬纱选择
  const yarnOpts = (sel: string) => {
    const s = el('select', {});
    for (const y of yarns) s.append(el('option', { value: y.id }, y.name));
    s.value = sel;
    return s;
  };
  const warpSel = yarnOpts(p.warpYarnId);
  warpSel.onchange = () => { p.warpYarnId = warpSel.value; commit(false); };
  const weftSel = yarnOpts(p.weftYarnId);
  weftSel.onchange = () => { p.weftYarnId = weftSel.value; commit(false); };

  toolbar.append(
    el('button', {}, '← 返回'),
    btnWarp, btnWeft,
    mkBtn('取反', () => { for (let i = 0; i < p.grid.length; i++) p.grid[i] ^= 1; commit(); }),
    mkBtn('全经', () => { p.grid.fill(1); commit(); }),
    mkBtn('全纬', () => { p.grid.fill(0); commit(); }),
    mkBtn('右移', () => { shift(1, 0); }),
    mkBtn('下移', () => { shift(0, 1); }),
    genSelect,
    labeled('宽', wInput), labeled('高', hInput),
    labeled('经纱', warpSel), labeled('纬纱', weftSel),
    mkBtn('导出组织图 PNG', exportPNG),
    mkBtn('织物预览 →', () => (location.hash = `#/preview/${p.id}`), ),
  );
  (toolbar.children[0] as HTMLButtonElement).onclick = () => (location.hash = '#/patterns');

  // ===== 编辑画布 =====
  const canvas = el('canvas', { class: 'weave-canvas' });
  const tileCanvas = el('canvas', { class: 'tile-canvas' });
  const statsPanel = el('div', { class: 'stats' });
  const summaryEl = el('div', { class: 'muted' });

  function cellSize() {
    return Math.max(1, Math.min(CELL_MAX, Math.floor(560 / Math.max(p.width, p.height))));
  }

  function draw() {
    const cs = cellSize();
    canvas.width = p.width * cs; canvas.height = p.height * cs;
    const ctx = canvas.getContext('2d')!;
    // 1px/格 离屏, 再放大
    const off = document.createElement('canvas');
    off.width = p.width; off.height = p.height;
    const octx = off.getContext('2d')!;
    const img = octx.createImageData(p.width, p.height);
    for (let i = 0; i < p.grid.length; i++) {
      const on = p.grid[i] === 1;
      img.data[i * 4] = on ? 235 : 38;
      img.data[i * 4 + 1] = on ? 225 : 42;
      img.data[i * 4 + 2] = on ? 200 : 58;
      img.data[i * 4 + 3] = 255;
    }
    octx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
    // 网格线
    if (cs >= 5) {
      ctx.strokeStyle = 'rgba(128,128,128,0.25)';
      ctx.beginPath();
      for (let x = 0; x <= p.width; x++) { ctx.moveTo(x * cs + 0.5, 0); ctx.lineTo(x * cs + 0.5, canvas.height); }
      for (let y = 0; y <= p.height; y++) { ctx.moveTo(0, y * cs + 0.5); ctx.lineTo(canvas.width, y * cs + 0.5); }
      ctx.stroke();
    }
    // 选中列
    ctx.fillStyle = 'rgba(80,160,255,0.18)';
    ctx.fillRect(selCol * cs, 0, cs, canvas.height);
    // 高亮浮长段
    if (highlight) {
      ctx.fillStyle = 'rgba(255,80,80,0.45)';
      ctx.fillRect(selCol * cs, highlight.start * cs, cs, highlight.length * cs);
    }
    drawTile();
    drawStats();
  }

  function drawTile() {
    if (!showTile) { tileCanvas.style.display = 'none'; return; }
    tileCanvas.style.display = '';
    const t = 3; // 3×3 循环
    const cs = Math.max(1, Math.floor(180 / (Math.max(p.width, p.height) * t)));
    tileCanvas.width = p.width * t * cs; tileCanvas.height = p.height * t * cs;
    const ctx = tileCanvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    const off = document.createElement('canvas');
    off.width = p.width; off.height = p.height;
    const octx = off.getContext('2d')!;
    const img = octx.createImageData(p.width, p.height);
    for (let i = 0; i < p.grid.length; i++) {
      const on = p.grid[i] === 1;
      img.data[i * 4] = on ? 235 : 38; img.data[i * 4 + 1] = on ? 225 : 42;
      img.data[i * 4 + 2] = on ? 200 : 58; img.data[i * 4 + 3] = 255;
    }
    octx.putImageData(img, 0, 0);
    for (let ty = 0; ty < t; ty++)
      for (let tx = 0; tx < t; tx++)
        ctx.drawImage(off, tx * p.width * cs, ty * p.height * cs, p.width * cs, p.height * cs);
  }

  function drawStats() {
    const runs = columnFloatRuns(p.grid, p.width, p.height, selCol);
    const sum = floatSummary(p.grid, p.width, p.height);
    summaryEl.textContent =
      `全图: 最大经浮 ${sum.maxWarpFloat} / 最大纬浮 ${sum.maxWeftFloat} · ` +
      `平均经浮 ${sum.avgWarpFloat.toFixed(2)} / 平均纬浮 ${sum.avgWeftFloat.toFixed(2)}`;
    statsPanel.replaceChildren();
    statsPanel.append(el('h3', {}, `第 ${selCol + 1} 根经纱 · 浮长逐格核对`));
    const tbl = el('table', { class: 'runs' });
    tbl.append(el('tr', {}, el('th', {}, '起始行'), el('th', {}, '浮长'), el('th', {}, '类型'), el('th', {}, '格子')));
    statsPanel.append(tbl);
    for (const r of runs) {
      const cells: string[] = [];
      for (let y = r.start; y < r.start + r.length; y++) cells.push(p.grid[y * p.width + selCol] ? '■' : '□');
      const tr = el('tr', {},
        el('td', {}, String(r.start + 1)),
        el('td', {}, String(r.length)),
        el('td', {}, r.type === 'warp' ? '经浮' : '纬浮'),
        el('td', { class: 'cells' }, cells.join('')),
      );
      tr.onclick = () => { highlight = r; draw(); };
      tbl.append(tr);
    }
    // 校验: 浮长段长度之和必须等于组织高度(逐格覆盖, 无重叠无遗漏)
    const total = runs.reduce((s, r) => s + r.length, 0);
    statsPanel.append(el('p', { class: total === p.height ? 'ok' : 'bad' },
      total === p.height ? `✓ 校验通过: ${runs.length} 段浮长合计 ${total} = 组织高度 ${p.height},逐格一致`
                         : `✗ 校验失败: 浮长合计 ${total} ≠ 高度 ${p.height}`));
  }

  // ===== 交互 =====
  let painting = false;
  const toCell = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    const cs = cellSize();
    return {
      x: Math.floor(((e.clientX - r.left) / r.width) * canvas.width / cs),
      y: Math.floor(((e.clientY - r.top) / r.height) * canvas.height / cs),
    };
  };
  const paint = (e: PointerEvent) => {
    const { x, y } = toCell(e);
    if (x < 0 || y < 0 || x >= p.width || y >= p.height) return;
    const v = e.buttons === 2 ? 0 : brush;
    if (p.grid[y * p.width + x] !== v) { p.grid[y * p.width + x] = v; draw(); }
  };
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const { x } = toCell(e);
    if (x >= 0 && x < p.width) { selCol = x; highlight = null; }
    painting = true;
    canvas.setPointerCapture(e.pointerId);
    paint(e);
  });
  canvas.addEventListener('pointermove', (e) => { if (painting) paint(e); });
  canvas.addEventListener('pointerup', () => { painting = false; commit(false); });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  function shift(dx: number, dy: number) {
    const g = new Uint8Array(p.grid.length);
    for (let y = 0; y < p.height; y++)
      for (let x = 0; x < p.width; x++)
        g[((y + dy + p.height) % p.height) * p.width + ((x + dx + p.width) % p.width)] = p.grid[y * p.width + x];
    p.grid = g;
    commit();
  }

  function resize(nw: number, nh: number) {
    const g = new Uint8Array(nw * nh);
    for (let y = 0; y < nh; y++)
      for (let x = 0; x < nw; x++)
        g[y * nw + x] = p.grid[(y % p.height) * p.width + (x % p.width)]; // 循环平铺填充
    p.width = nw; p.height = nh; p.grid = g;
    selCol = Math.min(selCol, nw - 1);
    commit();
  }

  function exportPNG() {
    const scale = 8;
    const cv = document.createElement('canvas');
    cv.width = p.width * scale; cv.height = p.height * scale;
    const ctx = cv.getContext('2d')!;
    const off = document.createElement('canvas');
    off.width = p.width; off.height = p.height;
    const octx = off.getContext('2d')!;
    const img = octx.createImageData(p.width, p.height);
    for (let i = 0; i < p.grid.length; i++) {
      const on = p.grid[i] === 1;
      img.data[i * 4] = on ? 30 : 240; img.data[i * 4 + 1] = on ? 30 : 240;
      img.data[i * 4 + 2] = on ? 30 : 240; img.data[i * 4 + 3] = 255;
    }
    octx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, 0, 0, cv.width, cv.height);
    cv.toBlob((b) => b && downloadBlob(b, `${p.name}-组织图.png`), 'image/png');
  }

  function commit(_redraw = true) {
    upsertPattern(p);
    draw();
  }

  // ===== 布局 =====
  const left = el('div', { class: 'editor-main' },
    el('div', { class: 'canvas-scroll' }, canvas),
    el('label', { class: 'field inline' }),
  );
  const tileToggle = el('input', { type: 'checkbox' });
  tileToggle.checked = showTile;
  tileToggle.onchange = () => { showTile = tileToggle.checked; draw(); };
  (left.lastChild as HTMLElement).append(tileToggle, el('span', {}, ' 3×3 循环平铺预览'));
  left.append(tileCanvas, summaryEl);

  wrap.append(toolbar, el('div', { class: 'editor-cols' }, left, statsPanel));
  root.append(wrap);
  draw();
}
