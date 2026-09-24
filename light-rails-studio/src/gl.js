/* ── Pattern Forge · WebGL rail engine ───────────────────────
   Per-pixel SDF shading for the continuous "rail family" patterns.
   Each mode reduces the pixel to a rail coordinate u (rails sit at a
   regular step in |u|) and a flow coordinate v (0..1 along the shape),
   then one shared pipeline does comb shading, the travelling gradient,
   the trails envelope, edge body + rim + bloom, tone mapping and grain.
──────────────────────────────────────────────────────────── */

const VERT = `
attribute vec2 aP;
void main() { gl_Position = vec4(aP, 0.0, 1.0); }
`

const FRAG = `
#extension GL_OES_standard_derivatives : enable
precision highp float;
#define TAU 6.2831853

uniform vec2  uRes;
uniform float uT;         // seconds (speed applied)
uniform float uPhase;     // t / period, wraps
uniform int   uMode;
uniform int   uMotion;    // 0 trails · 1 solid · 2 pulse
uniform vec3  uStops[6];
uniform int   uNStops;
uniform vec3  uBg;

uniform float uLines, uEdge, uBase, uSpan, uFlare, uWarpA, uWarpB;
uniform float uStroke, uCore;
uniform vec2  uSeam;      // depth, width
uniform vec4  uPa, uPb;   // per-mode extras

uniform vec4  uRun;       // speed, stretch, spread, jitter
uniform float uHold;      // trail hold
uniform vec4  uEnvT;      // lifetime, rise, fallStart, topLag
uniform vec4  uLook;      // gain, bloom, blowout, blur
uniform float uAngle, uSway, uGrain, uHollow;

float h1(float n) { return fract(sin(n * 127.1 + 311.7) * 43758.5453); }
vec3 tanh3(vec3 x) {
  vec3 e = exp(2.0 * clamp(x, -20.0, 20.0));
  return (e - 1.0) / (e + 1.0);
}
/* smoothstep that also accepts reversed edges (edge0 > edge1) */
float ssg(float e0, float e1, float x) {
  float t = clamp((x - e0) / (e1 - e0), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}
/* flat palette pick — exact stop, no blending */
vec3 pickStop(float k) {
  vec3 c = uStops[0];
  for (int i = 0; i < 6; i++) {
    if (float(i) == k) c = uStops[i];
  }
  return c;
}

/* value noise + fbm for the fluid modes */
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = h1(dot(i, vec2(1.0, 57.0)));
  float b = h1(dot(i + vec2(1.0, 0.0), vec2(1.0, 57.0)));
  float c = h1(dot(i + vec2(0.0, 1.0), vec2(1.0, 57.0)));
  float d = h1(dot(i + vec2(1.0, 1.0), vec2(1.0, 57.0)));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    s += a * vn(p);
    p = p * 2.02 + vec2(17.0, 9.0);
    a *= 0.5;
  }
  return s;
}

/* ── mode 37 · relief waves — embossed ridge field with bump lighting,
   built from a reference image (dark 3D wavy ridges). ── */
float reliefH(vec2 q, float t) {
  float w = fbm(q * uPa.y + vec2(t * 0.15, 0.0));
  float w2 = fbm(q * uPa.y * 0.5 - vec2(0.0, t * 0.1) + 7.3);
  float band = sin((q.y + w * uPb.y * 2.0 + w2 * 1.2 + q.x * 0.3) * uPa.z * 6.2832);
  float ridge = pow(1.0 - abs(band), max(uPb.x, 0.2));
  return ridge * 0.6 + w * 0.8;
}

/* ── mode 40 · petal bloom — raymarched spiral sheets (C4D-style
   bloom render): thin vertical ribbons on a log-spiral, rounded wavy
   top edges, stacked occlusion. Built from a reference image. ── */
float roseMap(vec3 q3, float t) {
  float r = length(q3.xz) + 1e-4;
  float th = atan(q3.z, q3.x);
  /* freeze the spiral below an inner radius — a raw log-spiral gets
     infinitely dense at the centre and shatters the marcher */
  float rc = max(r, 0.34);
  float s = uPa.y * th / TAU + uPb.x * log(rc) - t;
  /* organic wander: LOW-frequency smooth noise so folds stay silky */
  float wob2 = vn(q3.xz * 0.85 + vec2(0.0, q3.y * 0.8)) * 0.7
             + vn(q3.xz * 1.7 + vec2(4.7)) * 0.3;
  s += uWarpB * (wob2 - 0.5) * 2.6;
  float cell = floor(s + 0.5);
  float ds = s - cell;
  /* arm identity is invariant across the atan branch cut (cell jumps by
     exactly n there); anything per-sheet must use it, or the sheet tears
     along one radial seam */
  float nArms = max(floor(uPa.y + 0.5), 1.0);
  float armId = mod(cell, nArms);
  float grad = sqrt(pow(uPa.y / TAU, 2.0) + uPb.x * uPb.x) / rc
             + uWarpB * 3.2;                        // noise slope keeps SDF honest
  float dSheet = (abs(ds) - uPb.z * 0.5) / max(grad, 0.15);
  float top = 1.05 - r * 0.24
            + uWarpA * 0.38 * sin(armId * 2.4 + r * 2.2 - t * 1.2)
            + 0.14 * sin(th * 2.0 + armId * 1.7)
            - smoothstep(0.65, 0.30, r) * 0.38;   // dip under the core dome
  vec2 w = vec2(dSheet, q3.y - top);
  float rnd = max(uStroke, 0.02);
  float d = min(max(w.x, w.y), 0.0) + length(max(w, vec2(0.0))) - rnd;
  d = max(d, 0.28 - r);               // sheets stop short of the centre
  d = max(d, -(q3.y + 0.9));          // base cut
  d = max(d, r - 2.6);                // outer bound
  /* solid rounded core caps the eye of the bloom */
  vec3 cq = vec3(q3.x, (q3.y - 0.28) * 0.72, q3.z);
  float coreD = length(cq) - 0.46;
  float k = 0.14;
  float hh = clamp(0.5 + 0.5 * (coreD - d) / k, 0.0, 1.0);
  d = mix(coreD, d, hh) - k * hh * (1.0 - hh);
  return d;
}

/* ── mode 42 · cloth stack — parallel fabric sheets with air gaps,
   draped and crumpled like distorted cloth. ── */
float clothMap(vec3 q3, float t) {
  float gap = max(uPb.y, 0.25);
  float cell = floor(q3.z / gap + 0.5);
  float dz = q3.z - cell * gap;
  /* cloth bend: big drape + low-freq crumple, per-sheet phase */
  float bend = uWarpB * 0.45 * sin(q3.x * 0.8 + cell * 2.1 + t * 0.7)
             + uWarpB * 0.55 * (vn(vec2(q3.x * 0.55 + cell * 7.3, q3.y * 0.65 + t * 0.2)) - 0.5);
  dz += bend;
  float slope = 1.0 + uWarpB * 1.7;
  float dSheet = (abs(dz) - max(uPb.z, 0.01)) / slope;
  /* rolling top edge, back sheets rise higher */
  float h = 0.30 + cell * 0.14
          + uWarpA * (0.55 * sin(q3.x * uPa.z + cell * 1.9 + t)
                      + 0.30 * (vn(vec2(q3.x * 0.6 + cell * 3.1, 2.7)) - 0.5) * 2.0);
  vec2 w2 = vec2(dSheet, q3.y - h);
  float rnd = max(uStroke, 0.02);
  float d = min(max(w2.x, w2.y), 0.0) + length(max(w2, vec2(0.0))) - rnd;
  d = max(d, -(q3.y + 1.4));
  d = max(d, abs(q3.x) - 4.5);
  d = max(d, abs(q3.z) - 4.0);
  return d;
}

/* ── mode 39 · glossy 3D tubes & spheres, from a reference image ── */
float t3Map(vec3 q, float t) {
  vec2 c1 = vec2(sin(q.x * 0.7 + t) * 0.9 + sin(q.x * 0.31 - t * 0.7) * 0.5,
                 cos(q.x * 0.5 + t * 0.8) * 0.7);
  float d = length(q.yz - c1) - uPb.x;
  vec2 c2 = vec2(sin(q.y * 0.65 - t * 0.9) * 0.9 + cos(q.y * 0.27 + t) * 0.4,
                 sin(q.y * 0.45 + t * 1.1) * 0.8);
  float d2 = length(vec2(q.x, q.z) - c2) - uPb.x * 0.85;
  float k = max(uPb.y, 0.02);
  float hh = clamp(0.5 + 0.5 * (d2 - d) / k, 0.0, 1.0);
  d = mix(d2, d, hh) - k * hh * (1.0 - hh);
  for (int i = 0; i < 7; i++) {
    if (float(i) >= uPa.z) break;
    float fi = float(i);
    vec3 sp = vec3(
      sin(t * 0.3 + fi * 2.1) * (1.5 + h1(fi * 3.3)),
      cos(t * 0.23 + fi * 1.4) * (1.2 + h1(fi * 7.1)),
      sin(t * 0.27 + fi * 3.7) * 1.2);
    float r = (0.15 + h1(fi * 5.7) * 0.35) * uPb.z;
    float ds = length(q - sp) - r;
    hh = clamp(0.5 + 0.5 * (ds - d) / 0.15, 0.0, 1.0);
    d = mix(ds, d, hh) - 0.15 * hh * (1.0 - hh);
  }
  return d;
}

/* ── mode 35 · adapted from "Ether" by nimitz (2014),
   shadertoy.com/view/MsjSW3 — CC BY-NC-SA 3.0: attribution required,
   non-commercial, share-alike. Twisted sine-field volume march. ── */
float eMap(vec3 q, float tt) {
  float c1 = cos(tt * 0.4), s1 = sin(tt * 0.4);
  q.xz = mat2(c1, -s1, s1, c1) * q.xz;
  float c2 = cos(tt * 0.3), s2 = sin(tt * 0.3);
  q.xy = mat2(c2, -s2, s2, c2) * q.xy;
  vec3 w = q * 2.0 + tt;
  return length(q + vec3(sin(tt * 0.7))) * log(length(q) + 1.0)
       + sin(w.x + sin(w.z + sin(w.y))) * 0.5 - 1.0;
}

/* ── mode 29 · adapted from "Saturday weirdness" by mrange (CC0),
   shadertoy.com/view/43jXWt — raymarched superquadric on a glowing
   stage. Self-feedback texture replaced with a procedural palette
   swirl; uPb.y = ball size. ── */
mat3 gWRot;
vec3 gLC0, gLC1, gBB, gTB, gSun;
float wSphere4(vec3 q, float r) { q *= q; return pow(dot(q, q), 0.25) - r; }
float wDf(vec3 q) { return wSphere4(q * gWRot, uPb.y); }
float wMarch(vec3 ro, vec3 rd) {
  float t = 0.0;
  vec2 dti = vec2(1e10, 0.0);
  bool broke = false;
  for (int i = 0; i < 80; i++) {
    float d = wDf(ro + rd * t);
    if (d < dti.x) dti = vec2(d, t);
    if (d < 0.0001 || t > 10.0) { broke = true; break; }
    t += d;
  }
  if (!broke) t = dti.y;
  return t;
}
vec3 wNorm(vec3 pos) {
  vec2 e = vec2(0.005, 0.0);
  return normalize(vec3(
    wDf(pos + e.xyy) - wDf(pos - e.xyy),
    wDf(pos + e.yxy) - wDf(pos - e.yxy),
    wDf(pos + e.yyx) - wDf(pos - e.yyx)));
}
float wBox2(vec2 q, vec2 b) {
  vec2 d = abs(q) - b;
  return length(max(d, vec2(0.0))) + min(max(d.x, d.y), 0.0);
}
float wPlane(vec3 ro, vec3 rd, vec4 pl) { return -(dot(ro, pl.xyz) + pl.w) / dot(rd, pl.xyz); }
vec3 wBgCol(vec3 ro, vec3 rd) {
  vec3 col = vec3(0.0);
  vec3 lp0 = 4.0 * vec3(1.0, 1.0, -2.0), lp1 = 2.0 * vec3(-1.0, -1.0, -2.0);
  vec3 ld0 = normalize(lp0 - ro), ld1 = normalize(lp1 - ro);
  float tp0 = wPlane(ro, rd, vec4(0.0, -1.0, 0.0, -5.0));
  float tp1 = wPlane(ro, rd, vec4(0.0, -1.0, 0.0, 6.0));
  if (tp0 > 0.0) col += gBB * exp(-0.5 * length((ro + tp0 * rd).xz));
  if (tp1 > 0.0) {
    vec3 pos = ro + tp1 * rd;
    float db = wBox2(pos.xz, vec2(5.0, 9.0)) - 3.0;
    col += gTB * rd.y * rd.y * smoothstep(0.25, 0.0, db);
    col += 0.2 * gTB * exp(-0.5 * max(db, 0.0));
    col += 0.05 * sqrt(gTB) * max(-db, 0.0);
  }
  col += 1e-2 * gLC0 / (1.002 - dot(ld0, rd));
  col += 2e-2 * gLC1 / (1.005 - dot(ld1, rd));
  col += gSun / (1.001 - dot(vec3(0.0, 0.0, 1.0), rd));
  return col;
}

/* ── mode 28 · adapted from "Undulating Urchin" by ChunderFPV,
   shadertoy.com/view/332XWd — polar tube urchin SDF. round() emulated
   for GLSL ES 1.00; uPb.x = amplitude. ── */
float urMap(vec3 u, float v, float t) {
  float f = 1e10, y, z;
  u.xy = vec2(atan(u.x, u.y), length(u.xy));
  u.x += t * v * 3.1416 * 0.7;
  for (int i = 1; i <= 5; i++) {
    vec3 q = u;
    float fi = float(i);
    y = floor((q.y - fi) / 5.0 + 0.5) * 5.0 + fi;
    q.x *= y;
    q.x -= y * y * t * 3.1416;
    q.x -= floor(q.x / 6.2832 + 0.5) * 6.2832;
    q.y -= y;
    z = cos(y * t * 6.2832) * 0.5 + 0.5;
    f = min(f, max(length(q.xy), -q.z - z * uPb.x) - 0.1 - z * 0.2 - q.z / 1e2);
  }
  return f;
}

/* ── mode 25 · adapted from "Taste of Noise 7" by Leon Denise (2021),
   shadertoy.com/view/NddSWs — organic KIFS raymarch; uses hash by
   Dave Hoskins and smin by Inigo Quilez. Adapted: no temporal buffer,
   static dither, palette-driven colours. ── */
float gMat, gRng;
float h13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
mat2 rot2(float a) { return mat2(cos(a), -sin(a), sin(a), cos(a)); }
float tnMap(vec3 p) {
  float t = uT * uPa.w + gRng * 0.9;
  float grid = max(uPb.x, 1.0);
  vec3 cell = floor(p / grid);
  p = mod(p, grid) - grid * 0.5;
  float dp = length(p);
  vec3 angle = vec3(0.1, -0.5, 0.1) + dp * 0.5 + p * 0.1 + cell;
  float size = sin(gRng * 3.14);
  float wave = sin(-dp + t + h13(cell) * 6.28) * uPb.y;
  float a = 1.0;
  float scene = 1000.0, shape = 1000.0;
  for (int i = 0; i < 4; i++) {
    p.xz = abs(p.xz) - (0.5 + wave) * a;
    p.xz = rot2(angle.y / a) * p.xz;
    p.yz = rot2(angle.x / a) * p.yz;
    p.yx = rot2(angle.z / a) * p.yx;
    shape = length(p) - 0.2 * a * size;
    gMat = mix(gMat, float(i), clamp(0.5 + 0.5 * (scene - shape) / (0.3 * a), 0.0, 1.0));
    float hh = clamp(0.5 + 0.5 * (shape - scene) / a, 0.0, 1.0);
    scene = mix(shape, scene, hh) - a * hh * (1.0 - hh);
    a /= 1.9;
  }
  return scene;
}

/* palette lookup, clamped */
vec3 gradient(float t) {
  float f = clamp(t, 0.0, 1.0) * float(uNStops - 1);
  vec3 c = uStops[0];
  for (int i = 0; i < 5; i++) {
    if (i >= uNStops - 1) break;
    c = mix(c, uStops[i + 1], clamp(f - float(i), 0.0, 1.0));
  }
  return c;
}

/* wrapping palette for the run: eased per segment so stops hold as plateaus */
vec3 cyc(float t) {
  float f = fract(t) * float(uNStops);
  float i = floor(f);
  float w = f - i;
  w = w * w * (3.0 - 2.0 * w);
  vec3 a = uStops[0], b = uStops[0];
  for (int k = 0; k < 6; k++) {
    if (float(k) == i) a = uStops[k];
    if (float(k) == i + 1.0) b = uStops[k];
  }
  if (i + 1.0 >= float(uNStops)) b = uStops[0];
  return mix(a, b, w);
}

void main() {
  vec2 frag = gl_FragCoord.xy / uRes;
  float v = 1.0 - frag.y;                 // 0 top → 1 bottom
  float aspect = uRes.x / uRes.y;
  float x = (frag.x - 0.5) * aspect;      // height units

  x -= uSway * sin(uT * 0.55 + v * 2.4) * (0.35 + 0.65 * v);

  if (abs(uAngle) > 1e-4) {
    float cA = cos(uAngle), sA = sin(uAngle);
    vec2 rp = vec2(cA * x - sA * (v - 0.5), sA * x + cA * (v - 0.5));
    x = rp.x;
    v = rp.y + 0.5;
  }

  /* ── fluid modes (20+): direct colour, no rail comb ───── */
  if (uMode >= 20) {
    vec2 p = vec2(x, v - 0.5);
    vec3 fcol = uBg;
    float e = 1.0;
    if (uMotion != 1) {
      float eph = fract(uPhase);
      float duty = clamp(uEnvT.x, 0.05, 1.0);
      float fall = min(uEnvT.z, duty - 0.01);
      float ett = clamp((eph - fall) / max(duty - fall, 1e-3), 0.0, 1.0);
      e = smoothstep(0.0, max(uEnvT.y, 0.004), eph) * pow(1.0 - ett, 2.4);
      e = mix(e, 1.0, clamp(uHold, 0.0, 1.0));
    }

    if (uMode == 20) {                     /* liquid marble */
      vec2 q = p * uPa.x;
      float t2 = uT * uPa.w;
      vec2 w = vec2(fbm(q + vec2(t2 * 0.6, 0.0)),
                    fbm(q + vec2(5.2, t2 * 0.4)));
      float n = fbm(q + uPa.y * 2.5 * w);
      float band = sin((p.x + p.y * 0.7) * uPa.z * 3.0 + n * 6.2832 + uPhase * TAU);
      float m = 0.5 + 0.5 * band;
      m = mix(m, smoothstep(0.5 - 0.5 * (1.0 - uPb.x), 0.5 + 0.5 * (1.0 - uPb.x), m), uPb.x);
      fcol = cyc(m * 0.98 + uPhase * uRun.x * 0.2);
      fcol += fcol * pow(fbm(q * 2.0 + w * 3.0), 3.0) * uPb.y;

    } else if (uMode == 21) {              /* flow field · silk streams */
      float t2 = uT * uPa.w;
      vec2 dir = vec2(cos(uWarpA), sin(uWarpA));
      vec2 q = p * uPa.x;
      float n1 = fbm(q * 1.5 + dir * t2);
      float n2 = fbm(q * 0.7 - dir * t2 * 0.6 + 11.3);
      float lane = dot(p, vec2(-dir.y, dir.x)) * uPa.z * 6.0 + (n1 - 0.5) * uPa.y * 9.0;
      float stripe = sin(lane - t2 * 2.0);
      float m = 0.5 + 0.5 * stripe;
      m = smoothstep(0.5 - uPb.x, 0.5 + uPb.x, m);
      fcol = cyc(m * 0.45 + n2 * 0.5 + uPhase * uRun.x * 0.15);
      fcol += vec3(1.0) * pow(max(0.0, 1.0 - abs(stripe)), 6.0) * uCore * 0.6;

    } else if (uMode == 22) {              /* meta-blobs · liquid metaballs */
      float field = 0.0, wsum = 0.0;
      vec3 acc = vec3(0.0);
      for (int i = 0; i < 10; i++) {
        if (float(i) >= uPa.x) break;
        float fi = float(i);
        vec2 c = vec2(
          sin(uT * (0.30 + h1(fi * 3.1) * 0.5) * uPa.w + fi * 2.4) * 0.40,
          cos(uT * (0.23 + h1(fi * 7.7) * 0.5) * uPa.w + fi * 1.7) * 0.40);
        float r = uPa.y * (0.6 + h1(fi * 5.3) * 0.8);
        float d2 = max(dot(p - c, p - c), 1e-5);
        float f = r * r / d2;
        field += f;
        acc += gradient(h1(fi * 9.7)) * f;
        wsum += f;
      }
      vec3 bcol = acc / max(wsum, 1e-4);
      float iso = smoothstep(uPa.z, uPa.z + max(uPb.x, 0.02), field);
      float rim = smoothstep(uPa.z * 0.75, uPa.z, field)
                * (1.0 - smoothstep(uPa.z, uPa.z * 2.2, field));
      fcol = mix(uBg, bcol, iso);
      fcol += bcol * rim * 0.8;
      fcol += vec3(1.0) * rim * uCore * 0.5;

    } else if (uMode == 24) {              /* lava lamp · gooey rising blobs */
      float field = 0.0;
      for (int i = 0; i < 8; i++) {
        if (float(i) >= uPa.x) break;
        float fi = float(i);
        float rnd = h1(fi * 13.7);
        float spd = (0.05 + rnd * 0.10) * uPa.w;
        float ph = fract(uT * spd + rnd);
        float yy = 0.62 - ph * 1.24;                       // rise bottom → top
        float xx = (h1(fi * 5.1) - 0.5) * 0.8
                 + sin(uT * (0.10 + rnd * 0.15) + fi * 2.3) * 0.12;
        float r = uPa.y * (0.55 + 0.45 * sin(ph * 3.14159)) * (0.7 + rnd * 0.6);
        vec2 d = p - vec2(xx, yy);
        d.y *= uPb.y;                                      // squash → gooey ovals
        field += r * r / max(dot(d, d), 1e-5);
      }
      /* molten pool at the bottom the blobs detach from */
      field += uPa.z * smoothstep(0.28, 0.55, p.y) * 2.2;
      float soft = max(uPb.x, 0.03);
      float m = smoothstep(1.0 - soft, 1.0 + soft, field);
      float heat = clamp((field - 1.0) / 3.0, 0.0, 1.0);
      /* cool rim → hot core straight through the palette */
      vec3 body = gradient(clamp(1.0 - heat * 1.15, 0.0, 1.0));
      fcol = mix(uBg, body, m);
      fcol += gradient(0.0) * pow(heat, 1.6) * m * uCore * 1.4;   // molten core
      fcol += vec3(1.0) * pow(heat, 3.5) * m * uCore * 0.5;       // white-hot centre
      fcol += body * smoothstep(0.45, 1.0, field) * (1.0 - m) * 0.35; // soft halo

    } else if (uMode == 25) {              /* taste-of-noise · Leon Denise port */
      gMat = 0.0;
      gRng = h13(vec3(gl_FragCoord.xy, 7.7));
      vec3 eye = vec3(1.0, 1.0, 1.0) * max(uPa.z, 0.2);
      vec3 zz = normalize(-eye);
      vec3 xx = normalize(cross(zz, vec3(0.0, 1.0, 0.0)));
      vec3 yy = cross(xx, zz);
      vec3 ray = normalize(zz + p.x * xx + p.y * yy);
      vec3 pos3 = eye;
      float mx = uPa.x * 6.2832, my = uPa.y * 6.2832;
      ray.xz = rot2(mx) * ray.xz; pos3.xz = rot2(mx) * pos3.xz;
      ray.xy = rot2(my) * ray.xy; pos3.xy = rot2(my) * pos3.xy;
      const float steps = 36.0;
      float sIdx = steps;
      for (int i = 0; i < 36; i++) {
        float dist = tnMap(pos3);
        if (dist < 0.01) break;
        pos3 += ray * dist * (0.92 + 0.08 * gRng);
        sIdx -= 1.0;
      }
      float shade = sIdx / steps;
      vec2 o2 = vec2(0.001, 0.0);
      vec3 nrm = normalize(tnMap(pos3) - vec3(
        tnMap(pos3 - o2.xyy), tnMap(pos3 - o2.yxy), tnMap(pos3 - o2.yyx)));
      vec3 tint = cyc(gMat * 0.1 + length(pos3) * 0.06 + uPhase * uRun.x * 0.1);
      float ld = dot(reflect(ray, nrm), vec3(0.0, 1.0, 0.0)) * 0.5 + 0.5;
      vec3 light = gradient(0.0) * sqrt(ld) * 0.6;
      ld = dot(reflect(ray, nrm), vec3(0.0, 0.0, -1.0)) * 0.5 + 0.5;
      light += gradient(1.0) * sqrt(ld) * 0.3;
      fcol = (tint * uCore * 1.6 + light) * shade;

    } else if (uMode == 26) {
      /* adapted from "Pretty Hip" by Hadyn · shadertoy.com/view/XsBfRW —
         rotated tile grid with a radiating invert wave; colours remapped
         to the active palette */
      vec2 uv = p;
      float ra = uWarpA;
      uv = mat2(cos(ra), -sin(ra), sin(ra), cos(ra)) * uv;
      vec2 pos = uPa.x * uv;
      vec2 rep = fract(pos);
      float dist = 2.0 * min(min(rep.x, 1.0 - rep.x), min(rep.y, 1.0 - rep.y));
      float sqd = length(floor(pos) + vec2(0.5));
      float edge = (uT * uPa.w - sqd * uPa.y) * 0.5;
      edge = 2.0 * fract(edge * 0.5);
      float value = fract(dist * 2.0);
      value = mix(value, 1.0 - value, step(1.0, edge));
      edge = pow(abs(1.0 - edge), 2.0);
      value = smoothstep(edge - max(uPb.x, 0.005), edge, 0.95 * value);
      value += sqd * 0.1 * uPa.z;
      float vv = clamp(value, 0.0, 1.0);
      fcol = mix(gradient(0.0), gradient(1.0), vv);
      fcol = mix(fcol, cyc(vv * 0.5 + uPhase * uRun.x * 0.25), clamp(uRun.x * 0.25, 0.0, 0.6));

    } else if (uMode == 27) {
      /* adapted from "Cyana" by muragustina · shadertoy.com/view/7cVXzK —
         vortex nebula glow; loop made constant-bound for GLSL ES 1.00,
         breath made periodic, colours remapped to the active palette */
      vec2 pos0 = p;
      vec2 u2 = p * uPa.x;
      float t2 = uT * uPa.w * 0.4;
      float breath = uPb.y + 0.15 * sin(uT * 0.3);
      u2 *= 1.2 - breath * 0.555;
      float dc = length(u2);
      float va = exp(-dc * 4.0) * sin(t2 * 1.5) * 1.2 * uPa.y;
      u2 = mat2(cos(va), -sin(va), sin(va), cos(va)) * u2;
      vec3 acc = vec3(0.0);
      float ang2 = 8.4;
      mat2 rr = mat2(cos(ang2), -sin(ang2), sin(ang2), cos(ang2));
      vec3 colA2 = gradient(0.2);
      vec3 colB2 = gradient(0.9);
      vec3 colCore2 = gradient(0.0) * 1.8;
      vec3 colDust2 = gradient(0.55) + vec3(0.4);
      for (int i = 0; i < 60; i++) {
        if (float(i) >= uPa.z * 60.0) break;
        float fi = float(i);
        vec2 flow = vec2(
          atan(u2.y + t2 + fi * 0.08) * 0.045,
          sin(u2.x * 4.0 - t2 * 1.2 + fi * 0.06) * 0.045);
        u2 += flow * (0.6 + dc * 1.2);
        u2 = rr * u2;
        u2 *= 1.05 + sin(fi * 0.25 + t2 * 2.0) * 0.006;
        vec2 pp = u2 - vec2(0.5 + breath * 0.1, tan(t2 * 0.8 + fi * 0.03) * 0.1);
        float d = length(vec2(pp.x * uPb.x, pp.y * 0.2));
        float glow2 = 0.002 / (d * d + 0.001) * (0.5 + breath * 0.7);
        vec3 pal = mix(colA2, colB2, atan(fi * 0.15 + t2 + length(u2)) * 0.5 + 0.5);
        float core2 = smoothstep(0.15, 0.0, d);
        pal = mix(pal, colCore2, clamp(core2 * (1.0 + breath * 1.5), 0.0, 1.0));
        acc += glow2 * pal * exp2(-length(u2) * 1.6);
      }
      float dust = 0.0;
      mat2 rd = mat2(cos(t2), -sin(t2), sin(t2), cos(t2));
      vec2 pd = pos0 * rd;
      for (int j = 1; j <= 3; j++) {
        float fj = float(j);
        vec2 pp = fract(pd * (4.0 + fj * 2.5) + vec2(sin(t2 * 0.6 + fj), cos(t2 * 0.4 - fj))) - 0.5;
        float tw = pow(sin(uT * 5.0 + fj * 5.0 + pos0.x * 10.0) * 0.5 + 0.5, 2.0);
        dust += (0.000012 / (dot(pp, pp) + 0.00001)) * tw;
      }
      acc += colDust2 * dust * (0.6 + breath * 0.8) * uPb.z;
      acc *= 1.6;
      acc = clamp((acc * (2.51 * acc + 0.03)) / (acc * (2.43 * acc + 0.59) + 0.14), 0.0, 1.0);
      acc = pow(acc, vec3(0.95));
      acc *= 1.0 - smoothstep(0.2, 1.7, length(pos0));
      fcol = uBg + acc;

    } else if (uMode == 28) {              /* undulating urchin · ChunderFPV port */
      vec2 m2 = vec2((uPa.x - 0.5) * 1.2, (0.5 - uPa.y) * 1.2);
      float t2 = uT * uPa.z / 300.0;
      vec3 o3 = vec3(0.0, 0.0, -130.0 * max(uPa.w, 0.2));
      vec3 dir = normalize(vec3(p, 1.0));
      vec3 cc = vec3(0.0), p3 = o3, k3 = vec3(0.0);
      float v2 = -o3.z / 3.0;
      float d = 0.0, s = 1.0, f2 = 0.0, z2 = 0.0, r2;
      bool b2 = false;
      for (int i = 0; i < 70; i++) {
        p3 = dir * d + o3;
        p3.xy /= v2;
        r2 = length(p3.xy);
        z2 = abs(1.0 - r2 * r2);
        b2 = r2 < 1.0;
        if (b2) z2 = sqrt(z2);
        p3.xy /= z2 + 1.0;
        p3.xy -= m2;
        p3.xy *= v2;
        p3.xy -= cos(p3.z / 8.0 + t2 * 3e2 + vec2(0.0, 1.5708) + z2 / 2.0) * 0.2;
        s = urMap(p3, v2, t2);
        r2 = length(p3.xy);
        f2 = cos(floor(r2 + 0.5) * t2 * 6.2832) * 0.5 + 0.5;
        k3 = cyc(0.2 - f2 / 3.0 + t2 + p3.z / 2e2 + uPhase * uRun.x * 0.1);
        if (b2) k3 = vec3(1.0) - k3;
        cc += min(exp(s / -0.05), s) * (f2 + 0.01) * min(z2, 1.0)
            * sqrt(cos(r2 * 6.2832) * 0.5 + 0.5) * k3 * k3;
        d += s * clamp(z2, 0.3, 0.9);
        if (s < 1e-3 || d > 1e3) break;
      }
      cc += min(exp(-p3.z - f2 * uPb.x) * z2 * k3 * 0.01 / max(s, 1e-4), 1.0);
      vec2 j2 = p3.xy / v2 + m2;
      cc /= clamp(dot(j2, j2) * 4.0, 0.04, 4.0);
      fcol = pow(max(cc, vec3(0.0)), vec3(1.0 / 2.2));

    } else if (uMode == 29) {              /* saturday weirdness · mrange CC0 port */
      float a3 = uT * 0.25 * uPa.z;
      vec3 r0 = vec3(1.0, sin(vec2(0.7071, 1.0) * a3));
      vec3 r1 = vec3(cos(vec2(0.7071, 1.0) * a3), 1.0);
      vec3 dN = normalize(r0), zN = normalize(r1);
      vec3 vv3 = cross(zN, dN);
      float cc3 = dot(zN, dN);
      float k3w = 1.0 / (1.0 + cc3);
      gWRot = mat3(
        vv3.x * vv3.x * k3w + cc3,   vv3.y * vv3.x * k3w - vv3.z, vv3.z * vv3.x * k3w + vv3.y,
        vv3.x * vv3.y * k3w + vv3.z, vv3.y * vv3.y * k3w + cc3,   vv3.z * vv3.y * k3w - vv3.x,
        vv3.x * vv3.z * k3w - vv3.y, vv3.y * vv3.z * k3w + vv3.x, vv3.z * vv3.z * k3w + cc3);
      gLC0 = gradient(0.33);
      gLC1 = gradient(0.66);
      gBB = gradient(0.0) * 0.5;
      gTB = gradient(1.0);
      gSun = gradient(0.5) * 0.01;
      vec3 ro3 = vec3(0.0, 0.5, -3.0 * max(uPa.w, 0.4));
      vec3 ww3 = normalize(-ro3);
      vec3 uu3 = normalize(cross(vec3(0.0, 1.0, 0.0), ww3));
      vec3 vv4 = cross(ww3, uu3);
      vec3 rd3 = normalize(p.x * uu3 + p.y * vv4 + 2.0 * ww3);
      vec3 c3 = wBgCol(ro3, rd3);
      float t3 = wMarch(ro3, rd3);
      if (t3 < 10.0) {
        vec3 pp3 = ro3 + rd3 * t3;
        vec3 n3 = wNorm(pp3);
        vec3 rr3 = reflect(rd3, n3);
        vec3 rcol = wBgCol(pp3, rr3);
        float fre = 1.0 + dot(rd3, n3);
        fre *= fre;
        fre = mix(0.5, 1.0, fre);
        vec3 lp0 = 4.0 * vec3(1.0, 1.0, -2.0), lp1 = 2.0 * vec3(-1.0, -1.0, -2.0);
        vec3 ld0 = normalize(lp0 - pp3), ld1 = normalize(lp1 - pp3);
        float dif0 = pow(max(dot(ld0, n3), 0.0), 4.0) * 0.5;
        float dif1 = pow(max(dot(ld1, n3), 0.0), 4.0) * 0.5;
        c3 = dif0 * gLC0 + dif1 * gLC1 + rcol * fre;
        /* feedback texture → procedural palette swirl */
        vec2 p2 = pp3.xy * n3.z + pp3.xz * n3.y + pp3.zy * n3.x;
        p2 *= 0.7;
        float rl = length(p2);
        float sa = -20.0 * rl;
        p2 = mat2(cos(sa), -sin(sa), sin(sa), cos(sa)) * p2;
        float sw = fbm(p2 * 3.0 + uT * 0.15) + rl * 2.0 - uT * uPb.z * 0.5;
        vec3 pcol = cyc(sw * 0.35 + uPhase * uRun.x * 0.15) * uPb.w * 2.0;
        c3 += smoothstep(vec3(0.2, 0.25, 0.5), vec3(1.75, 1.6, 1.4), pcol);
      }
      c3 -= 4e-2 * vec3(3.0, 2.0, 1.0) * (length(p) + 0.25);
      c3 = max(c3, vec3(0.0)) * 0.6;
      c3 = clamp((c3 * (2.51 * c3 + 0.03)) / (c3 * (2.43 * c3 + 0.59) + 0.14), 0.0, 1.0);
      fcol = sqrt(c3);

    } else if (uMode == 30) {
      /* adapted from "Stormseye" by muragustina · shadertoy.com/view/ffVXRd —
         hurricane-eye vortex; loops constant-bound, breath made periodic,
         colours remapped to the active palette */
      vec2 pos0 = p;
      float t2 = uT * 0.6 * uPa.w;
      float breath = 0.2 + uPb.y * (0.5 + 0.5 * sin(uT * 0.35));
      vec2 u2 = p * (1.5 - breath * 0.3) / max(uPa.x, 0.2);
      float dc = length(u2);
      float va = exp2(-dc * 8.0) * 5.0 * uPa.y;
      u2 = mat2(cos(va), -sin(va), sin(va), cos(va)) * u2;
      vec3 acc = vec3(0.0);
      float ang2 = 16.8;
      mat2 rr = mat2(cos(ang2), -sin(ang2), sin(ang2), cos(ang2));
      vec3 colA2 = gradient(1.0) * 0.25;
      vec3 colB2 = gradient(0.0) * 1.8;
      vec3 colCore2 = gradient(0.5) * 1.6 + vec3(0.6);
      vec3 colDust2 = gradient(0.25) * 2.0;
      for (int i = 0; i < 85; i++) {
        if (float(i) >= uPa.z * 85.0) break;
        float fi = float(i);
        vec2 flow = vec2(atan(u2.y * 2.0 + t2) * 0.02, sin(u2.x * 2.0 - t2) * 0.02);
        u2 += flow * (0.2 + dc * 0.5);
        u2 = rr * u2;
        u2 *= 1.04;
        vec2 pp = u2 - vec2(uPb.w, 0.0);
        float d = length(vec2(pp.x * 2.0, pp.y * max(uPb.x, 0.002)));
        float glow2 = 0.002 / (d * d + 0.003) * (0.3 + breath);
        vec3 pal = mix(colA2, colB2, cos(fi * 0.1 + t2 - length(u2) * 2.0) * 0.5 + 0.5);
        float core2 = smoothstep(0.1, 0.0, d);
        pal = mix(pal, colCore2, clamp(core2 * 2.0, 0.0, 1.0));
        acc += glow2 * pal * exp2(-length(u2) * 2.5);
      }
      float dust = 0.0;
      mat2 rd2 = mat2(cos(t2 * 2.0), -sin(t2 * 2.0), sin(t2 * 2.0), cos(t2 * 2.0));
      vec2 pd = pos0 * rd2;
      for (int j = 1; j <= 3; j++) {
        float fj = float(j);
        vec2 pp = fract(vec2(pd.x, pd.y * 2.0) * (3.0 + fj * 2.0)
                        + vec2(t2 * (0.8 + fj * 0.2), 0.0)) - 0.5;
        float tw = pow(sin(uT * 10.0 + fj) * 0.5 + 0.5, 2.0);
        dust += (0.00002 / (dot(pp, pp) + 0.00001)) * tw;
      }
      acc += colDust2 * dust * smoothstep(0.5, 0.0, length(pos0)) * uPb.z;
      acc *= 1.4;
      acc = clamp((acc * (2.51 * acc + 0.03)) / (acc * (2.43 * acc + 0.59) + 0.14), 0.0, 1.0);
      acc = pow(acc, vec3(0.95));
      acc *= 1.0 - smoothstep(0.1, 1.5, length(pos0));
      fcol = uBg + acc;

    } else if (uMode == 31) {
      /* adapted from "Smaller Waterfall" by mrange (CC0) · shadertoy NXjGRy —
         golfed cylinder waterfall; droplet colours remapped to the palette */
      float T3 = 0.1 * uT * uPa.w + 9.0;
      vec2 Pw = vec2(p.x, -p.y) * (2.0 / max(aspect, 0.5)) / max(uPa.x, 0.2);
      vec4 Uv = vec4(0.0, 1.0, 2.0, 4.0);
      vec4 Ov = vec4(0.0);
      vec2 Yv = vec2(5e-3 * max(uPb.x, 0.2), 1.0);
      float z3 = 0.0, d3 = T3, i2 = 0.0;
      for (int k = 1; k < 39; k++) {
        if (d3 <= 1e-4) break;
        Ov = z3 * normalize(vec4(Pw, 2.0, 0.0)) - Uv.xwyx / 4.5;
        d3 = 1.0 - sqrt(length(Ov * Ov));
        z3 += d3;
      }
      vec2 Cp = vec2(Ov.x, atan(Ov.z, Ov.y));
      vec2 Pq = vec2(2.0 * Pw.x, Pw.y - 1.0 / max(aspect, 0.5));
      vec3 acc3 = gradient(0.9) * 22.0 / (1e3 * dot(Pq, Pq) + 6.0);
      float zr = 5e-4 * max(uPb.y, 0.1);
      vec2 rAA = vec2(length(fwidth(Cp)));
      for (int j = 1; j < 9; j++) {
        float j3 = float(j);
        i2 = fract(sin(dot(vec2(j3, floor(Cp.x / Yv.x + 0.5)), vec2(7.0, 11.0)) * 73.0));
        vec2 Pp = Cp - (T3 + T3 * i2) * vec2(0.0, 1.0);
        Pp -= floor(Pp / Yv + 0.5) * Yv;
        vec3 dropCol = cyc(fract(8663.0 * i2) * 0.8 + uPhase * uRun.x * 0.2);
        float ww = 1.0 + sin(T3 + 7.0 * fract(8663.0 * i2) + 4.0);
        vec2 cov = smoothstep(rAA, -rAA,
          vec2(length(max(Pp, vec2(-1.0, 0.0))), length(Pp) - zr) - zr);
        acc3 += dot(cov, vec2(exp(19.0 * Pp.y), 3.0)) * dropCol * ww * uPa.y;
        Cp.x += Yv.x / 8.0;
      }
      fcol = sqrt(max(tanh3(acc3 - 0.02 * vec3(2.0, 4.0, 1.0)), vec3(0.0)));

    } else if (uMode == 32) {
      /* adapted from "Fork Neon Seatu xinchenl 319" by xinchenl ·
         shadertoy 7fVXz3 — audio input replaced with a procedural
         spectrum, feedback trail replaced with decayed ghost rings */
      vec2 uv2 = vec2(p.x, -p.y) * 2.0 / max(uPa.x, 0.2);
      float d0 = length(uv2);
      vec2 vp = normalize(uv2 + vec2(1e-5));
      float circ0 = acos(clamp(vp.y, -1.0, 1.0)) / 3.14159;
      float eqScale = mix(1.6, 4.25, sin(uT * 0.42323) * 0.5 + 0.5) * uPa.y;
      vec3 acc = vec3(0.0);
      for (int g = 0; g < 5; g++) {
        float fg = float(g);
        float tg = uT - fg * 0.09 * uPb.y;
        float decay = pow(0.72, fg);
        float circ = fract(circ0 * eqScale);
        float s = 0.5 + 0.5 * sin(circ * 21.0 + tg * 2.0);
        s *= 0.6 + 0.4 * sin(circ * 55.0 - tg * 3.1);
        s = mix(s, fbm(vec2(circ * 6.0, tg * 0.7)), 0.5) * uPa.z;
        float dL = d0 * mix(1.43, 0.88, clamp(s, 0.0, 1.0)) * (1.0 + fg * 0.012 * uPb.y);
        float ring = smoothstep(0.8 + max(uPb.x, 0.005), 0.8, dL)
                   * smoothstep(0.8 - max(uPb.x, 0.005), 0.8, dL);
        vec3 rc = cyc(0.15 * tg * uPa.w + circ0 * 0.4 + fg * 0.05 + uPhase * uRun.x * 0.1);
        acc += rc * ring * decay;
      }
      float bass = pow(0.5 + 0.4 * sin(uT * 1.3) * sin(uT * 0.7), 5.0);
      acc += gradient(1.0) * 0.05 * bass;
      fcol = uBg + acc;

    } else if (uMode == 33) {
      /* adapted from "PsychedelicSakura" by Reva · shadertoy wlGXRD —
         cosine palettes remapped to the active palette; reversed-edge
         smoothsteps made explicit via ssg() */
      vec2 pos2 = vec2(-p.x, p.y);
      pos2 *= (cos(uT * uPa.w) + 1.5) * uPa.x;
      float r2 = length(pos2) * 2.0;
      float a2 = atan(pos2.y, pos2.x);
      float f2 = abs(cos(a2 * uPa.y + uT * 0.5)) * sin(uT * 2.0) * 0.698 + cos(uT * uPa.w) - 4.0;
      float dd = f2 - r2;
      float fd = fract(dd);
      float band = ssg(fd, fd - 0.2, 0.16) - ssg(fd, fd - 1.184, 0.16);
      fcol = band * cyc(f2 * 0.12 + uPhase * uRun.x * 0.2);
      float wv = fract(dd * (sin(uT) * 0.45 + 0.5));
      float rr = r2 * 0.272;
      float pct = ssg(wv - 0.2, wv, rr) - ssg(wv, wv + 0.2, rr);
      fcol += pct * cyc(r2 * 0.15 + 0.4 + uPhase * uRun.x * 0.1) * uPa.z;
      fcol = mix(uBg, max(fcol, vec3(0.0)), 0.92);

    } else if (uMode == 34) {
      /* adapted from "Glossy Gradients" by Peace · shadertoy lX2GDR —
         trig-feedback silk gradients, colours remapped to the palette */
      vec2 uv3 = vec2(p.x, -p.y) * 2.0 / max(uPa.x, 0.2);
      float d4 = -uT * 0.5 * uPa.w;
      float a4 = 0.0;
      for (int i = 0; i < 12; i++) {
        if (float(i) >= uPa.y) break;
        float fi = float(i);
        a4 += cos(fi - d4 - a4 * uv3.x);
        d4 += sin(uv3.y * fi + a4);
      }
      d4 += uT * 0.5 * uPa.w;
      vec2 base = cos(uv3 * vec2(d4, a4)) * 0.5 + 0.5;
      float gl2 = cos(a4 + d4) * 0.5 + 0.5;
      fcol = cyc(base.x * 0.35 + base.y * 0.25 + uPhase * uRun.x * 0.15);
      fcol = mix(fcol, gradient(1.0), (cos(base.y * 3.0 + d4) * 0.5 + 0.5) * uPa.z * 0.3);
      fcol = mix(fcol, vec3(1.0), pow(gl2, 6.0) * uPb.x);

    } else if (uMode == 35) {              /* ether · nimitz (CC BY-NC-SA) port */
      float tt = uT * uPa.w;
      vec2 pe = vec2(p.x, -p.y) / max(uPa.x, 0.2);
      vec3 cl = vec3(0.0);
      float d5 = 2.5;
      vec3 lBase = gradient(0.85) * 0.35;
      vec3 lHot = gradient(0.1) * 3.5;
      for (int i = 0; i <= 5; i++) {
        vec3 q3 = vec3(0.0, 0.0, 5.0) + normalize(vec3(pe, -1.0)) * d5;
        float rz = eMap(q3, tt);
        float f = clamp((rz - eMap(q3 + 0.1, tt)) * 0.5, -0.1, 1.0);
        vec3 l = lBase + lHot * f;
        cl = cl * l + smoothstep(2.5 * uPa.y, 0.0, rz) * 0.7 * l;
        d5 += min(rz, 1.0);
      }
      fcol = uBg + cl * uPa.z;

    } else if (uMode == 36) {
      /* compact adaptation of "in space" by Danil / arugl (CC0) ·
         shadertoy sldGDf — banded planet with glowing latitude lines,
         nebula and starfield; colours from the active palette */
      vec2 q = vec2(p.x, -p.y) / max(uPa.x, 0.2);
      float t2 = uT * uPa.w * 0.3;
      vec3 col = uBg;
      /* starfield */
      vec2 sq = q * 14.0;
      vec2 si = floor(sq);
      float sr = h1(dot(si, vec2(1.0, 57.0)));
      vec2 so = fract(sq) - 0.5 - (vec2(h1(sr * 99.0), h1(sr * 7.0)) - 0.5) * 0.8;
      float star = smoothstep(0.06, 0.0, length(so)) * step(0.82, sr)
                 * (0.5 + 0.5 * sin(uT * 3.0 + sr * 40.0));
      col += vec3(1.0) * star * 0.8;
      /* nebula */
      float neb = fbm(q * 3.0 + vec2(t2 * 0.2, 0.0));
      col += cyc(neb * 0.4 + 0.6) * neb * neb * 0.35;
      /* planet */
      float pr = max(uPa.y, 0.05);
      float r = length(q) / pr;
      if (r < 1.0) {
        float z = sqrt(1.0 - r * r);
        vec3 nrm = normalize(vec3(q / pr, z));
        float tl = uPb.y;
        nrm.yz = mat2(cos(tl), -sin(tl), sin(tl), cos(tl)) * nrm.yz;
        float lat = nrm.y;
        float lon = atan(nrm.x, nrm.z);
        float bands = sin(lat * 3.14159 * uPa.z
                          + fbm(vec2(lon * 2.0 + t2, lat * 6.0)) * uPb.z * 4.0
                          - t2 * 2.0);
        float fw2 = fwidth(bands) + 0.001;
        float line = 1.0 - smoothstep(0.0, 3.0 * fw2, abs(bands) * 0.5);
        vec3 pc = cyc(lat * 0.35 + 0.5 + uPhase * uRun.x * 0.15);
        float shade = 0.35 + 0.65 * z;
        col = pc * (0.35 + 0.5 * (0.5 + 0.5 * bands)) * shade;
        col += cyc(lat * 0.35 + 0.52) * line * 1.2 * shade;
        col += vec3(1.0) * pow(z, 8.0) * 0.08;
      }
      float rim = exp(-abs(r - 1.0) * 9.0 / max(uPb.x, 0.03));
      col += gradient(0.2) * rim * (r >= 1.0 ? 0.8 : 0.35);
      fcol = col;

    } else if (uMode == 37) {              /* relief waves · embossed ridges */
      vec2 q = vec2(p.x, -p.y) / max(uPa.x, 0.2);
      float t2 = uT * uPa.w;
      float e = 0.004;
      float h0 = reliefH(q, t2);
      float hx = reliefH(q + vec2(e, 0.0), t2);
      float hy = reliefH(q + vec2(0.0, e), t2);
      vec3 nrm = normalize(vec3((h0 - hx) / e, (h0 - hy) / e, 6.0 / max(uStroke, 0.1)));
      float la = uWarpA;
      vec3 Ld = normalize(vec3(cos(la) * 0.75, sin(la) * 0.75, 0.65));
      float dif = max(dot(nrm, Ld), 0.0);
      float spec = pow(max(dot(reflect(-Ld, nrm), vec3(0.0, 0.0, 1.0)), 0.0), 24.0);
      vec3 base = mix(uBg + vec3(0.06), gradient(0.5), uPb.z);
      vec3 col = base * (0.12 + 0.88 * dif);
      col += vec3(1.0) * spec * uCore * 0.4;
      col = mix(col, col * (0.4 + 1.6 * cyc(h0 * 0.15 + uPhase * uRun.x * 0.1)), uPb.w);
      fcol = col;

    } else if (uMode == 38) {              /* bauhaus quarter-circle tiles */
      float n = max(uPa.x, 2.0);
      vec2 qq = vec2(p.x, -p.y) * n + vec2(100.5);
      vec2 cell = floor(qq);
      vec2 uv = fract(qq);
      float stag = h1(dot(cell, vec2(3.1, 7.7)));
      float beat = floor(uT * uPa.y + stag * uPb.x);
      float s0 = dot(cell, vec2(1.0, 57.0)) + beat * 101.9;
      float r1 = h1(s0);
      float r2 = h1(s0 * 1.7 + 3.1);
      float r3 = h1(s0 * 2.3 + 9.7);
      float r4 = h1(s0 * 3.7 + 5.2);
      vec3 col = uBg;
      float aaw = fwidth(qq.x) * 1.2 + 0.004;
      if (r1 < uPa.z) {
        float nst = float(uNStops);
        vec3 cA = pickStop(floor(min(r2 * nst, nst - 1.0)));
        vec3 cB = pickStop(floor(min(r4 * nst, nst - 1.0)));
        float ci = floor(h1(s0 * 5.5) * 4.0);
        vec2 corner = vec2(
          (ci == 1.0 || ci == 2.0) ? 1.0 : 0.0,
          (ci >= 2.0) ? 1.0 : 0.0);
        float sel = r3;
        if (sel < 0.35 * uPa.w + 0.08) {
          /* leaf: two opposite quarter discs */
          float d1 = length(uv - corner) - 1.0;
          float d2 = length(uv - (1.0 - corner)) - 1.0;
          col = mix(col, cA, smoothstep(aaw, -aaw, d1));
          col = mix(col, cB, smoothstep(aaw, -aaw, d2));
        } else if (sel < 0.48) {
          /* full disc */
          float d = length(uv - 0.5) - 0.5;
          col = mix(col, cA, smoothstep(aaw, -aaw, d));
        } else if (sel < 0.62 && uPa.w > 0.25) {
          /* concentric quarters */
          float d1 = length(uv - corner) - 1.0;
          float d2 = length(uv - corner) - 0.5;
          col = mix(col, cA, smoothstep(aaw, -aaw, d1));
          col = mix(col, cB, smoothstep(aaw, -aaw, d2));
        } else if (sel < 0.74) {
          /* solid square + contrasting quarter */
          col = cA;
          float d2 = length(uv - corner) - 1.0;
          col = mix(col, cB, smoothstep(aaw, -aaw, d2));
        } else {
          /* single quarter disc */
          float d1 = length(uv - corner) - 1.0;
          col = mix(col, cA, smoothstep(aaw, -aaw, d1));
        }
      }
      fcol = col;

    } else if (uMode == 39) {              /* glossy tubes · 3D plastic */
      float t2 = uT * uPa.w * 0.4;
      vec3 ro = vec3(0.0, 0.0, -4.2 / max(uPa.x, 0.3));
      vec3 rd = normalize(vec3(p.x, -p.y, 1.6));
      vec3 bgc = mix(gradient(0.95), gradient(0.75), clamp(-p.y + 0.5, 0.0, 1.0));
      bgc = mix(uBg, bgc, 0.85);
      vec3 col = bgc;
      float d = 0.0, s = 1.0;
      bool hit = false;
      vec3 q3 = ro;
      for (int i = 0; i < 64; i++) {
        q3 = ro + rd * d;
        s = t3Map(q3, t2);
        if (s < 0.002) { hit = true; break; }
        d += s * 0.9;
        if (d > 14.0) break;
      }
      if (hit) {
        vec2 e = vec2(0.004, 0.0);
        vec3 nn = normalize(vec3(
          t3Map(q3 + e.xyy, t2) - t3Map(q3 - e.xyy, t2),
          t3Map(q3 + e.yxy, t2) - t3Map(q3 - e.yxy, t2),
          t3Map(q3 + e.yyx, t2) - t3Map(q3 - e.yyx, t2)));
        vec3 base = cyc(q3.x * 0.09 + q3.y * 0.07 + uPhase * uRun.x * 0.15);
        vec3 L1 = normalize(vec3(-0.5, 0.8, -0.5));
        float dif = max(dot(nn, L1), 0.0);
        float spec = pow(max(dot(reflect(-L1, nn), -rd), 0.0), 40.0);
        float fre = pow(clamp(1.0 + dot(rd, nn), 0.0, 1.0), 3.0);
        col = base * (0.35 + 0.65 * dif);
        col += bgc * fre * 0.5;
        col += vec3(1.0) * spec * uCore * 0.9;
      }
      fcol = col;

    } else if (uMode == 40) {              /* petal bloom · raymarched spiral sheets */
      float t2 = uT * uPa.w * 0.1;
      vec3 ro = vec3(0.6, 3.3, -4.1) / max(uPa.x, 0.3);
      vec3 ta = vec3((uPa.z - 0.5) * 3.0, -0.1, (0.5 - uPb.w) * 3.0);
      vec3 ww = normalize(ta - ro);
      vec3 uu = normalize(cross(vec3(0.0, 1.0, 0.0), ww));
      vec3 vv = cross(ww, uu);
      vec3 rd = normalize(p.x * uu - p.y * vv + 1.8 * ww);
      vec3 bgc = mix(uBg, gradient(0.9) * 0.45 + uBg * 0.55, clamp(-p.y + 0.5, 0.0, 1.0));
      vec3 col = bgc;
      float d = 0.0, s2 = 1.0;
      float steps = 0.0;
      bool hit = false;
      vec3 q3 = ro;
      for (int i = 0; i < 120; i++) {
        q3 = ro + rd * d;
        s2 = roseMap(q3, t2);
        if (s2 < 0.0015 + d * 0.0008) { hit = true; break; }
        d += min(s2 * 0.65, 0.4);          // spiral SDF is approximate: cap steps
        steps += 1.0;
        if (d > 12.0) break;
      }
      if (hit) {
        vec2 e = vec2(0.013, 0.0);          // wide epsilon → silky normals
        vec3 nn = normalize(vec3(
          roseMap(q3 + e.xyy, t2) - roseMap(q3 - e.xyy, t2),
          roseMap(q3 + e.yxy, t2) - roseMap(q3 - e.yxy, t2),
          roseMap(q3 + e.yyx, t2) - roseMap(q3 - e.yyx, t2)));
        float rh = length(q3.xz);
        float th2 = atan(q3.z, q3.x);
        float sc = uPa.y * th2 / TAU + uPb.x * log(rh + 1e-4) - t2;
        float nArms2 = max(floor(uPa.y + 0.5), 1.0);
        float armId2 = mod(floor(sc + 0.5), nArms2);
        /* smooth radial hue (outer cool → inner hot) + per-arm jitter;
           both terms are branch-cut safe, so no seams */
        float rn = clamp((rh - 0.15) / 2.1, 0.0, 1.0);
        float jit = (h1(armId2 * 7.7 + 3.1) - 0.5) * 0.06;
        vec3 base = gradient(clamp(rn + jit, 0.0, 1.0));
        vec3 L1 = normalize(vec3(-0.45, 0.85, -0.4));
        /* silky wrap lighting: half-Lambert squared, soft fill, gentle AO */
        float wrap = dot(nn, L1) * 0.5 + 0.5;
        float dif = wrap * wrap;
        float fil = dot(nn, normalize(vec3(0.7, 0.25, 0.3))) * 0.5 + 0.5;
        float ao = clamp(1.0 - steps / 120.0 * 0.7, 0.55, 1.0);
        float spec = pow(max(dot(reflect(-L1, nn), -rd), 0.0), 32.0);
        col = base * (0.32 + 0.78 * dif + 0.16 * fil * fil) * ao;
        col += bgc * pow(clamp(1.0 + dot(rd, nn), 0.0, 1.0), 2.5) * 0.18;
        col += vec3(1.0) * spec * uCore * 0.3;
        col *= 0.92 + 0.10 * clamp(q3.y, 0.0, 1.0);
      }
      fcol = col;

    } else if (uMode == 41) {
      /* hex grid · dual-lit beveled hexagons, built from a reference
         image (Linux Mint wallpaper set by dr-leonard-m) */
      float sc = max(uPa.x, 2.0);
      vec2 q = vec2(p.x, -p.y) * sc;
      vec2 s2v = vec2(1.0, 1.7320508);
      vec2 a2 = mod(q, s2v) - s2v * 0.5;
      vec2 b2 = mod(q - s2v * 0.5, s2v) - s2v * 0.5;
      vec2 gv = (dot(a2, a2) < dot(b2, b2)) ? a2 : b2;
      vec2 id = q - gv;
      vec2 ap = abs(gv);
      float hd = max(dot(ap, vec2(0.5, 0.8660254)), ap.x);
      float aa2 = fwidth(hd) * 1.5 + 0.003;
      float eProx = max(0.5 - hd, 0.0);
      float w2 = max(uPb.x, 0.008);
      float rim = exp(-(eProx * eProx) / (w2 * w2));
      /* two coloured lights, one per palette end */
      vec2 pn = vec2(p.x / max(aspect * 0.5, 0.1), -p.y * 2.0);
      vec2 lp1 = vec2(-uPa.y, 0.15), lp2 = vec2(uPa.y, -0.1);
      float Ll = 1.0 / (1.0 + 7.0 * dot(pn - lp1, pn - lp1));
      float Lr = 1.0 / (1.0 + 7.0 * dot(pn - lp2, pn - lp2));
      vec3 colLight = gradient(0.0) * Ll + gradient(1.0) * Lr;
      /* faint straight rays behind the grid */
      vec2 dr1 = pn - lp1;
      vec2 dr2 = pn - lp2;
      float rays = pow(abs(sin(atan(dr1.y, dr1.x) * 9.0)), 24.0) * Ll
                 + pow(abs(sin(atan(dr2.y, dr2.x) * 9.0)), 24.0) * Lr;
      /* per-hex flicker + bevel toward the lights */
      float fh = h1(dot(id, vec2(7.13, 3.71)));
      float flick = step(1.0 - uPa.z * 0.14, fh)
                  * (0.5 + 0.5 * sin(uT * uPa.w * 2.0 + fh * 40.0));
      float bevel = clamp(gv.x * -sign(pn.x) + gv.y * 0.35, -0.5, 0.5) * uPb.y;
      vec3 col = uBg * 0.55;
      col += colLight * (0.07 + 0.12 * (0.5 + bevel) + 0.30 * flick);
      col += colLight * eProx * 0.10;
      col += colLight * rim * uCore * 2.4;
      col += (gradient(0.0) * Ll + gradient(1.0) * Lr) * rays * uPb.w * 0.5;
      fcol = col;

    } else if (uMode == 42) {              /* cloth stack · draped sheets */
      float t2 = uT * uPa.w * 0.25;
      vec3 ro = vec3(0.0, 1.15, -3.4) / max(uPa.x, 0.3);
      vec3 ta = vec3(0.0, 0.25, 0.6);
      vec3 ww = normalize(ta - ro);
      vec3 uu = normalize(cross(vec3(0.0, 1.0, 0.0), ww));
      vec3 vv = cross(ww, uu);
      vec3 rd = normalize(p.x * uu - p.y * vv + 1.7 * ww);
      vec3 bgc = mix(gradient(0.95) * 0.5 + uBg * 0.5, uBg, clamp(-p.y + 0.4, 0.0, 1.0));
      vec3 col = bgc;
      float d = 0.0, s2 = 1.0, steps = 0.0;
      bool hit = false;
      vec3 q3 = ro;
      for (int i = 0; i < 100; i++) {
        q3 = ro + rd * d;
        s2 = clothMap(q3, t2);
        if (s2 < 0.0015 + d * 0.001) { hit = true; break; }
        d += min(s2 * 0.7, 0.4);
        steps += 1.0;
        if (d > 14.0) break;
      }
      if (hit) {
        vec2 e = vec2(0.012, 0.0);
        vec3 nn = normalize(vec3(
          clothMap(q3 + e.xyy, t2) - clothMap(q3 - e.xyy, t2),
          clothMap(q3 + e.yxy, t2) - clothMap(q3 - e.yxy, t2),
          clothMap(q3 + e.yyx, t2) - clothMap(q3 - e.yyx, t2)));
        float cell3 = floor(q3.z / max(uPb.y, 0.25) + 0.5);
        float cn = clamp(0.42 + cell3 * 0.13 + (h1(cell3 * 5.1) - 0.5) * 0.08, 0.0, 1.0);
        vec3 base = gradient(cn);
        vec3 L1 = normalize(vec3(-0.4, 0.9, -0.35));
        float wrap = dot(nn, L1) * 0.5 + 0.5;
        float dif = wrap * wrap;
        float fil = dot(nn, normalize(vec3(0.6, 0.2, -0.5))) * 0.5 + 0.5;
        float ao = clamp(1.0 - steps / 100.0 * 0.7, 0.55, 1.0);
        float spec = pow(max(dot(reflect(-L1, nn), -rd), 0.0), 28.0);
        col = base * (0.34 + 0.76 * dif + 0.15 * fil * fil) * ao;
        col += bgc * pow(clamp(1.0 + dot(rd, nn), 0.0, 1.0), 2.5) * 0.16;
        col += vec3(1.0) * spec * uCore * 0.3;
      }
      fcol = col;

    } else {                               /* 23 · aurora curtains */
      for (int i = 0; i < 6; i++) {
        if (float(i) >= uPa.x) break;
        float fi = float(i);
        float n = max(uPa.x, 1.0);
        float cxr = (n > 1.0 ? fi / (n - 1.0) - 0.5 : 0.0) * uPa.y * 1.5;
        float xo = sin((v - 0.5) * uPa.z * 4.0 + uT * (0.4 + fi * 0.13) + fi * 2.1) * 0.28
                 + sin((v - 0.5) * uPa.z * 9.0 - uT * 0.7 + fi) * 0.07;
        float d = abs(p.x - cxr - xo * uWarpB);
        float I = exp(-(d * d) / max(uPb.x * uPb.x, 1e-5))
                * (0.55 + 0.45 * sin(uT * 0.8 + fi * 1.9))
                * (0.35 + 0.85 * (1.0 - v));
        vec3 cc = cyc(fi / n + uPhase * uRun.x * 0.2 + v * 0.25);
        fcol += cc * I;
      }
    }

    fcol = mix(uBg, fcol, 0.45 + 0.55 * e);
    fcol *= uLook.x;
    float fm = max(max(fcol.r, fcol.g), fcol.b);
    if (fm > 1.0) fcol /= fm;
    fcol += (fract(sin(dot(gl_FragCoord.xy + fract(uT) * 37.0,
                           vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * uGrain;
    gl_FragColor = vec4(fcol, 1.0);
    return;
  }

  /* ── mode → (u, v[, colour hint]) ─────────────────────── */
  float W = uBase + uSpan * pow(clamp(v, 0.0, 1.0), uFlare);
  W *= 1.0 + 0.018 * sin(uT * 0.40 + 1.7);
  float u = 40.0;                          // 40 = pure background
  float colV = -1.0;                       // >=0 overrides colour position
  float combN = uLines;                    // rails across |u| < uEdge

  if (uMode == 0) {                        // rails · perspective fan
    float xf = x + uWarpA * 0.05 * sin(v * TAU * uWarpB * 0.5 + uT * 0.4) * x / max(W, 1e-3);
    u = xf / max(W, 1e-3);

  } else if (uMode == 1) {                 // waist-arch · mirrored lobes
    float wy = uPa.x;
    float fb = abs(v - wy) / max(max(wy, 1.0 - wy), 1e-3);
    float Wb = uBase + uSpan * pow(fb, uFlare);
    float lowShift = (v > wy) ? (uPa.y - 0.5) * 0.24 : 0.0;
    u = (x - (uPa.z - 0.5) * aspect - lowShift) / max(Wb, 1e-3);
    u *= max(uPa.w, 0.01);                 // colour spread tightens rail packing
    v = fb;

  } else if (uMode == 2) {                 // sine-warped fan
    u = x / max(W, 1e-3) + uWarpB * 0.35 * sin(v * uWarpA * 3.14159 + uT * 0.5);

  } else if (uMode == 3) {                 // rays from a focus (bowtie)
    vec2 f0 = vec2((uPa.x - 0.5) * aspect, uPa.y);
    u = atan(x - f0.x, max(abs(v - f0.y), 2e-3)) / 1.5708 * uPa.z;
    v = clamp(abs(v - f0.y) * 1.6, 0.0, 1.0);

  } else if (uMode == 4) {                 // horizon · converge to the right
    float fh = 1.0 - frag.x;
    float Wh = uBase + uSpan * pow(fh, uFlare);
    u = (v - uWarpA) / max(Wh, 1e-3);
    v = fh;

  } else if (uMode == 5) {                 // ripple rings
    vec2 q = vec2(x - (uPa.x - 0.5) * aspect, v - uPa.y);
    float r = length(q);
    float a = atan(q.y, q.x);
    float lobes = max(floor(uPa.z * 12.0 + 0.5), 1.0);
    float wob = 1.0 + uWarpA * 0.35 * sin(a * lobes + r * 7.0 + uT * uPa.w * TAU);
    u = r * wob / max(uBase + uSpan * 0.5, 1e-3) * 0.42;
    v = clamp(r * 1.5, 0.0, 1.0);

  } else if (uMode == 6) {                 // comb fan · blades round a hub
    vec2 q = vec2(x - (uPa.x - 0.5) * aspect, v - uPa.y);
    float r = length(q);
    float a = atan(q.x, -q.y);             // 0 = up
    float span = max(uPa.z, 0.05);         // half-span in radians
    u = a / span;
    float rn = r / max(uSpan, 1e-3);
    if (rn < uPa.w || rn > 1.0) u = 40.0;  // inside hub / past tip = background
    v = clamp(rn, 0.0, 1.0);

  } else if (uMode == 7) {                 // spiral
    vec2 q = vec2(x, v - 0.5);
    float r = length(q) / 0.72;
    float a = atan(q.y, q.x);
    float arms = max(floor(uPa.x + 0.5), 1.0);
    float s = pow(max(r, 1e-4), 1.0 / max(uPa.y, 0.2)) * uWarpA
            - a / TAU * arms - uT * uWarpB * 0.5;
    u = (fract(s) - 0.5) * 2.0 * uEdge;
    if (r > 1.0) u = 40.0;
    v = clamp(r, 0.0, 1.0);
    colV = fract(floor(s + 0.5) * 0.31);
    combN = 1.0;

  } else if (uMode == 8) {                 // beams
    float ca = cos(uWarpA), sa = sin(uWarpA);
    float xr = ca * x + sa * (v - 0.5);
    float yr = -sa * x + ca * (v - 0.5);
    float sp = max(uBase + uSpan, 0.03) * uPa.x;
    float s = xr / sp + uT * uWarpB * 0.3;
    u = (fract(s) - 0.5) * 2.0 * uEdge;
    v = clamp(yr + 0.5, 0.0, 1.0);
    colV = fract(floor(s + 0.5) * 0.2137 + 0.5);
    combN = 1.0;

  } else if (uMode == 9) {                 // sunburst
    vec2 q = vec2(x - (uPa.x - 0.5) * aspect, v - uPa.y);
    float r = length(q) / 0.75;
    float a = atan(q.y, q.x) + uT * 0.1 + r * uWarpB * 0.8;
    float s = a / TAU * uLines;
    float idx = floor(s + 0.5);
    float rnd = h1(idx * 7.13);
    float len = (1.0 - uPa.z * rnd) * (0.8 + 0.2 * sin(uT * 2.2 + rnd * 9.0));
    u = (fract(s) - 0.5) * 2.0 * uEdge;
    if (r > len || r < uPa.w) u = 40.0;
    v = clamp(r, 0.0, 1.0);
    colV = rnd;
    combN = 1.0;

  } else if (uMode == 10) {                // bud-field · petal burst
    vec2 q = vec2(x, v - 0.5);
    float r = length(q);
    float pa = atan(q.y, q.x) / TAU + uT * uWarpB * 0.02;
    float lobes = max(floor(uPa.x + 0.5), 2.0) * 2.0;
    float s = fract(pa * lobes) * 2.0 - 1.0;
    float fr = clamp(r * 1.35, 0.0, 1.0);
    float Wp = uBase + uSpan * pow(fr, uFlare);
    u = s / max(Wp, 1e-3) * 0.5;
    v = fr;
  }

  float au = abs(u);

  /* ── comb: hot cores at a regular step across |u| ─────── */
  float stp  = uEdge / max(combN, 0.5);
  float blur = clamp(2.4 / max(stp * uRes.y * 0.5, 1.0), 0.0, 1.0);
  float d    = au / stp - floor(au / stp + 0.5);
  float sg   = mix(uStroke * 0.55, 0.70, blur);
  float core = exp(-(d * d) / (2.0 * sg * sg));
  core *= 1.0 - smoothstep(uEdge * 0.85, uEdge + 0.15, au);
  float floorK = 0.12 + 0.73 * smoothstep(0.65, 1.0, uCore);
  float lane = mix(1.0 - floorK * uCore, 1.0 + 0.90 * uCore, core);
  lane *= 1.0 - uSeam.x * exp(-pow(u / max(uSeam.y, 1e-3), 2.0));

  /* ── travelling gradient run + trails envelope ────────── */
  float railC = floor(au / stp + 0.5);
  float rnd = h1(railC * 12.9898);
  float wander = sin(uT * (1.3 + rnd * 2.7) + rnd * 17.0) * 0.22;
  float cpos = (colV >= 0.0)
    ? colV * 0.999
    : -1.0;
  vec3 col;
  if (uMotion == 2) {
    col = gradient(0.5 - 0.5 * cos(TAU * uPhase) * (1.0 - min(au / max(uEdge, 1e-3), 1.0)));
  } else if (cpos >= 0.0) {
    col = cyc(cpos + uPhase * uRun.x * 0.25 * step(0.01, uRun.x));
  } else {
    col = cyc(uPhase * uRun.x * 0.5
              - min(au, uEdge) * uRun.z * 3.4
              - (1.0 - v) * uRun.y * 0.6
              + (rnd * 0.18 + wander) * uRun.w);
  }

  float env;
  if (uMotion == 1) {
    env = 1.0;
  } else {
    float ph = fract(uPhase - min(au, uEdge) * uRun.z - uEnvT.w * (1.0 - v));
    float duty = clamp(uEnvT.x, 0.05, 1.0);
    float fall = min(uEnvT.z, duty - 0.01);
    float tt = clamp((ph - fall) / max(duty - fall, 1e-3), 0.0, 1.0);
    float wave = smoothstep(0.0, max(uEnvT.y, 0.004), ph) * pow(1.0 - tt, 2.4);
    if (uMotion == 2) wave = smoothstep(0.0, uEnvT.y, fract(uPhase)) *
                             (1.0 - smoothstep(uEnvT.z, 1.0, fract(uPhase)));
    env = mix(wave, 1.0, clamp(uHold, 0.0, 1.0));
  }

  /* white-hot cores ride the envelope */
  col = mix(col, vec3(1.0), clamp(uLook.z * core * env, 0.0, 0.85));

  /* ── cross-section: body, rim, bloom, hollow ──────────── */
  float wall  = mix(1.0, 0.05, clamp(uHollow, 0.0, 1.0));
  float inner = uEdge * (1.0 - wall);
  float soft  = max(uLook.w, 0.015);
  float body  = smoothstep(inner - soft, inner, au)
              * (1.0 - smoothstep(uEdge, uEdge + soft, au));
  float rim   = 0.22 * exp(-pow((au - uEdge) / max(uLook.w * 0.55, 0.02), 2.0));
  float hcomp = mix(1.0, 2.1, clamp(uHollow, 0.0, 1.0));

  float bl0   = uLook.y * exp(-pow(au / 1.05, 2.0));
  float blH   = uLook.y * exp(-pow((au - uEdge * (1.0 - wall * 0.5)) / max(uEdge * wall * 1.6, 0.02), 2.0));
  float bloom = mix(bl0, blH, clamp(uHollow, 0.0, 1.0));

  /* dying trails melt instead of fading crisp */
  float soften = (uMotion == 0) ? smoothstep(0.0, 1.0, env) : 1.0;
  float laneS = mix(1.0, lane, 0.30 + 0.70 * soften);
  float bodyW = smoothstep(inner - soft * 3.0, inner, au)
              * (1.0 - smoothstep(uEdge, uEdge + soft * 3.0, au));
  float bodyS = mix(bodyW, body, soften);
  float I = laneS * (bodyS + rim) * hcomp;
  bloom *= 1.0 + (1.0 - soften) * 0.8;

  float bright = (I + bloom) * (1.02 + 0.10 * v) * uLook.x;

  /* hue-preserving roll-off */
  vec3 rgb = col * bright;
  float m = max(max(rgb.r, rgb.g), rgb.b);
  float over = max(m - 1.0, 0.0);
  rgb /= max(m, 1.0);
  rgb = mix(rgb, vec3(1.0), clamp(over * 0.15, 0.0, 0.50) * min(uLook.z / 0.45, 1.0));

  float alpha = clamp(bright, 0.0, 1.0) * env;
  vec3 outc = mix(uBg, rgb, alpha);
  outc += (fract(sin(dot(gl_FragCoord.xy + fract(uT) * 37.0,
                         vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * uGrain;
  gl_FragColor = vec4(outc, 1.0);
}
`

