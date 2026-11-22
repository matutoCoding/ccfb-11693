// 组织图格子编辑器:离屏 ImageData 渲染,支持 512×512 流畅编辑
import type { WeavePattern, FloatRun } from '../core/types';
import { getCell, setCellRaw, wrap } from '../core/weave';
import { runAtCell } from '../core/float';

export type EditTool = 'paint' | 'line' | 'rect' | 'fill' | 'pick';

export interface EditorCallbacks {
  onChange: () => void;
  onHoverInfo?: (info: string) => void;
}

const WARP_COLOR: [number, number, number] = [226, 214, 190];
const WEFT_COLOR: [number, number, number] = [38, 58, 90];
const GRID_LINE = 'rgba(120,128,145,0.35)';
const HIGHLIGHT = 'rgba(255,178,64,0.95)';

export class WeaveEditor {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private offscreen: HTMLCanvasElement;
  private offCtx: CanvasRenderingContext2D;
  private imgData: ImageData | null = null;
  private cellSize = 12;
  private panX = 0;
  private panY = 0;
  private tool: EditTool = 'paint';
  private paintValue: 0 | 1 = 1;
  private drawing = false;
  private dragStart: { c: number; r: number } | null = null;
  private lastPaint: { c: number; r: number } | null = null;
  private hoverCell: { c: number; r: number } | null = null;
  private highlightRun: FloatRun | null = null;
  private tileX = 1;
  private tileY = 1;
  private dirty = true;
  private raf = 0;
  private disposed = false;

  constructor(private pattern: WeavePattern, private cb: EditorCallbacks) {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'weaveCanvas';
    this.ctx = this.canvas.getContext('2d')!;
    this.offscreen = document.createElement('canvas');
    this.offCtx = this.offscreen.getContext('2d', { willReadFrequently: true })!;
    this.fitSize();
    this.bind();
    this.scheduleDraw();
  }

  get element(): HTMLCanvasElement {
    return this.canvas;
  }

  setPattern(p: WeavePattern): void {
    this.pattern = p;
    this.highlightRun = null;
    this.dirty = true;
    this.fitSize();
    this.scheduleDraw();
  }

  setTool(t: EditTool): void {
    this.tool = t;
    this.canvas.style.cursor = t === 'pick' ? 'help' : 'crosshair';
  }

  setPaintValue(v: 0 | 1): void {
    this.paintValue = v;
  }

  setTiling(x: number, y: number): void {
    this.tileX = x;
    this.tileY = y;
    this.dirty = true;
    this.scheduleDraw();
  }

  /** 外部修改 cells 后刷新 */
  refresh(): void {
    this.dirty = true;
    this.scheduleDraw();
  }

  fitSize(): void {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const w = parent.clientWidth - 24;
    const h = parent.clientHeight - 24;
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const totalW = this.pattern.width * this.tileX;
    const totalH = this.pattern.height * this.tileY;
    this.cellSize = Math.max(1, Math.floor(Math.min(w / totalW, h / totalH)));
    const gridW = totalW * this.cellSize;
    const gridH = totalH * this.cellSize;
    this.panX = Math.floor((w - gridW) / 2);
    this.panY = Math.floor((h - gridH) / 2);
  }

  // ---------- 坐标换算 ----------
  private eventToCell(e: PointerEvent): { c: number; r: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left - this.panX;
    const y = e.clientY - rect.top - this.panY;
    if (x < 0 || y < 0) return null;
    const c = Math.floor(x / this.cellSize);
    const r = Math.floor(y / this.cellSize);
    if (c >= this.pattern.width * this.tileX || r >= this.pattern.height * this.tileY) return null;
    return { c: wrap(c, this.pattern.width), r: wrap(r, this.pattern.height) };
  }

  private bind(): void {
    this.canvas.addEventListener('pointerdown', this.onDown);
    this.canvas.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    this.canvas.addEventListener('pointerleave', () => {
      this.hoverCell = null;
      this.dirty = true;
      this.scheduleDraw();
    });
    const ro = new ResizeObserver(() => {
      this.fitSize();
      this.dirty = true;
      this.scheduleDraw();
    });
    if (this.canvas.parentElement) ro.observe(this.canvas.parentElement);
    this.cleanupRO = () => ro.disconnect();
  }

