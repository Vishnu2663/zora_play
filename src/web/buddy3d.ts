// The 3D buddies (Zora the dino, Mimi the cat, Bruno the dog, Teddy the bear), built from simple shaded shapes with
// Three.js. One model builder serves the big character on every screen and the small 3D pictures (avatar faces,
// move poses). The animation is driven by the same Pose the flat SVG character uses (computePose in Milo.tsx), so
// every state (dance, jump, spin, wave, sleep, breathe...) works, and Spin is a real turn around the body.
//
// Units: 1 unit = 100 SVG pixels of the old flat drawing. Y is up, the feet stand on y = 0, the buddy faces +z.

import {
  LinearSRGBColorSpace, AmbientLight, BufferGeometry, CatmullRomCurve3, Color, ColorManagement, CylinderGeometry, DirectionalLight, DoubleSide, Group,
  BackSide, CanvasTexture, HemisphereLight, Material, Mesh, MeshBasicMaterial, MeshLambertMaterial, MeshPhongMaterial, PerspectiveCamera, Scene, Shape, ShapeGeometry,
  SphereGeometry, TorusGeometry, TubeGeometry, Vector3, CircleGeometry, ConeGeometry,
} from 'three';
import { AVATARS, type AvatarId, type Skin } from '../core/avatars.ts';
import type { BuddyLookKinds as BuddyLook, MouthKind, Pose } from './Milo.tsx';

ColorManagement.enabled = false; // colours are used exactly as written in the avatar registry
/** Renderers must also write them out unconverted (the default sRGB output made everything look washed out). */
export const OUTPUT_COLOR_SPACE = LinearSRGBColorSpace;

const DEG = Math.PI / 180;
const INK = 0x2a1b12;
const MOUTH_DARK = 0x7a2e1a;
const TONGUE = 0xff7e8e;

// One shared unit sphere: every rounded part is this sphere, scaled.
let unitSphere: SphereGeometry | null = null;
const sphereGeo = () => (unitSphere ??= new SphereGeometry(1, 48, 32)); // fine enough that silhouettes look round, not faceted