let inst = null   // { canvas, gl, prog, loc:{}, ok }

function init() {
  if (inst) return inst
  const canvas = document.createElement('canvas')
  const gl = canvas.getContext('webgl', { preserveDrawingBuffer: false, antialias: false })
  if (!gl) { inst = { ok: false }; return inst }
  gl.getExtension('OES_standard_derivatives')
  const mk = (type, src) => {
    const s = gl.createShader(type)
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('shader:', gl.getShaderInfoLog(s))
      return null
    }
    return s
  }
  const vs = mk(gl.VERTEX_SHADER, VERT)
  const fs = mk(gl.FRAGMENT_SHADER, FRAG)
  if (!vs || !fs) { inst = { ok: false }; return inst }
  const prog = gl.createProgram()
  gl.attachShader(prog, vs)
  gl.attachShader(prog, fs)
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error('link:', gl.getProgramInfoLog(prog))
    inst = { ok: false }
    return inst
  }
  gl.useProgram(prog)
  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const aP = gl.getAttribLocation(prog, 'aP')
  gl.enableVertexAttribArray(aP)
  gl.vertexAttribPointer(aP, 2, gl.FLOAT, false, 0, 0)
  const names = [
    'uRes', 'uT', 'uPhase', 'uMode', 'uMotion', 'uNStops', 'uBg',
    'uLines', 'uEdge', 'uBase', 'uSpan', 'uFlare', 'uWarpA', 'uWarpB',
    'uStroke', 'uCore', 'uSeam', 'uPa', 'uPb',
    'uRun', 'uHold', 'uEnvT', 'uLook', 'uAngle', 'uSway', 'uGrain', 'uHollow',
  ]
  const loc = {}
  for (const n of names) loc[n] = gl.getUniformLocation(prog, n)
  loc.uStops = gl.getUniformLocation(prog, 'uStops[0]')
  inst = { canvas, gl, prog, loc, ok: true }
  return inst
}