  private cleanupRO: () => void = () => {};

  private onDown = (e: PointerEvent): void => {
    const cell = this.eventToCell(e);
    if (!cell) return;
    this.canvas.setPointerCapture(e.pointerId);
    this.drawing = true;
    this.dragStart = cell;

    if (this.tool === 'paint') {
      const v = e.button === 2 ? (this.paintValue === 1 ? 0 : 1) : this.paintValue;
      this.paintCell(cell.c, cell.r, v);
      this.lastPaint = cell;
    } else if (this.tool === 'pick') {
      const v = getCell(this.pattern, cell.c, cell.r);
      this.paintValue = v;
      this.cb.onHoverInfo?.(`取色:格(${cell.c},${cell.r}) = ${v === 1 ? '经浮点' : '纬浮点'}`);
      this.drawing = false;
    } else if (this.tool === 'fill') {
      this.floodFill(cell.c, cell.r);
      this.cb.onChange();
      this.drawing = false;
    }
  };

  private onMove = (e: PointerEvent): void => {
    const cell = this.eventToCell(e);
    this.hoverCell = cell;
    if (cell) {
      const v = getCell(this.pattern, cell.c, cell.r);
      const run = runAtCell(this.pattern, cell.c, cell.r);
      this.highlightRun = run ?? null;
      this.cb.onHoverInfo?.(
        `格(${cell.c},${cell.r}) ${v === 1 ? '经浮点' : '纬浮点'}` +
          (run ? ` | ${run.kind === 'warp' ? '经' : '纬'}浮长 ${run.length} 根(纱线#${run.yarnIndex})` : ''),
      );
    } else {
      this.highlightRun = null;
    }
    this.dirty = true;
    this.scheduleDraw();

    if (!this.drawing || !cell || !this.dragStart) return;
    if (this.tool === 'paint') {
      this.paintLine(this.lastPaint ?? this.dragStart, cell, this.paintValue);
      this.lastPaint = cell;
      this.cb.onChange();
    }
  };

  private onUp = (e: PointerEvent): void => {
    if (!this.drawing || !this.dragStart) {
      this.drawing = false;
      return;
    }
    const cell = this.eventToCell(e as PointerEvent) ?? this.dragStart;
    if (this.tool === 'line') {
      this.paintLine(this.dragStart, cell, this.paintValue);
      this.cb.onChange();
    } else if (this.tool === 'rect') {
      this.paintRect(this.dragStart, cell, this.paintValue);
      this.cb.onChange();
    }
    this.drawing = false;
    this.dragStart = null;
    this.lastPaint = null;
  };

  // ---------- 编辑操作(全部写回同一份 cells) ----------
  private paintCell(c: number, r: number, v: 0 | 1): void {
    if (getCell(this.pattern, c, r) !== v) {
      setCellRaw(this.pattern, c, r, v);
      this.dirty = true;
      this.scheduleDraw();
    }
  }

  private paintLine(a: { c: number; r: number }, b: { c: number; r: number }, v: 0 | 1): void {
    let c0 = a.c;
    let r0 = a.r;
    const dc = Math.abs(b.c - c0);
    const dr = Math.abs(b.r - r0);
    const sc = b.c >= c0 ? 1 : -1;
    const sr = b.r >= r0 ? 1 : -1;
    let err = dc - dr;
    for (;;) {
      this.paintCell(c0, r0, v);
      if (c0 === b.c && r0 === b.r) break;
      const e2 = 2 * err;
      if (e2 > -dr) {
        err -= dr;
        c0 += sc;
      }
      if (e2 < dc) {
        err += dc;
        r0 += sr;
      }
    }
  }

