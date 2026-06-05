/* ============================================================
 * PRICE SCOUT — test/run.cjs
 * Dependency-free Node harness for the PURE price logic — the part
 * that decides "did the price move, how much, and is it good or bad
 * for the seller". The UI needs Chrome, but this validates the brain.
 *
 * Run:  node test/run.cjs   (must be .cjs — repo root is type:module)
 * ============================================================ */
'use strict';

global.self = global;
require('../utils/price.js');
const P = global.PSPrice;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + '   <-- FAIL'); }
}
function eq(name, a, b) { ok(name + ' (=' + JSON.stringify(b) + ', got ' + JSON.stringify(a) + ')', a === b); }

console.log('parsePrice:');
eq("'29,900원'", P.parsePrice('29,900원'), 29900);
eq("'₩1,299,000'", P.parsePrice('₩1,299,000'), 1299000);
eq("'  39900 '", P.parsePrice('  39900 '), 39900);
eq('number 25000', P.parsePrice(25000), 25000);
eq("'$24'", P.parsePrice('$24'), 24);
eq("'' -> 0", P.parsePrice(''), 0);
eq("'무료' -> 0", P.parsePrice('무료'), 0);

console.log('\npctChange:');
eq('10000 -> 9000 = -10', P.pctChange(10000, 9000), -10);
eq('10000 -> 12000 = 20', P.pctChange(10000, 12000), 20);
eq('0 base -> 0', P.pctChange(0, 5000), 0);

console.log('\nsummarize:');
const hist = [
  { ts: 1, price: 10000 },
  { ts: 2, price: 9000 },
  { ts: 3, price: 11000 },
  { ts: 4, price: 9500 },
];
const s = P.summarize(hist);
eq('current', s.current, 9500);
eq('first', s.first, 10000);
eq('lowest', s.lowest, 9000);
eq('highest', s.highest, 11000);
eq('count', s.count, 4);
eq('changedPct (10000->9500)', s.changedPct, -5);
ok('empty history safe', P.summarize([]).current === 0 && P.summarize(null).count === 0);

console.log('\nclassifyForSeller (seller POV):');
ok('competitor DOWN -> threat', (() => { const c = P.classifyForSeller(10000, 9000); return c.dir === 'down' && c.kind === 'threat' && c.pct === -10; })());
ok('competitor UP -> opportunity', (() => { const c = P.classifyForSeller(10000, 12000); return c.dir === 'up' && c.kind === 'opportunity' && c.pct === 20; })());
ok('no change -> neutral', (() => { const c = P.classifyForSeller(10000, 10000); return c.dir === 'same' && c.kind === 'neutral'; })());

console.log('\nvsMyPrice:');
ok('competitor cheaper than me', (() => { const v = P.vsMyPrice(10000, 8000); return v.status === 'cheaper' && v.diff === -2000; })());
ok('competitor pricier than me', (() => { const v = P.vsMyPrice(10000, 12000); return v.status === 'pricier' && v.diff === 2000; })());
ok('equal', P.vsMyPrice(10000, 10000).status === 'equal');
ok('unknown when missing', P.vsMyPrice(0, 8000).status === 'unknown');

console.log('\nsparkline:');
const sp = P.sparkline(hist, 120, 32, 3);
ok('points count == history count', sp.points.split(' ').length === 4);
ok('min/max correct', sp.min === 9000 && sp.max === 11000);
ok('flat series centered', P.sparkline([{ ts: 1, price: 5000 }, { ts: 2, price: 5000 }], 100, 30, 2).flat === true);
ok('empty -> no points', P.sparkline([], 100, 30).points === '');

console.log('\nappendPoint:');
ok('appends new price', P.appendPoint([{ ts: 1, price: 100 }], 200, 2).length === 2);
ok('dedupes same price', P.appendPoint([{ ts: 1, price: 100 }], 100, 2).length === 1);
ok('ignores zero', P.appendPoint([{ ts: 1, price: 100 }], 0, 2).length === 1);
ok('caps length', P.appendPoint(Array.from({ length: 180 }, (_, i) => ({ ts: i, price: i + 1 })), 999, Date.now(), 180).length === 180);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
