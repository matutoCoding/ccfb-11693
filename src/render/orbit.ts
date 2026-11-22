// 轨道控制器:左键旋转视角(或光源),滚轮缩放
export type DragMode = 'camera' | 'light';

export interface OrbitState {
  azimuth: number;
  elevation: number;
  distance: number;
  lightAzimuth: number;
  lightElevation: number;
  mode: DragMode;
}

export interface OrbitCallbacks {
  onCameraChange?: () => void;
  onLightChange?: (azimuth: number, elevation: number) => void;
}

export function attachOrbit(
  el: HTMLElement,
  state: OrbitState,
  cb: OrbitCallbacks,
): () => void {
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  const onDown = (e: PointerEvent) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    el.setPointerCapture(e.pointerId);
    el.style.cursor = 'grabbing';
  };

  const onMove = (e: PointerEvent) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;

    if (state.mode === 'light') {
      state.lightAzimuth = (state.lightAzimuth + dx * 0.4 + 360) % 360;
      state.lightElevation = Math.min(85, Math.max(5, state.lightElevation - dy * 0.4));
      cb.onLightChange?.(state.lightAzimuth, state.lightElevation);
    } else {
      state.azimuth = (state.azimuth + dx * 0.35 + 360) % 360;
      state.elevation = Math.min(88, Math.max(2, state.elevation - dy * 0.35));
      cb.onCameraChange?.();
    }
  };

  const onUp = (e: PointerEvent) => {
    dragging = false;
    el.style.cursor = 'grab';
    try {
      el.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const factor = Math.exp(e.deltaY * 0.001);
    state.distance = Math.min(4000, Math.max(4, state.distance * factor));
    cb.onCameraChange?.();
  };

  el.style.cursor = 'grab';
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  el.addEventListener('wheel', onWheel, { passive: false });

  return () => {
    el.removeEventListener('pointerdown', onDown);
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerup', onUp);
    el.removeEventListener('pointercancel', onUp);
    el.removeEventListener('wheel', onWheel);
  };
}
