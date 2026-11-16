// ---------- WebGL2 织物渲染器: 实例化纱线管 + 各向异性高光 ----------
import { perspective, lookAt, Mat4 } from './mat4';
import { STRIDE } from '../geometry';

const VERT = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;     // 单位管: 沿+Y, 半径1, 长1
layout(location=1) in vec3 aNormal;
layout(location=2) in vec2 aUv;
layout(location=3) in vec4 iA;       // cx, cy, isWarp, elev
layout(location=4) in vec4 iB;       // floatLen, runPos, thickness, gloss

uniform mat4 uProj, uView;

out vec3 vNormal;
out vec3 vTangent;
out vec3 vWorld;
out vec2 vUv;          // x: 沿纱线方向(跨格连续), y: 圆周
out float vFloatLen;
out float vIsWarp;

void main() {
  float r = iB.z;
  float len = 1.04; // 段长略大于格距, 保证浮长连续
  vec3 p = aPos * vec3(r, len, r);
  vec3 n = aNormal;
  vec3 off; vec3 nn; vec3 tangent;
  if (iA.z > 0.5) {           // 经纱: 沿世界Z
    off = vec3(p.x, p.z, p.y);
    nn  = vec3(n.x, n.z, n.y);
    tangent = vec3(0.0, 0.0, 1.0);
  } else {                    // 纬纱: 沿世界X
    off = vec3(p.y, p.z, p.x);
    nn  = vec3(n.y, n.z, n.x);
    tangent = vec3(1.0, 0.0, 0.0);
  }
  vec3 world = vec3(iA.x, iA.w, iA.y);
  vNormal = nn;
  vTangent = tangent;
  vWorld = world + off;
  vUv = vec2((iA.z > 0.5 ? iA.y : iA.x) + aUv.x, aUv.y);
  vFloatLen = iB.x;
  vIsWarp = iA.z;
  gl_Position = uProj * uView * vec4(vWorld, 1.0);
}
`;

const FRAG = `#version 300 es
precision highp float;
in vec3 vNormal;
in vec3 vTangent;
in vec3 vWorld;
in vec2 vUv;
in float vFloatLen;
in float vIsWarp;

uniform vec3 uCamPos;
uniform vec3 uLightDir;      // 指向光源
uniform vec3 uWarpColor, uWeftColor;
uniform vec3 uWarpProps, uWeftProps; // gloss, twistFreq, unused
uniform int uColorMode;      // 0=纱线色 1=浮长热力 2=经纬双色

out vec4 fragColor;

vec3 heat(float t) {
  t = clamp(t, 0.0, 1.0);
  return mix(vec3(0.15,0.3,0.9), vec3(1.0,0.2,0.1), t);
}

