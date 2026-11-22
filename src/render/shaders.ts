// GLSL ES 3.00 着色器
// 实例化纱线盒段:每段 8 顶点(顶面4 + 底面4),有真实厚度,下沉纱线的侧壁可见

export const TUBE_VERT = `#version 300 es
precision highp float;

// 基础网格 8 顶点:(edge ±1, t 0/1, top 1/0)
layout(location=0) in vec3 aCorner;      // (edge, t, top)
layout(location=1) in vec4 aInst0;      // (起点格x, 起点格z, 起点高度h0, 半宽w)
layout(location=2) in vec4 aInst1;      // (终点格x, 终点格z, 终点高度h1, 捻度)
layout(location=3) in vec4 aInst2;      // (光泽, 种类0经1纬, 捻纹可见, 厚度)
layout(location=4) in vec4 aInst3;      // 颜色rgb

uniform mat4 uViewProj;
uniform vec2 uGrid;
uniform vec2 uRepeat;
uniform float uCell;

out vec3 vWorldPos;
out vec3 vNormal;
flat out vec3 vColor;
flat out float vLuster;
flat out float vTwist;
flat out float vKind;
flat out float vTwistVis;
out float vEdge;
out float vTop;

void main() {
  float edge = aCorner.x;
  float t = aCorner.y;
  float top = aCorner.z;
  vec2 n = uGrid;

  vec2 g0 = aInst0.xy;
  vec2 g1 = aInst1.xy;

  vec2 gPos = mix(g0, g1, t);
  float h = mix(aInst0.z, aInst1.z, t);
  // 段中点高度取均值:相邻段在格点处高度严格相等,接缝无尖刺
  // (段内为线性过渡,实际屈曲通过段间高度切换自然形成)

  vec2 tangent2 = normalize(g1 - g0);
  vec2 side2 = vec2(-tangent2.y, tangent2.x);
  float halfW = aInst0.w;
  float thickness = aInst2.w;

  vec2 localXZ = gPos + side2 * edge * halfW;
  vec2 tile = floor((g0 / n + g1 / n) * 0.5);

  vec3 world;
  world.x = (localXZ.x - n.x * 0.5 + tile.x * n.x) * uCell * uRepeat.x;
  world.z = (localXZ.y - n.y * 0.5 + tile.y * n.y) * uCell * uRepeat.y;
  // 顶面在 h,底面下沉半厚(0.09 < 层差 0.12,保证上下层不穿插)
  world.y = (h - (1.0 - top) * thickness * 0.09) * uCell;

  // 法线:顶面朝上,侧壁朝水平侧缘
  vec3 nSide = normalize(vec3(side2.x, 0.0, side2.y));
  vec3 normal = top > 0.5
    ? normalize(vec3(0.0, 1.0, 0.0) - nSide * edge * 0.35)
    : nSide * edge;

  vEdge = edge;
  vTop = top;
  vWorldPos = world;
  vNormal = normal;
  vColor = aInst3.rgb;
  vLuster = aInst2.x;
  vTwist = aInst1.w;
  vKind = aInst2.y;
  vTwistVis = aInst2.z;

  gl_Position = uViewProj * vec4(world, 1.0);
}
`;

export const TUBE_FRAG = `#version 300 es
precision highp float;

in vec3 vWorldPos;
in vec3 vNormal;
flat in vec3 vColor;
flat in float vLuster;
flat in float vTwist;
flat in float vKind;
flat in float vTwistVis;
in float vEdge;
in float vTop;

uniform vec3 uLightDir;
uniform vec3 uViewPos;
uniform vec3 uBgColor;
uniform float uAOStrength;

out vec4 outColor;

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(uViewPos - vWorldPos);
  vec3 L = normalize(uLightDir);

  // 捻纹:仅顶面参与,沿纱线轴向的螺旋相位扰动法线
  if (vTop > 0.5 && vTwistVis > 0.5 && vTwist > 0.01) {
    vec3 T = normalize(cross(vec3(0.0, 1.0, 0.0), N));
    if (length(T) < 0.01) T = normalize(cross(vec3(0.0, 0.0, 1.0), N));
    float phase = (vWorldPos.x * (1.0 - vKind) + vWorldPos.z * vKind) * 14.0 * max(vTwist, 0.001);
    float tw = sin(phase + vEdge * 3.14159);
    N = normalize(N + T * tw * 0.10);
  }

  float ndl = max(dot(N, L), 0.0);
  float hemi = N.y * 0.5 + 0.5;
  vec3 ambient = vColor * (0.24 + 0.13 * hemi);
  vec3 diffuse = vColor * (ndl * 0.82 + 0.10);

  // Kajiya-Kay 各向异性高光:只在顶面产生沿纱线轴向拉长的光带,光源转动时光带游走
  vec3 specular = vec3(0.0);
  if (vTop > 0.5) {
    vec3 T = normalize(cross(N, vec3(0.0, 1.0, 0.0)));
    if (length(T) < 0.01) T = normalize(cross(N, vec3(1.0, 0.0, 0.0)));
    vec3 H = normalize(L + V);
    float tdh = dot(T, H);
    float sine = sqrt(clamp(1.0 - tdh * tdh, 0.0, 1.0));
    float specSharp = pow(sine, mix(80.0, 12.0, vLuster));
    float specBroad = pow(sine, mix(20.0, 4.0, vLuster)) * 0.32;
    float facing = 0.55 + 0.45 * ndl;
    vec3 specColor = mix(vec3(1.0), vColor * 0.4 + vec3(0.6), 1.0 - vLuster);
    specular = specColor * (specSharp + specBroad) * vLuster * facing * 1.7;
  }

  float grain = fract(sin(dot(vWorldPos.xz * 91.7, vec2(12.9898, 78.233))) * 43758.5453);
  vec3 color = ambient + diffuse + specular + (grain - 0.5) * 0.022;

  // 侧壁与底面适度压暗,保留颜色以便观察经纬交织
  float wallDark = vTop > 0.5 ? 1.0 : 0.7;
  float ao = clamp(wallDark - (0.5 - N.y * 0.5) * uAOStrength * 0.35, 0.4, 1.0);
  color *= ao;

  outColor = vec4(pow(max(color, vec3(0.0)), vec3(1.0 / 2.2)), 1.0);
}
`;

export const GROUND_VERT = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
uniform mat4 uViewProj;
uniform vec2 uHalf;
uniform float uGroundY;
out vec3 vWorldPos;
void main() {
  vec3 world = vec3(aPos.x * uHalf.x, uGroundY, aPos.y * uHalf.y);
  vWorldPos = world;
  gl_Position = uViewProj * vec4(world, 1.0);
}
`;

export const GROUND_FRAG = `#version 300 es
precision highp float;
in vec3 vWorldPos;
uniform vec3 uBgColor;
uniform vec3 uLightDir;
out vec4 outColor;
void main() {
  vec3 n = vec3(0.0, 1.0, 0.0);
  float ndl = max(dot(n, normalize(uLightDir)), 0.0);
  vec3 c = uBgColor * (0.8 + 0.4 * ndl);
  vec2 g = abs(fract(vWorldPos.xz / 2.0) - 0.5);
  float line = smoothstep(0.48, 0.5, max(g.x, g.y));
  c += vec3(0.04) * line;
  outColor = vec4(pow(c, vec3(1.0 / 2.2)), 1.0);
}
`;
