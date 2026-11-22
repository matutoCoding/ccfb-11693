// 轻量 DOM 构建工具 + 全局提示
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number | boolean | EventListener | undefined | null> = {},
  ...children: Array<Node | string | null | undefined | false>
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else if (k === 'class') {
      node.className = String(v);
    } else if (k === 'html') {
      node.innerHTML = String(v);
    } else {
      node.setAttribute(k, String(v));
    }
  }
  for (const child of children) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

// 短别名(避免与局部变量 h 冲突)
export const h = el;

export function clear(el: HTMLElement): void {
  el.innerHTML = '';
}

let toastTimer = 0;
export function toast(msg: string, duration = 2200): void {
  const old = document.querySelector('.toast');
  if (old) old.remove();
  const el = h('div', { class: 'toast' }, msg);
  document.body.append(el);
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.remove(), duration);
}

export interface ModalHandle {
  close: () => void;
}

export function modal(title: string, content: HTMLElement, width?: number): ModalHandle {
  const mask = h('div', { class: 'modal-mask' });
  const box = h('div', { class: 'modal', style: width ? `width:${width}px` : '' });
  box.append(h('h3', {}, title), content);
  mask.append(box);
  mask.addEventListener('click', (e) => {
    if (e.target === mask) close();
  });
  document.body.append(mask);
  function close(): void {
    mask.remove();
  }
  return { close };
}

export function confirmDialog(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const content = h('div');
    content.append(h('p', { style: 'line-height:1.7' }, message));
    const actions = h('div', { class: 'modal-actions' });
    const cancelBtn = h('button', {}, '取消');
    const okBtn = h('button', { class: 'primary danger' }, '确认删除');
    actions.append(cancelBtn, okBtn);
    content.append(actions);
    const m = modal('请确认', content);
    cancelBtn.addEventListener('click', () => {
      m.close();
      resolve(false);
    });
    okBtn.addEventListener('click', () => {
      m.close();
      resolve(true);
    });
  });
}

/** 组织图缩略图(canvas,经浮=深色格) */
export function patternThumbnail(cells: Uint8Array, w: number, height: number, max = 128): HTMLCanvasElement {
  const scale = Math.max(1, Math.floor(max / Math.max(w, height)));
  const cw = w * scale;
  const ch = height * scale;
  const canvas = h('canvas', { width: cw, height: ch, class: 'thumb' }) as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(cw, ch);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const v = cells[Math.floor(y / scale) * w + Math.floor(x / scale)];
      const i = (y * cw + x) * 4;
      // 经浮点浅色,纬浮点深色
      const shade = v ? 222 : 42;
      img.data[i] = shade;
      img.data[i + 1] = shade;
      img.data[i + 2] = shade + (v ? 12 : 18);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** 组织图导出 PNG(带图例的高清网格图) */
export function exportPatternPNG(
  cells: Uint8Array,
  w: number,
  height: number,
  name: string,
  cellPx = 16,
): string {
  const legendH = 44;
  const canvas = h('canvas', { width: w * cellPx, height: height * cellPx + legendH }) as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < w; c++) {
      ctx.fillStyle = cells[r * w + c] ? '#d9cfbc' : '#22304a';
      ctx.fillRect(c * cellPx, r * cellPx + legendH, cellPx, cellPx);
    }
  }
  ctx.strokeStyle = '#888';
  ctx.lineWidth = 1;
  for (let c = 0; c <= w; c++) {
    ctx.beginPath();
    ctx.moveTo(c * cellPx + 0.5, legendH);
    ctx.lineTo(c * cellPx + 0.5, height * cellPx + legendH);
    ctx.stroke();
  }
  for (let r = 0; r <= height; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * cellPx + legendH + 0.5);
    ctx.lineTo(w * cellPx, r * cellPx + legendH + 0.5);
    ctx.stroke();
  }
  ctx.fillStyle = '#222';
  ctx.font = '16px sans-serif';
  ctx.fillText(`${name}  ${w}×${height}  ■经浮点(经纱在上)  ■纬浮点(纬纱在上)`, 8, 26);
  return canvas.toDataURL('image/png');
}