void main() {
  vec3 T = normalize(vTangent);
  vec3 N = normalize(vNormal);
  // 捻度: 法线绕纱轴旋转, 形成扭转丝缕
  float twist = vIsWarp > 0.5 ? uWarpProps.y : uWeftProps.y;
  float ang = vUv.x * twist * 6.28318;
  float c = cos(ang), s = sin(ang);
  vec3 N2 = N * c + cross(T, N) * s;
  N = normalize(mix(N, N2, 0.85));

  vec3 L = normalize(uLightDir);
  vec3 V = normalize(uCamPos - vWorld);
  vec3 H = normalize(L + V);

  float gloss = vIsWarp > 0.5 ? uWarpProps.x : uWeftProps.x;
  float shin = mix(10.0, 160.0, gloss);

  // Kajiya-Kay 各向异性高光
  float tdh = dot(T, H);
  float sinTH = sqrt(max(0.0, 1.0 - tdh * tdh));
  float spec = pow(sinTH, shin) * mix(0.25, 1.6, gloss);

  float diff = clamp((dot(N, L) + 0.35) / 1.35, 0.0, 1.0);

  vec3 base;
  if (uColorMode == 0) {
    base = vIsWarp > 0.5 ? uWarpColor : uWeftColor;
  } else if (uColorMode == 1) {
    base = heat((vFloatLen - 1.0) / 7.0); // 浮长 1→蓝, 8+→红
  } else {
    base = vIsWarp > 0.5 ? vec3(0.9,0.85,0.7) : vec3(0.2,0.25,0.35);
  }

  vec3 col = base * (0.18 + 0.82 * diff) + vec3(spec);
  // 边缘轻微压暗, 增强纱线圆浑感
  float rim = pow(1.0 - abs(dot(N, V)), 2.0);
  col *= 1.0 - 0.25 * rim;
  fragColor = vec4(col, 1.0);
}
`;

export interface YarnRenderProps { color: [number, number, number]; gloss: number; twist: number; }

export interface CameraState { theta: number; phi: number; dist: number; }

export class FabricRenderer {
  private gl: WebGL2RenderingContext;
  private canvas: HTMLCanvasElement;
  private prog!: WebGLProgram;
  private vao: WebGLVertexArrayObject | null = null;
  private instBuf: WebGLBuffer | null = null;
  private indexCount = 0;
  private instanceCount = 0;
  private uni: Record<string, WebGLUniformLocation | null> = {};
  camera: CameraState = { theta: -0.6, phi: 0.9, dist: 80 };
  center = [0, 0, 0];
  light = { azimuth: 45, elevation: 55 };
  colorMode = 0;
  warpProps: YarnRenderProps = { color: [0.9, 0.9, 0.85], gloss: 0.5, twist: 5 };
  weftProps: YarnRenderProps = { color: [0.2, 0.25, 0.4], gloss: 0.4, twist: 4 };
  private radial: number;
  private lastInst: { data: Float32Array; w: number; h: number } | null = null;
  dirty = true;

  constructor(canvas: HTMLCanvasElement, radialSegments = 8) {
    this.canvas = canvas;
    this.radial = radialSegments;
    const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: true });
    if (!gl) throw new Error('当前浏览器不支持 WebGL2');
    this.gl = gl;
    this.buildProgram();
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
  }

  private buildProgram() {
    const gl = this.gl;
    const mk = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
        throw new Error('着色器编译失败: ' + gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, mk(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, mk(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS))
      throw new Error('着色器链接失败: ' + gl.getProgramInfoLog(p));
    this.prog = p;
    for (const n of ['uProj', 'uView', 'uCamPos', 'uLightDir', 'uWarpColor', 'uWeftColor', 'uWarpProps', 'uWeftProps', 'uColorMode'])
      this.uni[n] = gl.getUniformLocation(p, n);
  }

  private buildMesh(): { vbo: WebGLBuffer; ibo: WebGLBuffer; count: number } {
    const gl = this.gl;
    const R = this.radial;
    const verts: number[] = [];
    const idx: number[] = [];
    // 两圈(长度不分段), 接缝处复制顶点
    for (let ring = 0; ring < 2; ring++) {
      const y = ring === 0 ? -0.5 : 0.5;
      for (let i = 0; i <= R; i++) {
        const a = (i / R) * Math.PI * 2;
        const cx = Math.cos(a), sz = Math.sin(a);
        verts.push(cx, y, sz, cx, 0, sz, ring, i / R);
      }
    }
    for (let i = 0; i < R; i++) {
      const a = i, b = i + 1, c = i + (R + 1), d = i + 1 + (R + 1);
      idx.push(a, c, b, b, c, d);
    }
    const vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    const ibo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    return { vbo, ibo, count: idx.length };
  }

  /** 上传/更新实例数据, 重建 VAO */
  setInstances(inst: Float32Array, w: number, h: number) {
    this.lastInst = { data: inst, w, h };
    this.center = [w / 2, 0, h / 2];
    this.camera.dist = Math.max(w, h) * 1.1;
    this.rebuild();
  }

  /** 调整渲染质量(径向分段), 用已有实例数据重建 */
  setRadial(n: number) {
    if (n === this.radial || !this.lastInst) return;
    this.radial = Math.max(4, n);
    this.rebuild();
  }
  getRadial() { return this.radial; }

  private rebuild() {
    if (!this.lastInst) return;
    const { data: inst } = this.lastInst;
    const gl = this.gl;
    this.instanceCount = inst.length / STRIDE;

    if (this.vao) gl.deleteVertexArray(this.vao);
    if (this.instBuf) gl.deleteBuffer(this.instBuf);
    const { vbo, ibo, count } = this.buildMesh();
    this.indexCount = count;

    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    const stride = 8 * 4;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, 24);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);

    this.instBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
    gl.bufferData(gl.ARRAY_BUFFER, inst, gl.STATIC_DRAW);
    const is = STRIDE * 4;
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.FLOAT, false, is, 0); gl.vertexAttribDivisor(3, 1);
    gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 4, gl.FLOAT, false, is, 16); gl.vertexAttribDivisor(4, 1);
    gl.bindVertexArray(null);
    this.dirty = true;
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth * dpr | 0;
    const h = this.canvas.clientHeight * dpr | 0;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
      this.dirty = true;
    }
  }

  render() {
    const gl = this.gl;
    if (!this.vao || this.instanceCount === 0) return;
    this.resize();
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0.07, 0.07, 0.09, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);

    const aspect = this.canvas.width / this.canvas.height;
    const proj = perspective(0.7, aspect, 0.5, 4000);
    const { theta, phi, dist } = this.camera;
    const eye = [
      this.center[0] + dist * Math.sin(phi) * Math.sin(theta),
      this.center[1] + dist * Math.cos(phi),
      this.center[2] + dist * Math.sin(phi) * Math.cos(theta),
    ];
    const view = lookAt(eye, this.center, [0, 1, 0]);
    gl.uniformMatrix4fv(this.uni.uProj, false, proj as Mat4);
    gl.uniformMatrix4fv(this.uni.uView, false, view as Mat4);
    gl.uniform3fv(this.uni.uCamPos, eye);

    const az = (this.light.azimuth * Math.PI) / 180;
    const el = (this.light.elevation * Math.PI) / 180;
    gl.uniform3fv(this.uni.uLightDir, [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)]);
    gl.uniform3fv(this.uni.uWarpColor, this.warpProps.color);
    gl.uniform3fv(this.uni.uWeftColor, this.weftProps.color);
    gl.uniform3fv(this.uni.uWarpProps, [this.warpProps.gloss, this.warpProps.twist, 0]);
    gl.uniform3fv(this.uni.uWeftProps, [this.weftProps.gloss, this.weftProps.twist, 0]);
    gl.uniform1i(this.uni.uColorMode, this.colorMode);

    gl.drawElementsInstanced(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0, this.instanceCount);
    gl.bindVertexArray(null);
    this.dirty = false;
  }

  screenshot(filename: string) {
    this.render();
    this.canvas.toBlob((b) => {
      if (!b) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }, 'image/png');
  }

  /** 鼠标交互: 拖拽旋转, 滚轮缩放 */
  attachControls(onChange?: () => void) {
    let dragging = false, lx = 0, ly = 0;
    this.canvas.addEventListener('pointerdown', (e) => {
      dragging = true; lx = e.clientX; ly = e.clientY;
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      this.camera.theta -= (e.clientX - lx) * 0.008;
      this.camera.phi = Math.min(2.9, Math.max(0.2, this.camera.phi - (e.clientY - ly) * 0.008));
      lx = e.clientX; ly = e.clientY;
      this.dirty = true; onChange?.();
    });
    this.canvas.addEventListener('pointerup', () => (dragging = false));
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.camera.dist = Math.min(3000, Math.max(5, this.camera.dist * (1 + Math.sign(e.deltaY) * 0.1)));
      this.dirty = true; onChange?.();
    }, { passive: false });
  }
}
