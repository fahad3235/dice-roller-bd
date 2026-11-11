// dice-roller-bd -- headless-Chrome smoke test via raw CDP (no puppeteer).
// Usage: node tests/smoke.js
// Exits non-zero on any failed assertion; fails on page console errors.
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const PORT = 9357;
const BASE = 'file://' + path.resolve(__dirname, '..', 'index.html');
let failures = 0;
let count = 0;
const pageErrors = [];
function check(name, cond, extra) {
  count++;
  console.log((cond ? 'ok - ' : 'FAIL - ') + name + (cond ? '' : ' :: ' + (extra || '')));
  if (!cond) failures++;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const CHROME_BIN = process.env.CHROME_BIN ||
    require('os').homedir() + '/.cache/ms-playwright/chromium_headless_shell-1187/chrome-linux/headless_shell';
  const chrome = spawn(CHROME_BIN, [
    '--headless=new', '--no-sandbox', '--disable-gpu',
    '--remote-debugging-port=' + PORT, '--user-data-dir=/tmp/drbd-smoke-' + process.pid,
    'about:blank',
  ], { stdio: 'ignore' });
  let targets = [];
  for (let i = 0; i < 50 && targets.length === 0; i++) {
    await wait(200);
    try {
      targets = JSON.parse(await new Promise((res, rej) => {
        http.get('http://127.0.0.1:' + PORT + '/json/list', (r) => {
          let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => res(d));
        }).on('error', rej);
      }));
    } catch (e) { /* retry */ }
  }
  if (!targets.length) { console.log('FAIL - chrome did not start'); process.exit(2); }
  const wsUrl = targets[0].webSocketDebuggerUrl;
  const ws = new WebSocket(wsUrl);
  await new Promise((res) => { ws.onopen = res; });
  let seq = 0; const pending = new Map();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    if (msg.method === 'Runtime.exceptionThrown') {
      pageErrors.push('exception: ' + JSON.stringify(msg.params.exceptionDetails).slice(0, 300));
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      pageErrors.push('console.error: ' + JSON.stringify(msg.params.args).slice(0, 300));
    }
  };
  function send(method, params) {
    return new Promise((res) => {
      const id = ++seq;
      pending.set(id, res);
      ws.send(JSON.stringify({ id, method, params: params || {} }));
    });
  }
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  const nav = async (url) => { await send('Page.navigate', { url }); await wait(1200); };
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) return { error: JSON.stringify(r.result.exceptionDetails).slice(0, 300) };
    return r.result ? r.result.result.value : undefined;
  };
  const clickTab = async (name) => ev(`document.querySelector('[data-tab="${name}"]').click()`);
  const BN_TITLE = '\u09a1\u09be\u0987\u09b8\u0020\u09b0\u09cb\u09b2\u09be\u09b0\u0020\u09ac\u09bf\u09a1\u09bf';

  // ---- Load: defaults ----
  await nav(BASE);
  check('page title mentions Dice Roller', (await ev('document.title'))?.includes('Dice Roller'));
  check('7 quick dice cards', (await ev(`document.querySelectorAll('#quickDice .die-card').length`)) === 7);
  check('pool empty message shown', (await ev(`document.getElementById('poolEmpty').hidden`)) === false);
  check('roll pool disabled when empty', (await ev(`document.getElementById('rollPoolBtn').disabled`)) === true);
  check('4 built-in presets', (await ev(`document.querySelectorAll('#presetList .preset-card').length`)) === 4);
  check('guide renders 7 items', (await ev(`document.querySelectorAll('#guideList li').length`)) === 7);
  check('result empty state shown', (await ev(`document.getElementById('resultEmpty').hidden`)) === false);

  // ---- Quick dice: add 2d6, modifier +3, deterministic pool roll = 8 ----
  await ev(`document.querySelector('[data-die="d6"][data-delta="1"]').click()`);
  await ev(`document.querySelector('[data-die="d6"][data-delta="1"]').click()`);
  check('pool shows 2d6 chip', (await ev(`document.getElementById('poolList').textContent`)).includes('2d6'));
  check('d6 count reads x 2', (await ev(`document.querySelector('[data-count-for="d6"]').textContent`)).includes('2'));
  await ev(`document.getElementById('modifierInput').value='3'`);
  await ev(`window.__drbd.rollPoolWith([0, 0.5])`);
  check('pool 2d6+3 deterministic total 8', (await ev(`document.getElementById('resultTotal').textContent`)) === '8');
  check('pool result notation 2d6+3', (await ev(`document.getElementById('resultNotation').textContent`)) === '2d6+3');
  check('pool range shows 5 - 15', (await ev(`document.getElementById('resultRange').textContent`)) === '5 - 15');
  check('pool shows 2 die faces', (await ev(`document.querySelectorAll('#dieFaces .die-face').length`)) === 2);
  check('history has 1 roll', (await ev(`window.__drbd.state.history.length`)) === 1);

  // ---- Notation: 4d6dl1 deterministic = 12, one dropped face ----
  await ev(`window.__drbd.rollNotationWith('4d6dl1', [0, 0.2, 0.5, 0.9])`);
  check('4d6dl1 total 12', (await ev(`document.getElementById('resultTotal').textContent`)) === '12');
  check('4d6dl1 one dropped face', (await ev(`document.querySelectorAll('#dieFaces .die-face.dropped').length`)) === 1);
  check('4d6dl1 notation shown', (await ev(`document.getElementById('resultNotation').textContent`)) === '4d6dl1');

  // ---- Crit / fumble on single d20 ----
  await ev(`window.__drbd.rollNotationWith('d20', [0.99])`);
  check('d20 0.99 = 20', (await ev(`document.getElementById('resultTotal').textContent`)) === '20');
  check('crit badge shown for natural 20', (await ev(`document.getElementById('critBadge').hidden`)) === false);
  check('crit badge text', (await ev(`document.getElementById('critBadge').textContent`)).includes('Critical hit'));
  await ev(`window.__drbd.rollNotationWith('d20', [0.0])`);
  check('d20 0.0 = 1', (await ev(`document.getElementById('resultTotal').textContent`)) === '1');
  check('fumble badge shown for natural 1', (await ev(`document.getElementById('critBadge').textContent`)).includes('Critical fail'));

  // ---- Advantage / disadvantage on single d20 pool ----
  await ev(`document.getElementById('clearPoolBtn').click()`);
  await ev(`document.querySelector('[data-die="d20"][data-delta="1"]').click()`);
  await ev(`document.getElementById('modifierInput').value='0'`);
  await ev(`document.getElementById('modeSelect').value='advantage'`);
  await ev(`window.__drbd.rollPoolWith([0.1, 0.9])`);
  check('advantage keeps 19', (await ev(`document.getElementById('resultTotal').textContent`)) === '19');
  await ev(`document.getElementById('modeSelect').value='disadvantage'`);
  await ev(`window.__drbd.rollPoolWith([0.1, 0.9])`);
  check('disadvantage keeps 3', (await ev(`document.getElementById('resultTotal').textContent`)) === '3');
  await ev(`document.getElementById('modeSelect').value='normal'`);
  // advantage ignored on a mixed pool
  await ev(`document.querySelector('[data-die="d6"][data-delta="1"]').click()`);
  await ev(`document.getElementById('modeSelect').value='advantage'`);
  await ev(`window.__drbd.rollPoolWith([0.5, 0.5])`);
  check('advantage ignored note on mixed pool', (await ev(`document.getElementById('modeIgnored').hidden`)) === false);
  await ev(`document.getElementById('modeSelect').value='normal'`);
  await ev(`document.getElementById('clearPoolBtn').click()`);

  // ---- Invalid notation shows inline error ----
  await ev(`document.getElementById('notationInput').value='2d7'; document.getElementById('rollNotationBtn').click()`);
  check('2d7 shows error', (await ev(`document.getElementById('notationError').hidden`)) === false);
  check('2d7 error names sides', (await ev(`document.getElementById('notationError').textContent`)).includes('sides'));
  await ev(`document.getElementById('notationInput').value='hello'; document.getElementById('rollNotationBtn').click()`);
  check('garbage notation shows error', (await ev(`document.getElementById('notationError').textContent`)).includes('look right'));
  await ev(`window.__drbd.rollNotationWith('2d6+3', [0, 0.5])`);
  check('valid roll clears error', (await ev(`document.getElementById('notationError').hidden`)) === true);

  // ---- Save preset from last roll ----
  await ev(`document.getElementById('presetName').value='Test Fire'; document.getElementById('savePresetBtn').click()`);
  check('save shows confirmation', (await ev(`document.getElementById('savePresetMsg').hidden`)) === false);
  await clickTab('presets');
  check('5 preset cards (4 built-in + 1 saved)', (await ev(`document.querySelectorAll('#presetList .preset-card').length`)) === 5);
  check('saved preset name shown', (await ev(`document.getElementById('presetList').textContent`)).includes('Test Fire'));
  check('built-in badge shown', (await ev(`document.querySelectorAll('#presetList .badge').length`)) === 4);
  // built-in Fireball roll button switches to roller and fills notation
  await ev(`[...document.querySelectorAll('#presetList .preset-card')].find(c => c.textContent.includes('Fireball')).querySelector('.btn.primary').click()`);
  check('preset roll switches to roller tab', (await ev(`document.querySelector('[data-tab="roll"]').classList.contains('active')`)) === true);
  check('preset roll fills notation 8d6', (await ev(`document.getElementById('notationInput').value`)) === '8d6');
  check('preset roll shows result', (await ev(`document.getElementById('resultContent').hidden`)) === false);
  // delete the saved preset
  await clickTab('presets');
  await ev(`[...document.querySelectorAll('#presetList .preset-card')].find(c => c.textContent.includes('Test Fire')).querySelectorAll('button')[1].click()`);
  check('delete removes saved preset', (await ev(`document.querySelectorAll('#presetList .preset-card').length`)) === 4);

  // ---- History tab: stats + clear ----
  await clickTab('history');
  const rollCount = await ev(`window.__drbd.state.history.length`);
  check('history has rolls recorded', rollCount >= 8, 'count=' + rollCount);
  check('stats rolls matches history', (await ev(`document.getElementById('statRolls').textContent`)) === String(rollCount));
  check('stats avg shown', (await ev(`document.getElementById('statAvg').textContent`)) !== '-');
  check('history cards rendered', (await ev(`document.querySelectorAll('#historyList .history-card').length`)) === rollCount);
  await ev(`document.getElementById('clearHistoryBtn').click()`);
  check('clear history empties list', (await ev(`window.__drbd.state.history.length`)) === 0);
  check('clear history shows message', (await ev(`document.getElementById('clearedMsg').hidden`)) === false);
  check('history empty message shows', (await ev(`document.getElementById('historyEmpty').hidden`)) === false);

  // ---- Export / erase / import round-trip via test hooks ----
  await clickTab('roll');
  await ev(`window.__drbd.rollNotationWith('2d6+3', [0, 0.5])`);
  await ev(`document.getElementById('presetName').value='Export check'; document.getElementById('savePresetBtn').click()`);
  const payload = await ev(`window.__drbd.exportPayload()`);
  check('export payload is dice-roller-bd v1', payload.includes('"app":"dice-roller-bd"') && payload.includes('"version":1'), payload.slice(0, 120));
  check('export carries the saved preset', payload.includes('Export check'));
  await ev(`window.__drbd.eraseAll()`);
  check('eraseAll empties presets+history', (await ev(`window.__drbd.exportPayload()`)).includes('"presets":[]') && (await ev(`window.__drbd.exportPayload()`)).includes('"history":[]'));
  const imp = await ev(`JSON.stringify(window.__drbd.importPayload(${JSON.stringify(payload)}))`);
  check('import valid payload ok', imp.includes('"ok":true'), imp);
  check('import restores preset', (await ev(`window.__drbd.exportPayload()`)).includes('Export check'));
  const badImp = await ev(`JSON.stringify(window.__drbd.importPayload('{"app":"launch-fare-bd","version":1,"presets":[],"history":[]}'))`);
  check('import wrong app rejected', badImp.includes('"ok":false'));
  check('invalid import leaves data intact', (await ev(`window.__drbd.exportPayload()`)).includes('Export check'));

  // ---- Bad import via UI textarea; good import succeeds ----
  await clickTab('history');
  await ev(`document.getElementById('importText').value='{not json'; document.getElementById('importBtn').click()`);
  check('bad UI import shows error', (await ev(`document.getElementById('importFail').hidden`)) === false);
  await ev(`document.getElementById('importText').value=${JSON.stringify(payload)}; document.getElementById('importBtn').click()`);
  check('good UI import succeeds', (await ev(`document.getElementById('importOk').hidden`)) === false);

  // ---- Typed-DELETE erase via UI; wrong word rejected ----
  await ev(`document.getElementById('eraseInput').value='delete'; document.getElementById('eraseBtn').click();`);
  check('wrong erase word rejected', (await ev(`document.getElementById('eraseWrong').hidden`)) === false);
  check('wrong erase keeps data', (await ev(`window.__drbd.exportPayload()`)).includes('Export check'));
  await ev(`document.getElementById('eraseInput').value='DELETE'; document.getElementById('eraseBtn').click();`);
  check('DELETE erases data', (await ev(`window.__drbd.exportPayload()`)).includes('"presets":[]'));
  check('erase success message shows', (await ev(`document.getElementById('erasedMsg').hidden`)) === false);

  // ---- Language toggle: Bengali title + digits, persists after reload ----
  await clickTab('roll');
  await ev(`window.__drbd.rollNotationWith('2d6+3', [0, 0.5])`);
  await ev(`document.getElementById('langBtn').click()`);
  check('BN toggle: title in Bengali', (await ev(`document.getElementById('title').textContent`)) === BN_TITLE);
  check('BN toggle: total in Bengali digits', (await ev(`document.getElementById('resultTotal').textContent`)) === '\u09ee');
  check('BN toggle: tab label in Bengali', (await ev(`document.querySelector('[data-tab="presets"]').textContent`)).includes('\u09aa\u09cd\u09b0\u09bf\u09b8\u09c7\u099f'));
  await nav(BASE);
  check('BN toggle persists after reload', (await ev(`window.__drbd.state.lang`)) === 'bn');
  await ev(`document.getElementById('langBtn').click()`);
  check('back to EN', (await ev(`window.__drbd.state.lang`)) === 'en');

  // ---- Footer disclaimer ----
  check('footer mentions Math.random', (await ev(`document.getElementById('footerText').textContent`)).includes('Math.random'));

  // ---- Mobile 390px: no horizontal overflow on any tab ----
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await nav(BASE);
  for (const tab of ['roll', 'presets', 'history', 'guide']) {
    await clickTab(tab);
    await wait(300);
    const overflow = await ev(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
    check('390px no overflow on ' + tab + ' tab', overflow <= 0, 'overflow=' + overflow);
  }

  // ---- Zero network requests: app is fully offline (only file:// loads) ----
  const reqs = await ev(`performance.getEntriesByType('resource').map(r => r.name).filter(n => !n.startsWith('file://')).length`);
  check('zero non-file network requests', reqs === 0, 'non-file=' + reqs);

  check('no console/page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

  chrome.kill();
  console.log('\n' + count + ' checks, ' + failures + ' failed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log('FAIL - harness error: ' + e.message); try { chrome.kill(); } catch (_) {} process.exit(2); });
