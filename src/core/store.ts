// 全局状态:花型 / 纱线 / 设置,变更后自动持久化并通知 UI
import type { WeavePattern, Yarn, AppSettings } from './types';
import { createPattern, generatePlain, generateTwill, generateSatin, clonePattern } from './weave';
import {
  loadPatterns,
  savePatterns,
  loadYarns,
  saveYarns,
  loadSettings,
  saveSettings,
} from './storage';
import { uid } from './util';

type Listener = () => void;

export const DEFAULT_SETTINGS: AppSettings = {
  repeatX: 1,
  repeatY: 1,
  tubeSides: 6,
  bgColor: '#1c1f26',
  aoStrength: 0.55,
  twistVisible: true,
  lightAzimuth: 35,
  lightElevation: 55,
  longFloatThreshold: 5,
};

function defaultYarns(): Yarn[] {
  return [
    { id: uid(), name: '真丝 经(米白)', color: '#e8dcc8', thickness: 0.9, twist: 1.2, luster: 0.9, kind: 'filament' },
    { id: uid(), name: '真丝 纬(藏青)', color: '#274060', thickness: 0.95, twist: 1.0, luster: 0.85, kind: 'filament' },
    { id: uid(), name: '棉纱(砖红)', color: '#a44a3f', thickness: 1.1, twist: 2.4, luster: 0.35, kind: 'spun' },
    { id: uid(), name: '涤纶(墨绿)', color: '#2e5e4e', thickness: 0.85, twist: 1.6, luster: 0.7, kind: 'filament' },
  ];
}

function defaultPatterns(yarns: Yarn[]): WeavePattern[] {
  const w = yarns[0].id;
  const f = yarns[1].id;
  const p1 = createPattern(16, 16, '平纹 16×16', w, f);
  p1.cells = generatePlain(16, 16);
  const p2 = createPattern(16, 16, '2/2 斜纹', w, f);
  p2.cells = generateTwill(16, 16, 4, 2, 1);
  const p3 = createPattern(8, 8, '8枚5飞缎纹', w, f);
  p3.cells = generateSatin(8, 8, 8, 5);
  return [p1, p2, p3];
}

class Store {
  patterns: WeavePattern[] = [];
  yarns: Yarn[] = [];
  settings: AppSettings = DEFAULT_SETTINGS;
  activePatternId: string | null = null;
  private listeners = new Set<Listener>();

  init(): void {
    this.yarns = loadYarns() ?? defaultYarns();
    this.patterns = loadPatterns();
    if (this.patterns.length === 0) this.patterns = defaultPatterns(this.yarns);
    const s = loadSettings();
    this.settings = s ? { ...DEFAULT_SETTINGS, ...s } : DEFAULT_SETTINGS;
    this.activePatternId = this.patterns[0]?.id ?? null;
    this.persist();
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    this.persist();
    for (const fn of this.listeners) fn();
  }

  private persist(): void {
    savePatterns(this.patterns);
    saveYarns(this.yarns);
    saveSettings(this.settings);
  }

  get activePattern(): WeavePattern | undefined {
    return this.patterns.find((p) => p.id === this.activePatternId);
  }

  setActive(id: string): void {
    this.activePatternId = id;
    this.emit();
  }

  // ---------- 花型 ----------
  addPattern(p: WeavePattern): void {
    this.patterns = [...this.patterns, p];
    this.activePatternId = p.id;
    this.emit();
  }

  updatePattern(p: WeavePattern): void {
    p.updatedAt = Date.now();
    this.patterns = this.patterns.map((x) => (x.id === p.id ? p : x));
    this.emit();
  }

  /** 原地修改后手动触发(编辑器高频修改用,避免反复拷贝) */
  touch(): void {
    this.emit();
  }

  duplicatePattern(id: string): WeavePattern | undefined {
    const src = this.patterns.find((p) => p.id === id);
    if (!src) return;
    const copy = clonePattern(src);
    this.patterns = [...this.patterns, copy];
    this.activePatternId = copy.id;
    this.emit();
    return copy;
  }

  deletePattern(id: string): void {
    this.patterns = this.patterns.filter((p) => p.id !== id);
    if (this.activePatternId === id) {
      this.activePatternId = this.patterns[0]?.id ?? null;
    }
    this.emit();
  }

  renamePattern(id: string, name: string): void {
    const p = this.patterns.find((x) => x.id === id);
    if (p) {
      p.name = name;
      this.emit();
    }
  }

  importPatterns(incoming: WeavePattern[], importedYarns: Yarn[]): number {
    // 合并纱线(按 id 去重,id 冲突时为导入纱线生成新 id 并重映射)
    const yarnIdMap = new Map<string, string>();
    for (const y of importedYarns) {
      if (this.yarns.some((e) => e.id === y.id)) {
        const newId = uid();
        yarnIdMap.set(y.id, newId);
        this.yarns = [...this.yarns, { ...y, id: newId, name: y.name + '(导入)' }];
      } else {
        this.yarns = [...this.yarns, y];
      }
    }
    const existingIds = new Set(this.patterns.map((p) => p.id));
    for (const p of incoming) {
      if (existingIds.has(p.id)) p.id = uid();
      p.warpYarnId = yarnIdMap.get(p.warpYarnId) ?? p.warpYarnId;
      p.weftYarnId = yarnIdMap.get(p.weftYarnId) ?? p.weftYarnId;
      if (!this.yarns.some((y) => y.id === p.warpYarnId)) p.warpYarnId = this.yarns[0]?.id ?? p.warpYarnId;
      if (!this.yarns.some((y) => y.id === p.weftYarnId)) p.weftYarnId = this.yarns[1]?.id ?? p.weftYarnId;
      this.patterns = [...this.patterns, p];
    }
    if (!this.activePatternId && this.patterns.length) this.activePatternId = this.patterns[0].id;
    this.emit();
    return incoming.length;
  }

  // ---------- 纱线 ----------
  addYarn(y: Yarn): void {
    this.yarns = [...this.yarns, y];
    this.emit();
  }

  updateYarn(y: Yarn): void {
    this.yarns = this.yarns.map((x) => (x.id === y.id ? y : x));
    this.emit();
  }

  deleteYarn(id: string): void {
    this.yarns = this.yarns.filter((y) => y.id !== id);
    this.emit();
  }

  getYarn(id: string): Yarn | undefined {
    return this.yarns.find((y) => y.id === id);
  }

  // ---------- 设置 ----------
  updateSettings(patch: Partial<AppSettings>): void {
    this.settings = { ...this.settings, ...patch };
    this.emit();
  }
}

export const store = new Store();
