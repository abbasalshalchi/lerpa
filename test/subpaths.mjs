// A merged fill that carries several rings is laid down as several subpaths.
//
//   node test/subpaths.mjs
//
// Recorded against a stub context, so it needs no canvas and no DOM.
//
// Why this file exists: VecBake has written multi-ring merged fills since its
// `42fa586`, and a player that does not read the `sp` field draws every ring of
// one element as a single path. The jumps between ring ends then cut straight
// across the part -- seen on Apollo-Soyuz as a dark wedge over the docking
// module, and misdiagnosed twice as a baker bug before the player turned out to
// be an old copy. The checks below are the difference between the two readings.

import { LerpaPlayer } from '../src/player.js';

let fails = 0;
const check = (label, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`);
  if (!cond) fails++;
};

// Records what was asked of the context instead of rasterising it.
const recorder = () => {
  const ops = [];
  return {
    ops,
    moveTo: (x, y) => ops.push(['M', x, y]),
    lineTo: (x, y) => ops.push(['L', x, y]),
    bezierCurveTo: (ax, ay, bx, by, x, y) => ops.push(['C', ax, ay, bx, by, x, y]),
    closePath: () => ops.push(['Z']),
  };
};

const player = () => Object.create(LerpaPlayer.prototype);

// Three unit squares, 4 points each, 100 apart: a fill of three rings.
const square = (x, y) => [x, y, x + 10, y, x + 10, y + 10, x, y + 10];
const rings = [square(0, 0), square(100, 0), square(200, 0)];
const scratch = Float32Array.from(rings.flat());

const el = (over) => ({ offset: 0, npts: 12, smooth: null, subpaths: null, ...over });

// --- one ring behaves exactly as it always did -------------------------------

let ctx = recorder();
player()._tracePath(ctx, Float32Array.from(rings[0]), el({ npts: 4 }), true);
check('a single-ring fill traces one closed path',
      ctx.ops.filter((o) => o[0] === 'M').length === 1 &&
      ctx.ops.filter((o) => o[0] === 'Z').length === 1,
      ctx.ops.map((o) => o[0]).join(''));

// A one-entry `sp` is decoded to null, so it must trace the same ops.
const one = recorder();
player()._tracePath(one, scratch, el({ subpaths: [12] }), true);
const whole = recorder();
player()._tracePath(whole, scratch, el(), true);
check('a fill whose sp names one ring traces the same path as no sp at all',
      JSON.stringify(one.ops) === JSON.stringify(whole.ops));

// --- three rings are three subpaths ------------------------------------------

ctx = recorder();
player()._tracePath(ctx, scratch, el({ subpaths: [4, 4, 4] }), true);
const kinds = ctx.ops.map((o) => o[0]).join('');
check('three rings open and close three subpaths', kinds === 'MLLLZMLLLZMLLLZ', kinds);

// Every point drawn must come from the ring being drawn. This is the wedge:
// unsplit, the path runs from ring 1's last point straight to ring 2's first.
const drawn = [[], [], []];
let at = -1;
for (const op of ctx.ops) {
  if (op[0] === 'M') at++;
  if (op[0] === 'M' || op[0] === 'L') drawn[at].push(op[1], op[2]);
}
check('no segment crosses from one ring to the next',
      drawn.every((pts, i) => JSON.stringify(pts) === JSON.stringify(rings[i])),
      drawn.map((p) => p.length / 2).join('/') + ' points per ring');

// What the old player did with the same element, for the record.
const flat = recorder();
player()._tracePath(flat, scratch, el(), true);
check('...and the single-path reading really does cross (what the wedge was)',
      flat.ops.some((o) => o[0] === 'L' && o[1] === 100 && o[2] === 0),
      flat.ops.filter((o) => o[0] === 'L').length + ' lineTo across all three rings');

// --- the element's offset still applies -------------------------------------

const padded = Float32Array.from([-1, -1, -1, -1, -1, -1, ...rings.flat()]);
ctx = recorder();
player()._tracePath(ctx, padded, el({ offset: 6, subpaths: [4, 4, 4] }), true);
check('subpaths are addressed from the element offset, not the buffer start',
      ctx.ops[0][1] === 0 && ctx.ops[0][2] === 0 && ctx.ops[5][1] === 100,
      JSON.stringify(ctx.ops[5]));

// --- a smooth ring's tangents wrap inside its own ring ----------------------
// Two identical rings 100 apart with every vertex smooth: ring 2's curve must
// be ring 1's, translated. If a tangent reached into the neighbouring ring --
// the first vertex looking back at the *previous* ring's last point -- the two
// would differ at the seam.

const smooth = el({ npts: 8, subpaths: [4, 4], smooth: new Uint8Array([1, 1, 1, 1, 1, 1, 1, 1]) });
const two = Float32Array.from([...rings[0], ...rings[1]]);
ctx = recorder();
player()._tracePath(ctx, two, smooth, true);
const curves = ctx.ops.filter((o) => o[0] === 'C');
const a = curves.slice(0, 4), b = curves.slice(4, 8);
check('a smooth ring is all cubics', curves.length === 8, `${curves.length} of 8`);
check('the second ring curves exactly like the first, translated',
      a.length === 4 && b.length === 4 &&
      a.every((op, i) => op.slice(1).every((v, k) => Math.abs(v + (k % 2 === 0 ? 100 : 0) - b[i][k + 1]) < 1e-6)),
      JSON.stringify(b[0] && b[0].slice(1)));

console.log(`\n${fails} failure(s)`);
process.exit(fails ? 1 : 0);