const matCache = new Map<string, Material>();
/** Body parts are matte (no glare). Only the eyes and noses (shininess 60+) get a small, soft glint. */
function phong(color: number, shininess = 26, specular = 0x1c1c1c): Material {
  const key = `p${color}-${shininess}-${specular}`;
  let m = matCache.get(key);
  if (!m) {
    // Soft toy-like finish: a gentle sheen plus a warm rim glow, so the shapes read as rounded, lit 3D figures.
    m = shininess >= 60 ? new MeshPhongMaterial({ color, shininess: 70, specular: 0x555555 }) : softToy(color, shininess);
    matCache.set(key, m);
  }
  return m;
}
/** Warm glow along the edges of a shape (fresnel) and a little light bleeding into the shadow side, like soft skin / vinyl. */
function addRim(m: MeshPhongMaterial): MeshPhongMaterial {
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `
      float rimF = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 2.4);
      float shadowSide = 1.0 - clamp(dot(normalize(normal), normalize(vec3(0.35, 0.6, 0.7))) * 0.5 + 0.5, 0.0, 1.0);
      outgoingLight += vec3(1.0, 0.93, 0.82) * rimF * 0.22 + diffuseColor.rgb * shadowSide * 0.10;
      #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'toy-rim';
  return m;
}
function softToy(color: number, shininess: number): MeshPhongMaterial {
  return addRim(new MeshPhongMaterial({ color, shininess: Math.max(24, shininess + 10), specular: 0x2e2a26 }));
}

/** Richer, brighter colours than the flat drawing: more saturation, a touch deeper. */
export function vivid(c: string, boost = 1.6): number {
  const col = new Color(c);
  const hsl = { h: 0, s: 0, l: 0 };
  col.getHSL(hsl);
  const s = Math.min(1, hsl.s * boost + (hsl.s < 0.4 ? 0.1 : 0));
  return col.setHSL(hsl.h, s, Math.min(0.9, hsl.l)).getHex();
}
/** The skin colours from the avatar registry, a touch softer (less saturated, slightly lighter) so the buddies look gentler. */
const hex = (c: string) => {
  const col = new Color(c);
  const hsl = { h: 0, s: 0, l: 0 };
  col.getHSL(hsl);
  return col.setHSL(hsl.h, hsl.s * 0.88, Math.min(0.92, hsl.l + 0.035)).getHex();
};

/** A thin dark-toned shell behind a part gives the soft cartoon outline. */
const outlineCache = new Map<number, MeshBasicMaterial>();
function outlineMat(color: number): MeshBasicMaterial {
  let m = outlineCache.get(color);
  if (!m) {
    const c = new Color(color); c.multiplyScalar(0.42);
    m = new MeshBasicMaterial({ color: c.getHex(), side: BackSide });
    outlineCache.set(color, m);
  }
  return m;
}

/** The dark cartoon outline shells are off: shading, rim light and soft shadow give the shape instead. */
const OUTLINES = false;

function ell(parent: Group, rx: number, ry: number, rz: number, mat: Material, x = 0, y = 0, z = 0, outline = 0): Mesh {
  const m = new Mesh(sphereGeo(), mat);
  m.scale.set(rx, ry, rz);
  m.position.set(x, y, z);
  if (outline > 0 && OUTLINES) {
    const o = new Mesh(sphereGeo(), outlineMat((mat as MeshLambertMaterial).color.getHex()));
    o.scale.set(1 + outline / rx, 1 + outline / ry, 1 + outline / rz);
    m.add(o);
  }
  parent.add(m);
  return m;
}

export interface Buddy {
  root: Group;
  shadow: Mesh;
  /** Pose the body; `look` is the (already blinked / talking) face. */
  apply(pose: Pose, look: BuddyLook, idleYaw: number): void;
  dispose(): void;
}

/** A thin tube lying on the belly ellipsoid, for the dino's belly lines. */
function bellyLine(parent: Group, yc: number, halfW: number, sag: number, mat: Material) {
  const pts: Vector3[] = [];
  for (let i = 0; i <= 10; i++) {
    const x = -halfW + (2 * halfW * i) / 10;
    const y = yc - sag * (1 - (x / halfW) ** 2);
    const inside = 1 - (x / 0.96) ** 2 - ((y - 1.1) / 1.04) ** 2;
    pts.push(new Vector3(x, y, 0.62 + 0.64 * Math.sqrt(Math.max(0.02, inside)) + 0.012));
  }
  const g: BufferGeometry = new TubeGeometry(new CatmullRomCurve3(pts), 16, 0.026, 6, false);
  parent.add(new Mesh(g, mat));
}

export function createBuddy(avatar: AvatarId): Buddy {
  const k: Skin = AVATARS[avatar].skin;
  const body = phong(hex(k.bodyMid));
  const bodyDark = phong(hex(k.bodyDark));
  const belly = phong(hex(k.belly), 16, 0x111111);
  const hand = phong(hex(k.hand), 20);
  const arm = phong(hex(k.arm));
  const feet = phong(hex(k.feet));
  const crest = phong(hex(k.crest), 40, 0x555555);
  const inner = phong(hex(k.inner), 18, 0x111111);
  const muzzle = phong(hex(k.muzzle), 18, 0x111111);
  const nose = phong(hex(k.nose), 60, 0x888888);
  const white = phong(0xf2f2f2, 90, 0x888888);
  const ink = phong(INK, 90, 0xbbbbbb);
  const toDispose: Material[] = [];

  const root = new Group();
  const toothMat = phong(0xffffff, 40, 0x444444);

  /* ---- body, belly, feet ---- */
  ell(root, 1.52, 1.42, 1.2, body, 0, 1.3, 0, 0.04);
  const bellyG = new Group();
  bellyG.position.set(0, 0, 0);
  root.add(bellyG);
  ell(bellyG, 0.96, 1.04, 0.64, belly, 0, 1.1, 0.62);
  if (k.face === 'dino') {
    const lineMat = phong(new Color(hex(k.bellyLine)).lerp(new Color(hex(k.belly)), 0.5).getHex(), 10, 0x000000);
    [[1.62, 0.8, 0.07], [1.22, 0.74, 0.07], [0.82, 0.66, 0.06], [0.46, 0.5, 0.05]].forEach(([y, w, s]) => bellyLine(bellyG, y, w, s, lineMat));
  }
  for (const sx of [-1, 1]) {
    ell(root, 0.52, 0.28, 0.62, feet, sx * 0.72, 0.18, 0.4, 0.03);
    for (const dx of [-0.26, 0, 0.26]) ell(root, 0.1, 0.09, 0.1, hand, sx * 0.72 + dx, 0.12, 0.98);
  }

  /* ---- tail ---- */
  const tail = new Group();
  tail.position.set(1.0, 0.85, -0.85);
  root.add(tail);
  const spikeMat = phong(0x2bb3a3, 40, 0x555555);
  if (k.tail === 'dino') {
    ell(tail, 0.5, 0.42, 0.42, body, 0.35, -0.05, 0, 0.03);
    ell(tail, 0.4, 0.34, 0.34, body, 0.85, 0.02, 0, 0.03);
    ell(tail, 0.3, 0.27, 0.27, body, 1.25, 0.3, 0, 0.03);
    ell(tail, 0.2, 0.2, 0.2, bodyDark, 1.5, 0.7, 0);
    const spike = new Mesh(new ConeGeometry(0.2, 0.55, 8), spikeMat);
    spike.position.set(1.62, 1.05, 0); spike.rotation.z = -0.3; tail.add(spike);
    ell(tail, 0.1, 0.1, 0.1, spikeMat, 0.78, 0.36, 0); ell(tail, 0.09, 0.09, 0.09, spikeMat, 1.12, 0.52, 0);
  } else if (k.tail === 'cat') {
    [[0.3, -0.02, 0.3], [0.72, 0.12, 0.26], [1.08, 0.42, 0.24], [1.28, 0.85, 0.22], [1.3, 1.3, 0.2]].forEach(([x, y, r]) => ell(tail, r, r, r, body, x, y, 0, 0.025));
    ell(tail, 0.2, 0.22, 0.2, bodyDark, 1.28, 1.52, 0);
  } else if (k.tail === 'dog') {
    [[0.3, 0, 0.32], [0.75, 0.15, 0.28], [1.1, 0.5, 0.24], [1.2, 0.9, 0.2]].forEach(([x, y, r]) => ell(tail, r, r, r, body, x, y, 0, 0.025));
  } else {
    ell(tail, 0.42, 0.42, 0.42, body, 0.3, 0, 0, 0.03);
  }

  /* ---- wings (dino) ---- */
  const wings: Group[] = [];
  if (k.wings) {
    const wmat = new MeshPhongMaterial({ color: 0x3fc8b8, shininess: 30, specular: 0x444444, side: DoubleSide });
    const shape = new Shape();
    shape.moveTo(0, 0);
    shape.quadraticCurveTo(-0.7, 0.4, -1.35, 1.3);
    shape.lineTo(-1.0, 1.12); shape.lineTo(-0.86, 0.86); shape.lineTo(-0.6, 0.72); shape.lineTo(-0.5, 0.46); shape.lineTo(-0.22, 0.12);
    shape.lineTo(0, 0);
    const wgeo = new ShapeGeometry(shape, 8);
    for (const side of [-1, 1]) {
      const w = new Group();
      w.position.set(side * 0.75, 2.35, -0.7);
      w.scale.setScalar(1.3);
      const m = new Mesh(wgeo, wmat);
      m.scale.x = -side; // the shape points to -x: the left wing keeps it, the right wing is mirrored
      w.add(m);
      root.add(w);
      wings.push(w);
    }
    toDispose.push(wmat);
  }

  /* ---- arms ---- */
  const arms: Group[] = [];
  for (const side of [-1, 1]) {
    const a = new Group();
    a.position.set(side * 1.5, 1.9, 0.18); // the shoulder sits on the surface of the body
    const upper = ell(a, 0.27, 0.46, 0.27, arm, side * -0.04, -0.44, 0, 0.03);
    upper.rotation.z = side * 0.3;
    ell(a, 0.16, 0.16, 0.16, hand, side * -0.12, -0.86, 0.02, 0.025);
    root.add(a);
    arms.push(a);
  }

  /* ---- head ---- */
  const head = new Group();
  head.position.set(0, 2.7, 0.05);
  root.add(head);
  ell(head, 1.68, 1.46, 1.5, body, 0, 0.98, 0, 0.04);

  if (k.horns) {
    for (const [x, y, r] of [[-0.38, 2.32, 0.15], [0, 2.43, 0.18], [0.38, 2.32, 0.15]]) ell(head, r, r * 1.2, r, crest, x, y, 0.18);
    for (const side of [-1, 1]) {
      const h = ell(head, 0.22, 0.46, 0.22, phong(0xe9cfa5, 30, 0x555555), side * 0.95, 2.18, 0.05, 0.03);
      h.rotation.z = side * 0.5;
      const hi = ell(head, 0.1, 0.3, 0.1, inner, side * 0.95, 2.18, 0.2);
      hi.rotation.z = side * 0.5;
    }
  }
  if (k.ears === 'pointy') {
    for (const side of [-1, 1]) {
      const e = new Mesh(new ConeGeometry(0.55, 1.5, 4), crest);
      e.position.set(side * 0.98, 2.08, 0.1); e.rotation.z = -side * 0.26; e.rotation.y = Math.PI / 4;
      head.add(e);
      const ei = new Mesh(new ConeGeometry(0.3, 1.0, 4), inner);
      ei.position.set(side * 0.98 - side * 0.02, 1.98, 0.3); ei.rotation.z = -side * 0.26; ei.rotation.y = Math.PI / 4;
      head.add(ei);
    }
  } else if (k.ears === 'floppy') {
    for (const side of [-1, 1]) {
      const e = ell(head, 0.46, 0.98, 0.3, crest, side * 1.52, 0.85, -0.05, 0.035);
      e.rotation.z = side * 0.34;
    }
  } else if (k.ears === 'round') {
    for (const side of [-1, 1]) {
      ell(head, 0.56, 0.56, 0.4, crest, side * 1.08, 2.1, -0.1, 0.035);
      ell(head, 0.3, 0.3, 0.2, inner, side * 1.08, 2.1, 0.22);
    }
  }

  // cheeks
  const cheekMat = new MeshPhongMaterial({ color: hex(k.cheek), shininess: 8, specular: 0x000000, transparent: true, opacity: 0.7 });
  toDispose.push(cheekMat);
  for (const side of [-1, 1]) {
    const c = ell(head, 0.29, 0.17, 0.08, cheekMat, side * 1.12, 0.42, 0.95);
    c.rotation.y = side * 0.75;
  }

  // muzzle + nose
  ell(head, k.face === 'bear' ? 0.92 : 0.78, k.face === 'bear' ? 0.58 : 0.48, 0.46, muzzle, 0, 0.3, 1.0);
  if (k.face === 'dino') { for (const x of [-0.18, 0.18]) ell(head, 0.07, 0.05, 0.05, nose, x, 0.46, 1.44); }
  if (k.face === 'cat') {
    const n = ell(head, 0.17, 0.11, 0.1, nose, 0, 0.5, 1.44); n.rotation.z = Math.PI;
    const wm = phong(0x6f7890, 10, 0x000000);
    for (const side of [-1, 1]) for (const dy of [-0.06, -0.26]) {
      const w = new Mesh(new CylinderGeometry(0.014, 0.01, 1.1, 5), wm);
      w.position.set(side * 1.12, 0.38 + dy, 1.1); w.rotation.z = Math.PI / 2 + side * dy * 0.7; w.rotation.y = side * 0.5;
      head.add(w);
    }
  }
  if (k.face === 'dog' || k.face === 'bear') ell(head, k.face === 'dog' ? 0.26 : 0.24, k.face === 'dog' ? 0.19 : 0.17, 0.16, nose, 0, 0.52, 1.42);

  // eyes
  interface EyeSet { open: Group; happy: Group; closed: Group; pupil: Group; whole: Group }
  const eyes: EyeSet[] = [];
  const arcMat = phong(INK, 20, 0x222222);
  for (const side of [-1, 1]) {
    const whole = new Group();
    whole.position.set(side * 0.6, 1.08, 1.2);
    head.add(whole);
    const open = new Group();
    whole.add(open);
    ell(open, 0.46, 0.54, 0.3, white, 0, 0, 0);
    const pupil = new Group();
    open.add(pupil);
    ell(pupil, 0.31, 0.33, 0.2, ink, side * 0.0 + 0.04, -0.05, 0.16);
    ell(pupil, 0.11, 0.11, 0.08, white, 0.14, 0.1, 0.34);
    ell(pupil, 0.05, 0.05, 0.05, white, -0.06, -0.14, 0.34);
    const happy = new Group();
    const hArc = new Mesh(new TorusGeometry(0.34, 0.055, 8, 20, Math.PI), arcMat);
    hArc.position.set(0, -0.12, 0.28); happy.add(hArc); // ^ shaped
    whole.add(happy);
    const closed = new Group();
    const cArc = new Mesh(new TorusGeometry(0.34, 0.05, 8, 20, Math.PI), arcMat);
    cArc.rotation.z = Math.PI; cArc.position.set(0, 0.12, 0.28); closed.add(cArc); // ∪ shaped
    whole.add(closed);
    eyes.push({ open, happy, closed, pupil, whole });
  }

  // brows
  const browMat = phong(0x9a4a16, 20, 0x111111);
  const brows: Mesh[] = [];
  for (const side of [-1, 1]) {
    const b = new Mesh(new CylinderGeometry(0.045, 0.045, 0.55, 8), browMat);
    b.position.set(side * 0.62, 1.72, 1.2); b.rotation.z = Math.PI / 2; b.visible = false;
    head.add(b); brows.push(b);
  }

  // mouths
  const mouthG = new Group();
  mouthG.position.set(0, 0.06, 1.42);
  head.add(mouthG);
  const mk = (): Group => { const g = new Group(); mouthG.add(g); return g; };
  const smileLine = phong(0x5b2410, 20, 0x222222);
  const arc = (g: Group, r: number, tube: number, sy: number, y: number, rot = 0) => {
    const m = new Mesh(new TorusGeometry(r, tube, 8, 22, Math.PI), smileLine);
    m.rotation.z = Math.PI + rot; m.scale.y = sy; m.position.y = y; g.add(m); return m;
  };
  const mouths: Record<MouthKind, Group> = { smile: mk(), open: mk(), o: mk(), grin: mk(), wobbly: mk(), tiny: mk() };
  arc(mouths.smile, 0.36, 0.036, 0.55, 0.2);
  if (k.face === 'dino') { const t = new Mesh(new ConeGeometry(0.05, 0.12, 6), toothMat); t.position.set(0.24, 0.0, 0.0); t.rotation.z = Math.PI; mouths.smile.add(t); }
  const dark = phong(MOUTH_DARK, 20, 0x222222); const tongue = phong(TONGUE, 30, 0x555555);
  ell(mouths.open, 0.34, 0.27, 0.1, dark, 0, 0.1, 0); ell(mouths.open, 0.17, 0.09, 0.06, tongue, 0, -0.04, 0.06);
  const oMouth = new Group(); mouths.o.add(oMouth);
  ell(oMouth, 0.17, 0.21, 0.1, dark, 0, 0.1, 0); ell(oMouth, 0.09, 0.06, 0.05, tongue, 0, 0.0, 0.05);
  ell(mouths.grin, 0.5, 0.3, 0.1, dark, 0, 0.12, 0); ell(mouths.grin, 0.22, 0.1, 0.06, tongue, 0, -0.04, 0.06);
  if (k.face === 'dino') ell(mouths.grin, 0.38, 0.045, 0.04, toothMat, 0, 0.32, 0.07);
  arc(mouths.wobbly, 0.22, 0.034, 0.5, 0.18, 0.18); arc(mouths.wobbly, 0.16, 0.034, 0.5, 0.12, -0.2).position.x = 0.14;
  arc(mouths.tiny, 0.16, 0.032, 0.6, 0.16);

  /* ---- soft ground shadow ---- */
  const shadowTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d')!.createRadialGradient(64, 64, 4, 64, 64, 62);
    g.addColorStop(0, 'rgba(50,28,10,0.55)'); g.addColorStop(0.55, 'rgba(50,28,10,0.28)'); g.addColorStop(1, 'rgba(50,28,10,0)');
    const ctx2 = c.getContext('2d')!; ctx2.fillStyle = g; ctx2.fillRect(0, 0, 128, 128);
    return new CanvasTexture(c);
  })();
  const shadowMat = new MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false });
  const shadow = new Mesh(new CircleGeometry(2.1, 32), shadowMat);
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.01;
  toDispose.push(shadowMat);

  let lastLook = '';
  return {
    root,
    shadow,
    apply(p, look, idleYaw) {
      root.position.set(p.x / 100, -p.y / 100, 0);
      root.rotation.z = -p.rot * DEG;
      root.rotation.y = p.yaw + idleYaw;
      // a somersault tips the buddy about its middle (not its feet)
      root.rotation.x = p.pitch;
      if (p.pitch) { root.position.y += 2.5 * (1 - Math.cos(p.pitch)); root.position.z = -2.5 * Math.sin(p.pitch); } else root.position.z = 0;
      root.scale.set(p.sx, p.sy, p.sx);
      const lift = Math.max(0, -p.y / 100);
      const sc = Math.max(0.55, 1 - lift * 0.18);
      shadow.scale.set(sc, sc, sc);
      shadow.position.x = p.x / 100;

      head.rotation.z = -p.head * DEG;
      head.rotation.y = p.lookX * 0.014;
      head.rotation.x = p.lookY * 0.012;
      arms[0].rotation.z = -p.armL * DEG;
      arms[1].rotation.z = p.armR * DEG;
      const fwd = (a: number) => -Math.max(0, Math.min(1.1, (28 - a) / 55));
      arms[0].rotation.x = fwd(p.armL); arms[1].rotation.x = fwd(p.armR);
      tail.rotation.y = p.tail * 0.022;
      tail.rotation.z = p.tail * 0.008;
      if (wings.length) {
        wings[0].rotation.z = p.wing * DEG * 0.6 + 0.1; wings[0].rotation.y = -0.4 - p.wing * 0.004;
        wings[1].rotation.z = -p.wing * DEG * 0.6 - 0.1; wings[1].rotation.y = 0.4 + p.wing * 0.004;
      }
      bellyG.scale.set(p.belly, p.belly, p.belly);

      const wide = look.eyes === 'wide';
      const key = `${look.eyes}|${look.mouth}|${look.brows}`;
      if (key !== lastLook) {
        lastLook = key;
        for (const e of eyes) {
          e.open.visible = look.eyes === 'open' || wide;
          e.happy.visible = look.eyes === 'happy';
          e.closed.visible = look.eyes === 'closed';
          e.whole.scale.setScalar(wide ? 1.08 : 1);
        }
        (Object.keys(mouths) as MouthKind[]).forEach((m) => { mouths[m].visible = m === look.mouth; });
        brows[0].visible = brows[1].visible = look.brows !== 'none';
        const worried = look.brows === 'worried';
        brows[0].rotation.z = Math.PI / 2 - (worried ? 0.28 : 0.12); brows[1].rotation.z = Math.PI / 2 + (worried ? 0.28 : 0.12);
        brows[0].position.y = brows[1].position.y = worried ? 1.76 : 1.7;
      }
      for (const e of eyes) e.pupil.position.set(p.lookX * 0.011, -p.lookY * 0.011, 0);
      oMouth.scale.setScalar(p.mouthScale);
    },
    dispose() {
      toDispose.forEach((m) => m.dispose());
      shadowTex.dispose();
    },
  };
}

/** Camera + lights shared by the big character and the small snapshots. */
export function createStage(aspect: number): { scene: Scene; camera: PerspectiveCamera } {
  const scene = new Scene();
  scene.add(new AmbientLight(0xffffff, 0.2 * Math.PI));
  scene.add(new HemisphereLight(0xeaf4ff, 0xb08a6e, 0.34 * Math.PI)); // sky above, warm ground bounce below
  const key = new DirectionalLight(0xfff0dc, 0.66 * Math.PI);
  key.position.set(3.5, 7, 9);
  scene.add(key);
  const rim = new DirectionalLight(0xbfe3ff, 0.22 * Math.PI);
  rim.position.set(-5, 3, -6);
  scene.add(rim);
  const rim2 = new DirectionalLight(0xffe9c8, 0.2 * Math.PI);
  rim2.position.set(6, 4, -5);
  scene.add(rim2);
  const camera = new PerspectiveCamera(30, aspect, 0.1, 60);
  camera.position.set(0, 4.6, 14.3);
  camera.lookAt(0, 3.3, 0);
  return { scene, camera };
}