export function glAvailable() { return init().ok }

/* render one frame; returns the GL canvas ready to drawImage */
export function renderGLPattern(W, H, t, full, stopsRgb, args) {
  const { canvas, gl, loc, ok } = init()
  if (!ok) return null
  if (canvas.width !== W || canvas.height !== H) {
    canvas.width = W
    canvas.height = H
  }
  gl.viewport(0, 0, W, H)

  const { grad: G, timing: T, look: L } = full
  const motion = full.motion === 'solid' ? 1 : full.motion === 'pulse' ? 2 : 0
  const phase = ((t / T.period) % 1 + 1) % 1

  const stops = new Float32Array(18)
  const n = Math.min(6, stopsRgb.length)
  for (let i = 0; i < n; i++) {
    stops[i * 3] = stopsRgb[i][0] / 255
    stops[i * 3 + 1] = stopsRgb[i][1] / 255
    stops[i * 3 + 2] = stopsRgb[i][2] / 255
  }
  const bg = stopsRgb.bgRgb

  gl.uniform2f(loc.uRes, W, H)
  gl.uniform1f(loc.uT, t)
  gl.uniform1f(loc.uPhase, phase)
  gl.uniform1i(loc.uMode, args.mode)
  gl.uniform1i(loc.uMotion, motion)
  gl.uniform1i(loc.uNStops, n)
  gl.uniform3fv(loc.uStops, stops)
  gl.uniform3f(loc.uBg, bg[0] / 255, bg[1] / 255, bg[2] / 255)

  gl.uniform1f(loc.uLines, args.lines)
  gl.uniform1f(loc.uEdge, args.edge)
  gl.uniform1f(loc.uBase, args.base)
  gl.uniform1f(loc.uSpan, args.span)
  gl.uniform1f(loc.uFlare, args.flare)
  gl.uniform1f(loc.uWarpA, args.warpA ?? 0)
  gl.uniform1f(loc.uWarpB, args.warpB ?? 0)
  gl.uniform1f(loc.uStroke, args.stroke)
  gl.uniform1f(loc.uCore, args.core)
  gl.uniform2f(loc.uSeam, args.seam?.[0] ?? 0, args.seam?.[1] ?? 0.05)
  gl.uniform4fv(loc.uPa, args.pa ?? [0, 0, 0, 0])
  gl.uniform4fv(loc.uPb, args.pb ?? [0, 0, 0, 0])

  gl.uniform4f(loc.uRun, G.runSpeed, G.runStretch, G.runSpread, G.runJitter)
  gl.uniform1f(loc.uHold, G.trailHold ?? 0)
  gl.uniform4f(loc.uEnvT, T.lifetime, T.rise, T.fallStart, T.topLag ?? 0.056)
  gl.uniform4f(loc.uLook, L.gain, L.glow, L.blowout, L.blur * 0.25)
  gl.uniform1f(loc.uAngle, L.angle * Math.PI / 180)
  gl.uniform1f(loc.uSway, L.sway)
  gl.uniform1f(loc.uGrain, L.grain)
  gl.uniform1f(loc.uHollow, L.hollow)

  gl.drawArrays(gl.TRIANGLES, 0, 3)
  return canvas
}
