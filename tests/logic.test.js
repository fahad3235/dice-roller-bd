// dice-roller-bd -- node unit tests for js/logic.js (no DOM needed).
// Usage: node tests/logic.test.js   (exit 0 = all green)
const L = require('../js/logic.js');
let count = 0, failures = 0;
function check(name, cond, extra) {
  count++;
  console.log((cond ? 'ok - ' : 'FAIL - ') + name + (cond ? '' : ' :: ' + (extra || '')));
  if (!cond) failures++;
}
// Deterministic rng from a list of values in [0,1).
function seqRng(values) {
  let i = 0;
  return function () { return values[i++ % values.length]; };
}

const p = L.parseNotation;
// ---- parsing: valid ----
check('parse 2d6+3', p('2d6+3').ok && p('2d6+3').dice.count === 2 && p('2d6+3').dice.sides === 6 && p('2d6+3').modifier === 3);
check('parse d20 (count defaults 1)', p('d20').ok && p('d20').dice.count === 1 && p('d20').dice.sides === 20);
check('parse 4d6dl1', p('4d6dl1').ok && p('4d6dl1').dropLowest === 1);
check('parse 2d20kh1', p('2d20kh1').ok && p('2d20kh1').keepHighest === 1);
check('parse 2d20kl1', p('2d20kl1').ok && p('2d20kl1').keepLowest === 1);
check('parse d% is d100', p('d%').ok && p('d%').dice.sides === 100);
check('parse 3d8-2 modifier', p('3d8-2').ok && p('3d8-2').modifier === -2);
check('parse with spaces 2D6 + 3', p(' 2D6 + 3 ').ok && p(' 2D6 + 3 ').modifier === 3);
check('parse 1d4', p('1d4').ok && p('1d4').dice.sides === 4);
check('parse 20d6 max count', p('20d6').ok);
// ---- parsing: invalid ----
check('reject empty', !p('').ok && p('').error === 'empty');
check('reject 2d7 bad sides', !p('2d7').ok && p('2d7').error === 'sides');
check('reject 2d5 bad sides', !p('2d5').ok && p('2d5').error === 'sides');
check('reject 0d6', !p('0d6').ok && p('0d6').error === 'count');
check('reject 21d6 over max', !p('21d6').ok && p('21d6').error === 'count');
check('reject 2d6kh2 keep-all', !p('2d6kh2').ok && p('2d6kh2').error === 'keep');
check('reject 2d6dl2 drop-all', !p('2d6dl2').ok && p('2d6dl2').error === 'drop');
check('reject 2d6+100 modifier', !p('2d6+100').ok && p('2d6+100').error === 'modifier');
check('reject garbage', !p('hello').ok && p('hello').error === 'syntax');
check('reject 2d6+3+4', !p('2d6+3+4').ok);
// ---- rolling with fixed rng ----
// rng 0.0 -> 1, 0.5 -> 4 on d6 (1+floor(0.5*6)=4), 0.999 -> 6
let r = L.rollNotation(p('2d6+3'), seqRng([0.0, 0.5]));
check('roll 2d6+3 with [0,0.5] = 1+4+3 = 8', r.total === 8, 'got ' + r.total);
check('roll 2d6+3 min/max 5-15', r.min === 5 && r.max === 15, r.min + '-' + r.max);
r = L.rollNotation(p('4d6dl1'), seqRng([0.0, 0.2, 0.5, 0.9])); // values 1,2,4,6 -> drop 1
check('4d6dl1 drops lowest (1+2+4+6-1=12)', r.total === 12, 'got ' + r.total);
check('4d6dl1 dropped face flagged', r.faces.filter(function (f) { return !f.kept; }).length === 1 && r.faces[0].kept === false);
r = L.rollNotation(p('2d20kh1'), seqRng([0.1, 0.9])); // 3 and 19 -> keep 19
check('2d20kh1 keeps highest 19', r.total === 19, 'got ' + r.total);
r = L.rollNotation(p('2d20kl1'), seqRng([0.1, 0.9])); // keep 3
check('2d20kl1 keeps lowest 3', r.total === 3, 'got ' + r.total);
r = L.rollNotation(p('d%'), seqRng([0.99]));
check('d% with 0.99 = 100', r.total === 100, 'got ' + r.total);
r = L.rollNotation(p('3d8-2'), seqRng([0.0, 0.0, 0.0])); // 1+1+1-2 = 1
check('3d8-2 all ones = 1', r.total === 1, 'got ' + r.total);
// ---- pool rolls ----
let pool = { d4: 0, d6: 2, d8: 0, d10: 0, d12: 0, d20: 0, d100: 0 };
r = L.rollPool(pool, 3, 'normal', seqRng([0.0, 0.5]));
check('pool 2d6+3 = 8', r.total === 8, 'got ' + r.total);
check('pool normal mode not ignored', r.modeIgnored === false);
pool = { d4: 0, d6: 0, d8: 0, d10: 0, d12: 0, d20: 1, d100: 0 };
r = L.rollPool(pool, 0, 'advantage', seqRng([0.1, 0.9])); // 3 vs 19 -> keep 19
check('advantage single d20 keeps 19', r.total === 19 && r.faces.length === 2, 'got ' + r.total);
r = L.rollPool(pool, 0, 'disadvantage', seqRng([0.1, 0.9])); // keep 3
check('disadvantage single d20 keeps 3', r.total === 3, 'got ' + r.total);
pool = { d4: 0, d6: 1, d8: 0, d10: 0, d12: 0, d20: 1, d100: 0 };
r = L.rollPool(pool, 0, 'advantage', seqRng([0.5, 0.5]));
check('advantage ignored for mixed pool', r.modeIgnored === true && r.faces.length === 2, 'faces=' + r.faces.length);
// ---- crit detection ----
check('crit on natural 20', L.critFor(L.rollNotation(p('d20'), seqRng([0.99]))) === 'crit');
check('fumble on natural 1', L.critFor(L.rollNotation(p('d20'), seqRng([0.0]))) === 'fumble');
check('no crit on 2d20', L.critFor(L.rollNotation(p('2d20'), seqRng([0.99, 0.99]))) === null);
check('no crit on d6', L.critFor(L.rollNotation(p('d6'), seqRng([0.99]))) === null);
// ---- formatNotation round-trip ----
check('format 2d6+3', L.formatNotation(p('2d6+3')) === '2d6+3');
check('format 4d6dl1', L.formatNotation(p('4d6dl1')) === '4d6dl1');
check('format d20', L.formatNotation(p('d20')) === '1d20');
// ---- history stats ----
let st = L.historyStats([
  { total: 8, faces: [{ sides: 6, value: 4, kept: true }, { sides: 6, value: 4, kept: true }] },
  { total: 8, faces: [{ sides: 6, value: 5, kept: true }] },
  { total: 20, faces: [{ sides: 20, value: 20, kept: true }] }
]);
check('stats count 3', st.count === 3);
check('stats avg 12', st.avgTotal === 12, 'got ' + st.avgTotal);
check('stats most common 8', st.mostCommonTotal === 8);
check('stats bySides d6=3 d20=1', st.bySides.d6 === 3 && st.bySides.d20 === 1, JSON.stringify(st.bySides));
check('stats empty', L.historyStats([]).count === 0 && L.historyStats([]).mostCommonTotal === null);
// ---- import validation ----
const good = {
  app: 'dice-roller-bd', version: 1,
  presets: [{ id: 'x', name: 'Fireball', notation: '8d6' }],
  history: [{ notation: '2d6+3', total: 8, faces: [{ sides: 6, value: 4, kept: true }, { sides: 6, value: 4, kept: true }], at: '2026-11-11T00:00:00.000Z' }]
};
check('validate good import', L.validateImport(good).ok);
check('reject wrong app', !L.validateImport({ app: 'launch-fare-bd', version: 1, presets: [], history: [] }).ok);
check('reject bad version', !L.validateImport({ app: 'dice-roller-bd', version: 2, presets: [], history: [] }).ok);
check('reject bad preset notation', !L.validateImport({ app: 'dice-roller-bd', version: 1, presets: [{ id: 'x', name: 'Bad', notation: '2d7' }], history: [] }).ok);
check('reject bad history face value', !L.validateImport({ app: 'dice-roller-bd', version: 1, presets: [], history: [{ notation: 'd6', total: 7, faces: [{ sides: 6, value: 7, kept: true }] }] }).ok);
check('reject null', !L.validateImport(null).ok);
check('reject too many presets', !L.validateImport({ app: 'dice-roller-bd', version: 1, presets: new Array(51).fill({ id: 'x', name: 'n', notation: 'd6' }), history: [] }).ok);

console.log('\n' + count + ' checks, ' + failures + ' failed');
process.exit(failures ? 1 : 0);
