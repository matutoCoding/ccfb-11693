// ---------- localStorage 持久化 + 导入导出 ----------
import { Pattern, PatternJSON, Settings, YarnSpec, DEFAULT_SETTINGS, uid } from './types';

const K_PATTERNS = 'jq.patterns';
const K_YARNS = 'jq.yarns';
const K_SETTINGS = 'jq.settings';

function read<T>(key: string, fallback: T): T {
  try {
    const s = localStorage.getItem(key);
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, v: unknown) {
  localStorage.setItem(key, JSON.stringify(v));
}

// ----- 纱线 -----
export function loadYarns(): YarnSpec[] {
  const y = read<YarnSpec[]>(K_YARNS, []);
  if (y.length) return y;
  const def: YarnSpec[] = [
    { id: uid(), name: '本白涤纶经纱', color: '#e8e2d4', thickness: 0.85, twist: 800, gloss: 0.55 },
    { id: uid(), name: '藏青粘胶纬纱', color: '#2b3a67', thickness: 0.9, twist: 600, gloss: 0.35 },
    { id: uid(), name: '金色有光丝', color: '#c9a227', thickness: 0.7, twist: 300, gloss: 0.95 },
  ];
  saveYarns(def);
  return def;
}
export function saveYarns(y: YarnSpec[]) { write(K_YARNS, y); }

// ----- 花型 -----
function gridToB64(g: Uint8Array): string {
  let s = '';
  for (let i = 0; i < g.length; i++) s += String.fromCharCode(g[i]);
  return btoa(s);
}
function b64ToGrid(b: string): Uint8Array {
  const s = atob(b);
  const g = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) g[i] = s.charCodeAt(i) ? 1 : 0;
  return g;
}

export function patternToJSON(p: Pattern): PatternJSON {
  return { ...p, grid: gridToB64(p.grid) };
}
export function patternFromJSON(j: PatternJSON): Pattern {
  const grid = b64ToGrid(j.grid);
  if (grid.length !== j.width * j.height) throw new Error('组织数据长度与尺寸不符');
  return { ...j, grid };
}

export function loadPatterns(): Pattern[] {
  return read<PatternJSON[]>(K_PATTERNS, []).map((j) => {
    try { return patternFromJSON(j); } catch { return null; }
  }).filter((p): p is Pattern => p !== null);
}
export function savePatterns(list: Pattern[]) {
  write(K_PATTERNS, list.map(patternToJSON));
}
export function getPattern(id: string): Pattern | undefined {
  return loadPatterns().find((p) => p.id === id);
}
export function upsertPattern(p: Pattern) {
  const list = loadPatterns();
  const i = list.findIndex((x) => x.id === p.id);
  p.updatedAt = Date.now();
  if (i >= 0) list[i] = p; else list.push(p);
  savePatterns(list);
}
export function deletePattern(id: string) {
  savePatterns(loadPatterns().filter((p) => p.id !== id));
}

// ----- 设置 -----
export function loadSettings(): Settings {
  return { ...DEFAULT_SETTINGS, ...read<Partial<Settings>>(K_SETTINGS, {}) };
}
export function saveSettings(s: Settings) { write(K_SETTINGS, s); }

// ----- 文件导入导出 -----
export function exportPatternFile(p: Pattern) {
  const blob = new Blob([JSON.stringify({ type: 'jacquard-pattern', version: 1, pattern: patternToJSON(p) }, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `${p.name || 'pattern'}.json`);
}

export async function importPatternFile(file: File): Promise<Pattern> {
  const j = JSON.parse(await file.text());
  const pj: PatternJSON = j.type === 'jacquard-pattern' ? j.pattern : j;
  const p = patternFromJSON(pj);
  p.id = uid(); // 避免覆盖已有
  return p;
}

export function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export function storageUsage(): string {
  let n = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)!;
    n += k.length + (localStorage.getItem(k)?.length ?? 0);
  }
  return (n / 1024).toFixed(1) + ' KB';
}

export function clearAll() {
  localStorage.removeItem(K_PATTERNS);
  localStorage.removeItem(K_YARNS);
  localStorage.removeItem(K_SETTINGS);
}
