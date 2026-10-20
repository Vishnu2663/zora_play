import test from 'node:test';
import assert from 'node:assert/strict';
import { EAR_L, EAR_R, HORN_L, HORN_R, CHEEK_L, CHEEK_R, TAIL, WING_L, WING_R, orbitDx, orbitScale, orbitX } from '../src/web/spin.ts';

const ALL = { EAR_L, EAR_R, HORN_L, HORN_R, CHEEK_L, CHEEK_R, TAIL, WING_L, WING_R };
const LATERAL = new Set(['TAIL', 'WING_L', 'WING_R']);

test('every part is exactly at rest at the start and end of a turn (no jump when the spin ends)', () => {
  for (const [name, o] of Object.entries(ALL)) {
    const lat = LATERAL.has(name);
    for (const turns of [0, 1, 2]) {
      const a = turns * Math.PI * 2;
      assert.ok(Math.abs(orbitDx(o, a)) < 1e-6, `${name} shift at ${turns} turns`);
      assert.ok(Math.abs(orbitScale(o, a, lat) - 1) < 1e-6, `${name} scale at ${turns} turns`);
    }
  }
});

test('parts stay on their circle round the body: never further from the centre than the circle, so nothing floats off', () => {
  for (const [name, o] of Object.entries(ALL)) {
    for (let a = 0; a <= Math.PI * 4; a += 0.05) {
      const off = Math.abs(orbitX(o, a) - o.cx);
      assert.ok(off <= o.r + 1e-9, `${name} at ${a.toFixed(2)}: ${off} > ${o.r}`);
    }
  }
});

test('a part passing the edge is mirrored, never stretched wildly', () => {
  for (const [name, o] of Object.entries(ALL)) {
    for (let a = 0; a <= Math.PI * 2; a += 0.05) {
      assert.ok(Math.abs(orbitScale(o, a, LATERAL.has(name))) <= 1.3 + 1e-9, name);
    }
  }
});