  private paintRect(a: { c: number; r: number }, b: { c: number; r: number }, v: 0 | 1): void {
    const c0 = Math.min(a.c, b.c);
    const c1 = Math.max(a.c, b.c);
    const r0 = Math.min(a.r, b.r);
    const r1 = Math.max(a.r, b.r);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) this.paintCell(c, r, v);
  }

  private floodFill(c: number, r: number): void {
    const p = this.pattern;
    const target = getCell(p, c, r);
    const replace: 0 | 1 = target === 1 ? 0 : 1;
    const seen = new Uint8Array(p.width * p.height);
    const queue: Array<[number, number]> = [[c, r]];
    while (queue.length) {
      const [x, y] = queue.pop()!;
      const i = y * p.width + x;
      if (seen[i]) continue;
      seen[i] = 1;
      if (p.cells[i] !== target) continue;
      p.cells[i] = replace;
      queue.push([wrap(x + 1, p.width), y], [wrap(x - 1, p.width), y], [x, wrap(y + 1, p.height)], [x, wrap(y - 1, p.height)]);
    }
    this.dirty = true;
    this.scheduleDraw();
  }

  // ---------- 渲染 ----------
  private scheduleDraw(): void {
    if (this.raf || this.disposed) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.draw();
    });
  }

  private draw(): void {
    // dirty 或存在悬停(高亮/光标需要随鼠标刷新)都要重绘
    if (!this.dirty && !this.hoverCell && !this.highlightRun) return;
    this.dirty = false;
    const p = this.pattern;
    const totalW = p.width * this.tileX;
    const totalH = p.height * this.tileY;
    const cs = this.cellSize;

    if (this.offscreen.width !== totalW || this.offscreen.height !== totalH) {
      this.offscreen.width = totalW;
      this.offscreen.height = totalH;
      this.imgData = this.offCtx.createImageData(totalW, totalH);
    }
    const data = this.imgData!.data;
    for (let ty = 0; ty < this.tileY; ty++) {
      for (let tx = 0; tx < this.tileX; tx++) {
        for (let r = 0; r < p.height; r++) {
          for (let c = 0; c < p.width; c++) {
            const v = p.cells[r * p.width + c];
            const col = v ? WARP_COLOR : WEFT_COLOR;
            const x = tx * p.width + c;
            const y = ty * p.height + r;
            const i = (y * totalW + x) * 4;
            data[i] = col[0];
            data[i + 1] = col[1];
            data[i + 2] = col[2];
            data[i + 3] = 255;
          }
        }
      }
    }
    this.offCtx.putImageData(this.imgData!, 0, 0);

    const ctx = this.ctx;
    const cssW = this.canvas.clientWidth;
    const cssH = this.canvas.clientHeight;
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.offscreen, 0, 0, totalW, totalH, this.panX, this.panY, totalW * cs, totalH * cs);

    // 网格线(格太小就省略,避免糊成一团)
    if (cs >= 6) {
      ctx.strokeStyle = GRID_LINE;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let c = 0; c <= totalW; c++) {
        ctx.moveTo(this.panX + c * cs + 0.5, this.panY);
        ctx.lineTo(this.panX + c * cs + 0.5, this.panY + totalH * cs);
      }
      for (let r = 0; r <= totalH; r++) {
        ctx.moveTo(this.panX, this.panY + r * cs + 0.5);
        ctx.lineTo(this.panX + totalW * cs, this.panY + r * cs + 0.5);
      }
      ctx.stroke();
    }

    // 循环边界
    ctx.strokeStyle = 'rgba(91,157,255,0.8)';
    ctx.lineWidth = 2;
    ctx.strokeRect(this.panX, this.panY, p.width * cs, p.height * cs);

    // 浮长高亮
    if (this.highlightRun) {
      const span = this.highlightRun.kind === 'warp' ? p.height : p.width;
      ctx.strokeStyle = HIGHLIGHT;
      ctx.lineWidth = Math.max(2, cs * 0.18);
      for (let k = 0; k < this.highlightRun.length; k++) {
        const t = wrap(this.highlightRun.start + k, span);
        const hc = this.highlightRun.kind === 'warp' ? this.highlightRun.yarnIndex : t;
        const hr = this.highlightRun.kind === 'warp' ? t : this.highlightRun.yarnIndex;
        ctx.strokeRect(this.panX + hc * cs + 1, this.panY + hr * cs + 1, cs - 2, cs - 2);
      }
    }

    // 悬停格
    if (this.hoverCell) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.strokeRect(
        this.panX + this.hoverCell.c * cs + 0.5,
        this.panY + this.hoverCell.r * cs + 0.5,
        cs - 1,
        cs - 1,
      );
    }
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.canvas.removeEventListener('pointerdown', this.onDown);
    this.canvas.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    this.cleanupRO();
  }
}
