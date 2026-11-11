// dice-roller-bd -- pure dice logic. No DOM, no randomness source of its own:
// every roll takes an rng function returning [0,1) so tests can inject a
// deterministic sequence. Browser code passes Math.random.
(function (root) {
  'use strict';

  var VALID_SIDES = [4, 6, 8, 10, 12, 20, 100];
  var MAX_COUNT = 20;
  var MAX_MOD = 99;

  // Parse dice notation like "2d6+3", "4d6dl1", "d20", "2d20kh1", "d%", "3d8-2".
  // Returns { ok:true, dice:{count,sides}, modifier, dropLowest, dropHighest,
  //   keepHighest, keepLowest, source } or { ok:false, error } where error is
  //   one of: 'empty','syntax','sides','count','keep','drop','modifier'.
  function parseNotation(raw) {
    if (raw === undefined || raw === null) return { ok: false, error: 'empty' };
    var s = String(raw).replace(/\s+/g, '').toLowerCase();
    if (!s) return { ok: false, error: 'empty' };
    // modifier: trailing +N / -N (after the dice part and any drop/keep suffix)
    var modifier = 0;
    var m = s.match(/([+-]\d+)$/);
    if (m) {
      modifier = parseInt(m[1], 10);
      if (isNaN(modifier) || Math.abs(modifier) > MAX_MOD) return { ok: false, error: 'modifier' };
      s = s.slice(0, s.length - m[1].length);
    }
    // drop/keep suffix: dlK / dhK / khK / klK
    var dropLowest = 0, dropHighest = 0, keepHighest = 0, keepLowest = 0;
    var suf = s.match(/(dl|dh|kh|kl)(\d+)$/);
    if (suf) {
      var k = parseInt(suf[2], 10);
      if (suf[1] === 'dl') dropLowest = k;
      else if (suf[1] === 'dh') dropHighest = k;
      else if (suf[1] === 'kh') keepHighest = k;
      else keepLowest = k;
      s = s.slice(0, s.length - suf[0].length);
    }
    // core: [N]dS  where S is a number or %
    var core = s.match(/^(\d*)d(\d+|%)$/);
    if (!core) return { ok: false, error: 'syntax' };
    var count = core[1] === '' ? 1 : parseInt(core[1], 10);
    var sides = core[2] === '%' ? 100 : parseInt(core[2], 10);
    if (VALID_SIDES.indexOf(sides) === -1) return { ok: false, error: 'sides' };
    if (count < 1 || count > MAX_COUNT) return { ok: false, error: 'count' };
    var kept = keepHighest || keepLowest;
    if (kept && (kept < 1 || kept >= count)) return { ok: false, error: 'keep' };
    var dropped = dropLowest || dropHighest;
    if (dropped && (dropped < 1 || dropped >= count)) return { ok: false, error: 'drop' };
    if ((dropLowest || dropHighest) && (keepHighest || keepLowest)) return { ok: false, error: 'syntax' };
    return {
      ok: true, dice: { count: count, sides: sides }, modifier: modifier,
      dropLowest: dropLowest, dropHighest: dropHighest,
      keepHighest: keepHighest, keepLowest: keepLowest, source: String(raw).trim()
    };
  }

  function rollOne(sides, rng) {
    return 1 + Math.floor(rng() * sides);
  }

  // Roll a parsed notation. Returns faces (all rolled dice, each {sides,value,kept}),
  // total, min and max possible totals.
  function rollNotation(parsed, rng) {
    var faces = [];
    var i;
    for (i = 0; i < parsed.dice.count; i++) {
      faces.push({ sides: parsed.dice.sides, value: rollOne(parsed.dice.sides, rng), kept: true });
    }
    var sorted = faces.slice().sort(function (a, b) { return a.value - b.value; });
    var n = 0;
    if (parsed.dropLowest) { for (i = 0; i < parsed.dropLowest; i++) sorted[i].kept = false; }
    if (parsed.dropHighest) { for (i = 0; i < parsed.dropHighest; i++) sorted[sorted.length - 1 - i].kept = false; }
    if (parsed.keepHighest) { for (i = 0; i < sorted.length - parsed.keepHighest; i++) sorted[i].kept = false; }
    if (parsed.keepLowest) { for (i = 0; i < sorted.length - parsed.keepLowest; i++) sorted[sorted.length - 1 - i].kept = false; }
    var keptCount = 0, total = parsed.modifier;
    faces.forEach(function (f) { if (f.kept) { keptCount++; total += f.value; } });
    var min = keptCount * 1 + parsed.modifier;
    var max = keptCount * parsed.dice.sides + parsed.modifier;
    return { faces: faces, total: total, min: min, max: max, keptCount: keptCount };
  }

  // Roll a pool: {d4:2, d6:1, ...} plus modifier. mode: 'normal' | 'advantage' |
  // 'disadvantage'. Advantage/disadvantage only applies when the pool is exactly
  // one d20; otherwise it is ignored and reported as ignored:true.
  function rollPool(pool, modifier, mode, rng) {
    var faces = [];
    var sidesList = VALID_SIDES.slice();
    var totalDice = 0;
    sidesList.forEach(function (sides) {
      var c = pool['d' + sides] || 0;
      totalDice += c;
      for (var i = 0; i < c; i++) faces.push({ sides: sides, value: rollOne(sides, rng), kept: true });
    });
    var advApplied = false;
    if ((mode === 'advantage' || mode === 'disadvantage') && totalDice === 1 && faces.length === 1 && faces[0].sides === 20) {
      var second = rollOne(20, rng);
      var first = faces[0];
      if (mode === 'advantage') {
        if (second > first.value) { first.kept = false; faces.push({ sides: 20, value: second, kept: true }); }
        else faces.push({ sides: 20, value: second, kept: false });
      } else {
        if (second < first.value) { first.kept = false; faces.push({ sides: 20, value: second, kept: true }); }
        else faces.push({ sides: 20, value: second, kept: false });
      }
      advApplied = true;
    }
    var total = modifier, min = modifier, max = modifier;
    faces.forEach(function (f) { if (f.kept) { total += f.value; min += 1; max += f.sides; } });
    return {
      faces: faces, total: total, min: min, max: max,
      modeIgnored: (mode !== 'normal' && !advApplied)
    };
  }

  // Natural 20 / natural 1 on a single kept d20 (classic crit rules).
  function critFor(result) {
    var kept = result.faces.filter(function (f) { return f.kept; });
    if (kept.length !== 1 || kept[0].sides !== 20) return null;
    if (kept[0].value === 20) return 'crit';
    if (kept[0].value === 1) return 'fumble';
    return null;
  }

  function formatNotation(parsed) {
    var s = parsed.dice.count + 'd' + parsed.dice.sides;
    if (parsed.dropLowest) s += 'dl' + parsed.dropLowest;
    if (parsed.dropHighest) s += 'dh' + parsed.dropHighest;
    if (parsed.keepHighest) s += 'kh' + parsed.keepHighest;
    if (parsed.keepLowest) s += 'kl' + parsed.keepLowest;
    if (parsed.modifier > 0) s += '+' + parsed.modifier;
    if (parsed.modifier < 0) s += String(parsed.modifier);
    return s;
  }

  // Stats over a history array of {total, faces:[{sides,value,kept}]}.
  function historyStats(history) {
    var n = history.length;
    if (!n) return { count: 0, avgTotal: 0, mostCommonTotal: null, bySides: {} };
    var sum = 0, totals = {}, bySides = {};
    history.forEach(function (h) {
      sum += h.total;
      totals[h.total] = (totals[h.total] || 0) + 1;
      (h.faces || []).forEach(function (f) {
        if (!f.kept) return;
        bySides['d' + f.sides] = (bySides['d' + f.sides] || 0) + 1;
      });
    });
    var most = null, mostN = 0;
    Object.keys(totals).forEach(function (t) {
      if (totals[t] > mostN) { mostN = totals[t]; most = parseInt(t, 10); }
    });
    return { count: n, avgTotal: sum / n, mostCommonTotal: most, bySides: bySides };
  }

  // Strict validation for imported JSON payloads.
  // Shape: {app:'dice-roller-bd', version:1, presets:[{id,name,notation}], history:[{notation,total,faces:[{sides,value,kept}],at}]}
  function validateImport(payload) {
    if (!payload || typeof payload !== 'object') return { ok: false, error: 'not-object' };
    if (payload.app !== 'dice-roller-bd') return { ok: false, error: 'wrong-app' };
    if (payload.version !== 1) return { ok: false, error: 'version' };
    if (!Array.isArray(payload.presets) || !Array.isArray(payload.history)) return { ok: false, error: 'shape' };
    if (payload.presets.length > 50 || payload.history.length > 100) return { ok: false, error: 'too-big' };
    for (var i = 0; i < payload.presets.length; i++) {
      var p = payload.presets[i];
      if (!p || typeof p.name !== 'string' || !p.name.trim() || p.name.length > 60) return { ok: false, error: 'preset-name' };
      if (typeof p.notation !== 'string' || !parseNotation(p.notation).ok) return { ok: false, error: 'preset-notation' };
      if (typeof p.id !== 'string' || !p.id) return { ok: false, error: 'preset-id' };
    }
    for (var j = 0; j < payload.history.length; j++) {
      var h = payload.history[j];
      if (!h || typeof h.notation !== 'string' || !parseNotation(h.notation).ok) return { ok: false, error: 'history-notation' };
      if (typeof h.total !== 'number' || !isFinite(h.total)) return { ok: false, error: 'history-total' };
      if (!Array.isArray(h.faces)) return { ok: false, error: 'history-faces' };
      for (var k = 0; k < h.faces.length; k++) {
        var f = h.faces[k];
        if (!f || VALID_SIDES.indexOf(f.sides) === -1 || typeof f.value !== 'number' || f.value < 1 || f.value > f.sides) return { ok: false, error: 'history-face' };
      }
    }
    return { ok: true };
  }

  var api = {
    VALID_SIDES: VALID_SIDES, MAX_COUNT: MAX_COUNT, MAX_MOD: MAX_MOD,
    parseNotation: parseNotation, rollOne: rollOne, rollNotation: rollNotation,
    rollPool: rollPool, critFor: critFor, formatNotation: formatNotation,
    historyStats: historyStats, validateImport: validateImport
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DiceLogic = api;
})(typeof window !== 'undefined' ? window : globalThis);
