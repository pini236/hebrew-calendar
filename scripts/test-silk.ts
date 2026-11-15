// The silk ribbon's physics (src/components/silk.ts), headless: it keeps its length, it moves only a
// little, it always comes to rest (so the app stops drawing), and nothing the page does can break it.
import { SilkSim } from '../src/components/silk';

let failed = 0;
function check(name: string, ok: boolean, info = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${info ? `  (${info})` : ''}`);
  if (!ok) failed++;
}

function links(s: SilkSim) {
  let worst = 0;
  for (let i = 0; i < s.n - 1; i++) {
    const d = Math.hypot(s.x[i + 1] - s.x[i], s.y[i + 1] - s.y[i], s.z[i + 1] - s.z[i]);
    worst = Math.max(worst, Math.abs(d - s.seg) / s.seg);
  }
  return worst;
}
const finite = (s: SilkSim) => [...s.x, ...s.y, ...s.z, ...s.th].every(Number.isFinite);
const tipOff = (s: SilkSim) => Math.hypot(s.x[s.n - 1] - s.ax, s.z[s.n - 1]);

/** run until still; returns the seconds it took (Infinity if it never settles) and the worst values seen */
function runUntilStill(s: SilkSim, max: number, anchor?: (t: number) => number) {
  let worstLink = 0;
  let worstOff = 0;
  let worstZ = 0;
  for (let t = 0; t < max; t += 1 / 60) {
    const moving = s.advance(1 / 60, 0, anchor ? anchor(t) : s.ay);
    worstLink = Math.max(worstLink, links(s));
    worstOff = Math.max(worstOff, tipOff(s));
    for (let i = 0; i < s.n; i++) worstZ = Math.min(worstZ, s.z[i]);
    if (!moving) return { secs: t, worstLink, worstOff, worstZ };
  }
  return { secs: Infinity, worstLink, worstOff, worstZ };
}

for (const spec of [
  { name: 'hero 18×46', width: 18, length: 46, segments: 14 },
  { name: 'tab 13×15', width: 13, length: 15, segments: 7 },
]) {
  for (const seed of [1, 2, 3, 4, 5]) {
    const s = new SilkSim({ ...spec, seed });
    const tag = `${spec.name} seed ${seed}`;
    const len = s.y[s.n - 1] - s.ay;
    if (seed === 1) check(`${spec.name}: hangs at its length at rest`, len > spec.length * 0.98 && len <= spec.length * 1.01, `${len.toFixed(2)} of ${spec.length}`);

    s.drop();
    const d = runUntilStill(s, 8);
    check(`${tag}: drops in and settles`, d.secs < 5 && finite(s), `${d.secs.toFixed(2)} s`);

    s.gust(1);
    const g = runUntilStill(s, 14);
    check(`${tag}: a gust moves it a little, then it stops`, g.secs < 10 && g.worstOff > 0.3 && g.worstOff < spec.length * 0.35, `${g.secs.toFixed(2)} s, tip ${g.worstOff.toFixed(2)} px`);
    check(`${tag}: inextensible and never through the page`, g.worstLink < 0.03 && g.worstZ >= 0, `links ±${(g.worstLink * 100).toFixed(1)}%`);

    // a fling: the page runs up at 1400 px/s, slows down, then comes back
    let v = 0;
    let y = 0;
    const f = runUntilStill(s, 14, (t) => {
      const target = t < 0.35 ? -1400 : t > 1.2 && t < 1.5 ? 1400 : 0;
      v += Math.max(-1400 / 60, Math.min(1400 / 60, target - v));
      y += v / 60;
      return y;
    });
    check(`${tag}: a fling and back, then still`, f.secs < 10 && finite(s) && f.worstLink < 0.05, `${f.secs.toFixed(2)} s, tip ${f.worstOff.toFixed(2)} px`);

    // nonsense from the page: jumps and jerks of thousands of px/s every frame
    let ny = 0;
    let r = seed;
    for (let k = 0; k < 600; k++) {
      r = (r * 16807) % 2147483647;
      ny += ((r / 2147483647) * 2 - 1) * 80;
      s.advance(1 / 60, 0, ny);
      if (k % 50 === 0) s.shake((r % 3000) - 1500, (r % 2000) - 1000);
    }
    check(`${tag}: survives a violent page`, finite(s));
    const after = runUntilStill(s, 15);
    check(`${tag}: and still comes to rest`, after.secs < 12, `${after.secs.toFixed(2)} s`);
  }
}

if (failed) {
  console.log(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nsilk: all passed');
