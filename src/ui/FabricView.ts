// 可复用的 3D 织物预览组件:封装渲染器、轨道控制、HUD 与几何重建
import { FabricRenderer, type RenderParams } from '../render/FabricRenderer';
import { attachOrbit, type OrbitState } from '../render/orbit';
import { store } from '../core/store';
import { h } from './dom';
import { hexToRgb } from '../core/util';
import type { WeavePattern, Yarn } from '../core/types';

export class FabricView {
  wrap: HTMLElement;
  private renderer: FabricRenderer;
  private canvas: HTMLCanvasElement;
  private hud: HTMLElement;
  private detach: () => void;
  private orbit: OrbitState;
  private pattern: WeavePattern | null = null;
  private warpYarn: Yarn | null = null;
  private weftYarn: Yarn | null = null;
  private lastFpsT = performance.now();
  private frames = 0;
  private fps = 0;
  private unsub: () => void;
  private rebuildTimer = 0;

  constructor() {
    this.wrap = h('div', { class: 'gl-wrap' });
    this.canvas = h('canvas') as HTMLCanvasElement;
    this.hud = h('div', { class: 'hud' });
    this.wrap.append(this.canvas, this.hud);

    this.renderer = new FabricRenderer(this.canvas);
    const s = store.settings;
    this.orbit = {
      azimuth: 25,
      elevation: 55,
      distance: 0,
      lightAzimuth: s.lightAzimuth,
      lightElevation: s.lightElevation,
      mode: 'camera',
    };

    this.detach = attachOrbit(this.canvas, this.orbit, {
      onLightChange: (az, el) => store.updateSettings({ lightAzimuth: az, lightElevation: el }),
    });

    this.unsub = store.subscribe(() => this.scheduleRebuild());
    this.renderer.startLoop(() => this.params());
    this.startFpsMeter();
  }

  private params(): RenderParams {
    const s = store.settings;
    // 每帧同步相机轨道状态;光源以 store 为唯一数据源(滑块和拖动都回写 store)
    this.renderer.azimuth = this.orbit.azimuth;
    this.renderer.elevation = this.orbit.elevation;
    this.renderer.distance = this.orbit.distance;
    this.orbit.lightAzimuth = s.lightAzimuth;
    this.orbit.lightElevation = s.lightElevation;
    return {
      repeatX: s.repeatX,
      repeatY: s.repeatY,
      tubeSides: s.tubeSides,
      bgColor: hexToRgb(s.bgColor),
      aoStrength: s.aoStrength,
      twistVisible: s.twistVisible,
      lightAzimuth: s.lightAzimuth,
      lightElevation: s.lightElevation,
    };
  }

  /** 切换显示的花型(compare 页用) */
  setPattern(p: WeavePattern): void {
    this.pattern = p;
    this.warpYarn = store.getYarn(p.warpYarnId) ?? store.yarns[0] ?? null;
    this.weftYarn = store.getYarn(p.weftYarnId) ?? store.yarns[1] ?? null;
    this.rebuildNow();
  }

  setMode(mode: 'camera' | 'light'): void {
    this.orbit.mode = mode;
    this.canvas.style.cursor = mode === 'light' ? 'cell' : 'grab';
  }

  frame(): void {
    this.renderer.frameView();
    this.orbit.distance = this.renderer.distance;
  }

  screenshot(): string {
    return this.renderer.screenshot();
  }

  /** 组织/纱线高频变化时合并重建,避免拖动画笔卡渲染 */
  private scheduleRebuild(): void {
    if (!this.pattern) return;
    const p = store.activePattern;
    // 当前花型被删除
    if (!store.patterns.some((x) => x.id === this.pattern!.id)) {
      this.pattern = null;
      return;
    }
    window.clearTimeout(this.rebuildTimer);
    this.rebuildTimer = window.setTimeout(() => this.rebuildNow(), 120);
  }

  private rebuildNow(): void {
    if (!this.pattern || !this.warpYarn || !this.weftYarn) return;
    this.renderer.setGeometry(this.pattern, this.warpYarn, this.weftYarn, store.settings.twistVisible);
    this.renderer.frameView();
    this.orbit.distance = this.renderer.distance;
    this.updateHud();
  }

  private startFpsMeter(): void {
    const tick = () => {
      this.frames++;
      const now = performance.now();
      if (now - this.lastFpsT >= 1000) {
        this.fps = Math.round((this.frames * 1000) / (now - this.lastFpsT));
        this.frames = 0;
        this.lastFpsT = now;
        this.updateHud();
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  private updateHud(): void {
    if (!this.pattern) return;
    const fpsClass = this.fps >= 50 ? 'fps-good' : this.fps >= 30 ? 'fps-mid' : 'fps-bad';
    const inst = this.renderer.instanceCount;
    const s = store.settings;
    const totalInst = inst * s.repeatX * s.repeatY;
    this.hud.innerHTML =
      `<b>${this.pattern.name}</b> ${this.pattern.width}×${this.pattern.height}<br>` +
      `实例段 <b>${inst.toLocaleString()}</b>` +
      (s.repeatX * s.repeatY > 1 ? `(平铺后 ${totalInst.toLocaleString()})` : '') +
      `<br>FPS <span class="${fpsClass}"><b>${this.fps}</b></span>` +
      `<br>光源 方位${s.lightAzimuth.toFixed(0)}° 仰角${s.lightElevation.toFixed(0)}°`;
  }

  dispose(): void {
    this.unsub();
    this.detach();
    window.clearTimeout(this.rebuildTimer);
    this.renderer.dispose();
    this.wrap.remove();
  }
}
