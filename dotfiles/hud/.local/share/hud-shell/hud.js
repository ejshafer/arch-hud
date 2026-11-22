// ARCH // HUD shell page. Data arrives from ~/.local/bin/hud-shell through window.hud.*;
// opened in an ordinary browser (no backend) it runs a demo feed so the layout can be previewed.
'use strict';

const $ = (id) => document.getElementById(id);
const BRIDGE = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.hud;
const DEMO = !BRIDGE;
const QUICK = new URLSearchParams(location.search).has('quick');
const send = (o) => { if (BRIDGE) BRIDGE.postMessage(JSON.stringify(o)); };
const CYAN = [170, 207, 209], HOT = [232, 246, 247], DIM = [79, 101, 102], LINE = [38, 40, 40];
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const HIST = 60;

const S = {
  layout: null, info: null, cores: 0,
  cpuHist: [], rxHist: [], txHist: [],
  mem: null, globeOn: true, keysOn: true, hidden: false,
};

// ───────────────────────── layout ─────────────────────────
// hud-shell sends the layout it also used for the window-manager struts, so the
// terminal (maximised by Openbox) lands exactly inside #term-frame.
function defaultLayout(W, H) {
  const pad = 10, gap = 10, head = 22;
  return { W, H, pad, gap, head,
    colW: clamp(Math.round(W * 0.17), 250, 400),
    bottomH: clamp(Math.round(H * 0.32), 210, 380) };
}

function place(el, x, y, w, h) {
  Object.assign(el.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
}

function applyLayout(L) {
  S.layout = L;
  const topH = L.H - L.bottomH - L.gap - 2 * L.pad;
  place($('left'), L.pad, L.pad, L.colW, topH);
  place($('right'), L.W - L.pad - L.colW, L.pad, L.colW, topH);
  const tx = L.pad + L.colW + L.gap;
  place($('term'), tx, L.pad, L.W - 2 * tx, topH);
  $('term-frame').style.top = `${L.head - 4}px`;
  const by = L.H - L.pad - L.bottomH, inner = L.W - 2 * L.pad - L.gap, fsW = Math.round(inner * 0.44);
  place($('fs'), L.pad, by, fsW, L.bottomH);
  place($('kb'), L.pad + fsW + L.gap, by, inner - fsW, L.bottomH);
  document.documentElement.style.setProperty('--colW', `${L.colW}px`);
  requestAnimationFrame(() => { sizeCanvases(); layoutKeys(); });
}

function fitCanvas(cv) {
  const r = cv.getBoundingClientRect(), d = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
  if (cv.width !== Math.round(w * d) || cv.height !== Math.round(h * d)) {
    cv.width = Math.round(w * d); cv.height = Math.round(h * d);
  }
  const ctx = cv.getContext('2d');
  ctx.setTransform(d, 0, 0, d, 0, 0);
  return { ctx, w, h };
}

function sizeCanvases() {
  document.querySelectorAll('canvas').forEach((cv) => fitCanvas(cv));
  globe.resize();
  drawCpu(); drawMem(); drawNet();
}

// ───────────────────────── clock ─────────────────────────
function pad2(n) { return String(n).padStart(2, '0'); }
function clockTick() {
  const d = new Date();
  $('clock').textContent = `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
  $('c-year').textContent = String(d.getFullYear());
  $('c-date').textContent = `${MON[d.getMonth()]} ${pad2(d.getDate())}`;
}
function fmtUptime(s) {
  s = Math.floor(s);
  const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
  return d ? `${d}d ${pad2(h)}:${pad2(m)}` : `${h}:${pad2(m)}:${pad2(s % 60)}`;
}
function fmtBytes(b) {
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
  return `${b < 10 && i ? b.toFixed(2) : b < 100 && i ? b.toFixed(1) : Math.round(b)} ${u[i]}`;
}

// ───────────────────────── static info ─────────────────────────
function setInfo(info) {
  S.info = info;
  $('hw-vendor').textContent = info.vendor || '-';
  $('hw-model').textContent = info.model || '-';
  $('hw-chassis').textContent = info.chassis || '-';
  $('cpu-name').textContent = info.cpu || '-';
  $('c-type').textContent = info.type || 'linux';
  if (S.cores !== info.cores) buildCpuGraphs(info.cores || 1);
  globe.setHome(info.tz);
}

// ───────────────────────── CPU ─────────────────────────
function cpuGroups(n) {
  const per = n <= 4 ? 2 : Math.ceil(n / 2);
  const g = [];
  for (let i = 0; i < n; i += per) g.push([i, Math.min(n, i + per)]);
  return g.slice(0, 3);
}
function buildCpuGraphs(n) {
  S.cores = n;
  S.cpuHist = Array.from({ length: n }, () => new Array(HIST).fill(0));
  const box = $('cpu-graphs');
  box.replaceChildren();
  for (const [a, b] of cpuGroups(n)) {
    const row = document.createElement('div');
    row.className = 'cg';
    const lbl = document.createElement('div');
    lbl.className = 'lbl';
    lbl.innerHTML = '<span></span><small></small>';
    lbl.firstChild.textContent = b - a > 1 ? `#${a + 1}-${b}` : `#${a + 1}`;
    const cv = document.createElement('canvas');
    row.append(lbl, cv);
    row.dataset.range = `${a},${b}`;
    box.append(row);
  }
  requestAnimationFrame(sizeCanvases);
}
function drawCpu() {
  document.querySelectorAll('#cpu-graphs .cg').forEach((row) => {
    const [a, b] = row.dataset.range.split(',').map(Number);
    const { ctx, w, h } = fitCanvas(row.querySelector('canvas'));
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = rgba(LINE, 1); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, h - 0.5); ctx.lineTo(w, h - 0.5); ctx.stroke();
    let sum = 0, cnt = 0;
    for (let c = a; c < b; c++) {
      const hist = S.cpuHist[c];
      if (!hist) continue;
      ctx.strokeStyle = c === a ? rgba(CYAN, 0.95) : rgba(CYAN, 0.45);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      hist.forEach((v, i) => {
        const x = i / (HIST - 1) * w, y = h - 2 - v / 100 * (h - 4);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.stroke();
      sum += hist[HIST - 1]; cnt++;
    }
    row.querySelector('small').textContent = `Avg. ${Math.round(cnt ? sum / cnt : 0)}%`;
  });
}

// ───────────────────────── memory ─────────────────────────
function drawMem() {
  const cv = $('mem-grid');
  const { ctx, w, h } = fitCanvas(cv);
  ctx.clearRect(0, 0, w, h);
  const step = 5, cols = Math.floor(w / step), rows = Math.floor(h / step), n = cols * rows;
  const m = S.mem || { total: 1, used: 0, cached: 0 };
  const used = Math.round(n * m.used / m.total), cached = Math.round(n * m.cached / m.total);
  for (let i = 0; i < n; i++) {
    const x = (i % cols) * step, y = Math.floor(i / cols) * step;
    ctx.fillStyle = i < used ? rgba(CYAN, 0.9) : i < used + cached ? rgba(CYAN, 0.38) : rgba(DIM, 0.28);
    ctx.fillRect(x, y, 2, 2);
  }
}

// ───────────────────────── network graph ─────────────────────────
function drawNet() {
  const { ctx, w, h } = fitCanvas($('net-graph'));
  ctx.clearRect(0, 0, w, h);
  const mid = Math.round(h / 2) + 0.5;
  ctx.strokeStyle = rgba(LINE, 1); ctx.lineWidth = 1;
  for (let i = 0; i <= 6; i++) { const x = Math.round(i / 6 * w) + 0.5; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  ctx.strokeStyle = rgba(DIM, 0.8);
  ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(w, mid); ctx.stroke();
  const max = Math.max(1024, ...S.rxHist, ...S.txHist);
  const line = (hist, sign, col) => {
    ctx.strokeStyle = col; ctx.lineWidth = 1.3; ctx.beginPath();
    const off = HIST - hist.length;
    hist.forEach((v, i) => {
      const x = (off + i) / (HIST - 1) * w, y = mid - sign * v / max * (h / 2 - 3);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.stroke();
  };
  if (S.txHist.length) line(S.txHist, 1, rgba(CYAN, 0.95));
  if (S.rxHist.length) line(S.rxHist, -1, rgba(CYAN, 0.5));
  ctx.fillStyle = rgba(DIM, 1);
  ctx.font = '9px "Fira Mono", monospace';
  ctx.textAlign = 'right';
  ctx.fillText((max / 1024).toFixed(1), w - 2, 10);
  ctx.fillText('-' + (max / 1024).toFixed(1), w - 2, h - 3);
}

// ───────────────────────── live updates (from hud-shell) ─────────────────────────
function tick(t) {
  if (t.cpu) {
    t.cpu.forEach((v, i) => { if (S.cpuHist[i]) { S.cpuHist[i].push(v); S.cpuHist[i].shift(); } });
    drawCpu();
  }
  if (t.temp != null) $('cpu-temp').textContent = `${Math.round(t.temp)}°C`;
  if (t.fmin != null) { $('cpu-min').textContent = `${t.fmin.toFixed(2)}GHz`; $('cpu-max').textContent = `${t.fmax.toFixed(2)}GHz`; }
  if (t.tasks != null) $('cpu-tasks').textContent = t.tasks;
  if (t.uptime != null) $('c-up').textContent = fmtUptime(t.uptime);
  if (t.power) $('c-power').textContent = t.power;
  if (t.mem) {
    S.mem = t.mem;
    $('mem-text').textContent = `USING ${(t.mem.used / 1073741824).toFixed(1)} OUT OF ${(t.mem.total / 1073741824).toFixed(1)} GiB`;
    const st = t.mem.swapTotal || 0, su = st - (t.mem.swapFree || 0);
    $('swap-bar').style.width = st ? `${su / st * 100}%` : '0';
    $('swap-text').textContent = `${(su / 1073741824).toFixed(1)} GiB`;
    drawMem();
  }
  if (t.net) {
    const n = t.net;
    $('net-if').textContent = `Interface: ${n.iface || 'none'}`;
    $('net-state').textContent = n.iface ? (n.wifi ? 'ONLINE · WIFI' : 'ONLINE') : 'OFFLINE';
    $('net-ip').textContent = n.ip || '-';
    $('net-ping').textContent = n.ping != null ? `${Math.round(n.ping)}ms` : '--';
    S.rxHist.push(n.rx || 0); S.txHist.push(n.tx || 0);
    while (S.rxHist.length > HIST) S.rxHist.shift();
    while (S.txHist.length > HIST) S.txHist.shift();
    $('net-total').textContent = `${fmtBytes(n.txTotal || 0)} OUT, ${fmtBytes(n.rxTotal || 0)} IN`;
    drawNet();
    globe.traffic(n.rx + n.tx);
  }
}

function procs(list) {
  const tb = $('procs');
  const rows = [];
  const avail = tb.parentElement.clientHeight - 28;
  const maxRows = Math.max(1, Math.floor(avail / 16));
  for (const p of list.slice(0, maxRows)) {
    const tr = document.createElement('tr');
    for (const v of [p.pid, p.name, `${p.cpu.toFixed(1)}%`, `${p.mem.toFixed(1)}%`]) {
      const td = document.createElement('td');
      td.textContent = v;
      tr.append(td);
    }
    rows.push(tr);
  }
  tb.replaceChildren(...rows);
}

function term(t) {
  $('term-title').textContent = (t.title || 'MAIN SHELL').toUpperCase();
  $('term-idle').style.display = t.attached ? 'none' : 'flex';
}

function ws(w) {
  const box = $('ws');
  if (box.childElementCount !== w.count) {
    box.replaceChildren();
    for (let i = 0; i < w.count; i++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = pad2(i + 1);
      b.onclick = () => send({ cmd: 'ws', n: i });
      box.append(b);
    }
  }
  [...box.children].forEach((b, i) => b.classList.toggle('on', i === w.current));
}

// ───────────────────────── filesystem ─────────────────────────
const PAGE = 'M5 3a1 1 0 0 1 1-1h8l5 5v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z';
const FOLD = '<path fill="#05080d" d="M14 2.6V7h4.4z"/>';
const svg = (inner) => `<svg viewBox="0 0 24 24" aria-hidden="true">${inner}</svg>`;
const ICONS = {
  d: svg('<path d="M2 6a1 1 0 0 1 1-1h6l2 2.5h10a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z"/>'),
  up: svg('<path d="M2 6a1 1 0 0 1 1-1h6l2 2.5h10a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z"/><path fill="#05080d" d="M12 9.5l-4 4h2.6V17h2.8v-3.5H16z"/>'),
  l: svg('<path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" d="M10 14a4.5 4.5 0 0 0 6.4 0l3.2-3.2a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3.2 3.2a4.5 4.5 0 0 0 6.4 6.4l1-1"/>'),
  f: svg(`<path d="${PAGE}"/>${FOLD}`),
  code: svg(`<path d="${PAGE}"/>${FOLD}<path fill="none" stroke="#05080d" stroke-width="1.6" d="M10 12l-2.2 2.2L10 16.4M14 12l2.2 2.2L14 16.4"/>`),
  doc: svg(`<path d="${PAGE}"/>${FOLD}<path fill="#05080d" d="M8 11h8v1.4H8zM8 14h8v1.4H8zM8 17h5v1.4H8z"/>`),
  img: svg(`<path d="${PAGE}"/>${FOLD}<path fill="#05080d" d="M7.5 18.5l3-4 2 2.5 1.5-1.8 2.5 3.3z"/><circle fill="#05080d" cx="9.5" cy="11.5" r="1.3"/>`),
  vid: svg(`<path d="${PAGE}"/>${FOLD}<path fill="#05080d" d="M10 11v7l5.5-3.5z"/>`),
  aud: svg(`<path d="${PAGE}"/>${FOLD}<path fill="#05080d" d="M14.5 10v6.2a2 2 0 1 1-1.4-1.9V11.8l-3.6 1v4.6a2 2 0 1 1-1.4-1.9V11.7z"/>`),
  arc: svg(`<path d="${PAGE}"/>${FOLD}<path fill="#05080d" d="M11 3h2v1.6h-2zM11 6.2h2v1.6h-2zM11 9.4h2V11h-2zM10.2 12.6h3.6V17h-3.6z"/>`),
  x: svg('<path d="M3 4h18a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path fill="none" stroke="#05080d" stroke-width="1.8" d="M6 9.5l3 2.5-3 2.5M11 16h6"/>'),
};

function fs(d) {
  $('fs-path').textContent = d.cwd || '~';
  const grid = $('fs-grid');
  const items = [];
  if (d.error) {
    const e = document.createElement('div');
    e.className = 'fi err';
    e.textContent = d.error;
    items.push(e);
  }
  for (const e of d.entries || []) {
    const it = document.createElement('div');
    it.className = `fi t-${e.t}${e.n.startsWith('.') && e.t !== 'up' ? ' dot' : ''}`;
    it.innerHTML = ICONS[e.t] || ICONS.f;
    const s = document.createElement('span');
    s.textContent = e.n;
    it.append(s);
    it.title = e.p;
    it.onclick = () => send({ cmd: e.dir ? 'cd' : 'open', path: e.p });
    items.push(it);
  }
  grid.replaceChildren(...items);
  grid.scrollTop = 0;
  $('fs-count').textContent = d.more ? `${d.entries.length} OF ${d.entries.length + d.more} ITEMS` : `${(d.entries || []).length} ITEMS`;
  $('fs-mount').textContent = `MOUNT ${d.mount || '/'}`;
  $('fs-bar').style.width = `${d.used || 0}%`;
  $('fs-used').textContent = `USED ${Math.round(d.used || 0)}%`;
}
$('fs-hidden').onclick = () => {
  S.hidden = !S.hidden;
  $('fs-hidden').classList.toggle('on', S.hidden);
  send({ cmd: 'hidden', on: S.hidden });
  if (DEMO) demoFs();
};

// ───────────────────────── keyboard ─────────────────────────
// [label, X keycode (evdev + 8), width in units, shifted label]. Rows are 16 units wide.
const ARROW = { UP: 'M12 6l7 10H5z', DOWN: 'M12 18L5 8h14z', LEFT: 'M6 12l10-7v14z', RIGHT: 'M18 12L8 19V5z' };
const KB = [
  [['ESC', 9, 1], ['`', 49, 1, '~'], ['1', 10, 1, '!'], ['2', 11, 1, '@'], ['3', 12, 1, '#'], ['4', 13, 1, '$'], ['5', 14, 1, '%'],
    ['6', 15, 1, '^'], ['7', 16, 1, '&'], ['8', 17, 1, '*'], ['9', 18, 1, '('], ['0', 19, 1, ')'], ['-', 20, 1, '_'], ['=', 21, 1, '+'], ['BACK', 22, 2]],
  [['TAB', 23, 2], ['Q', 24], ['W', 25], ['E', 26], ['R', 27], ['T', 28], ['Y', 29], ['U', 30], ['I', 31], ['O', 32], ['P', 33],
    ['[', 34, 1, '{'], [']', 35, 1, '}'], ['\\', 51, 2, '|']],
  [['CAPS', 66, 2.25], ['A', 38], ['S', 39], ['D', 40], ['F', 41], ['G', 42], ['H', 43], ['J', 44], ['K', 45], ['L', 46],
    [';', 47, 1, ':'], ["'", 48, 1, '"'], ['ENTER', 36, 2.75]],
  [['SHIFT', 50, 2.75], ['Z', 52], ['X', 53], ['C', 54], ['V', 55], ['B', 56], ['N', 57], ['M', 58], [',', 59, 1, '<'], ['.', 60, 1, '>'],
    ['/', 61, 1, '?'], ['SHIFT', 62, 1.25], ['UP', 111, 1], [null, 0, 1]],
  [['CTRL', 37, 1.5], ['SUPER', 133, 1.25], ['ALT', 64, 1.25], ['', 65, 6.5], ['ALT GR', 108, 1.25], ['CTRL', 105, 1.25],
    ['LEFT', 113, 1], ['DOWN', 116, 1], ['RIGHT', 114, 1]],
];
const keyEls = new Map();

function buildKeys() {
  const box = $('keys');
  for (const row of KB) {
    for (const [label, code, , alt] of row) {
      if (label === null) continue;
      const k = document.createElement('div');
      k.className = `key k${code}`;
      if (ARROW[label]) {
        k.innerHTML = svg(`<path d="${ARROW[label]}"/>`);
      } else {
        const main = document.createElement('span');
        main.className = 'main';
        main.textContent = label;
        k.append(main);
        if (alt) {
          const a = document.createElement('span');
          a.className = 'alt';
          a.textContent = alt;
          k.append(a);
          k.classList.add('sym');
        }
        if (label.length > 1) k.classList.add('word');
      }
      box.append(k);
      if (!keyEls.has(code)) keyEls.set(code, []);
      keyEls.get(code).push(k);
    }
  }
}

function layoutKeys() {
  const box = $('keys');
  const W = box.clientWidth, H = box.clientHeight;
  if (!W || !H) return;
  const g = 4, unit = (W + g) / 16, rowH = (H + g) / KB.length;
  let i = 0;
  const els = box.children;
  KB.forEach((row, r) => {
    let x = 0;
    for (const [label, , w = 1] of row) {
      if (label !== null) {
        const k = els[i++];
        place(k, Math.round(x * unit), Math.round(r * rowH), Math.round(w * unit - g), Math.round(rowH - g));
      }
      x += w;
    }
  });
}

function key(code, down) {
  if (!S.keysOn) return;
  for (const k of keyEls.get(code) || []) k.classList.toggle('down', !!down);
}
function keysEnabled(on) {
  S.keysOn = on;
  $('kb').classList.toggle('off', !on);
  if (!on) document.querySelectorAll('.key.down').forEach((k) => k.classList.remove('down'));
}

// ───────────────────────── globe (ENCOM-style) ─────────────────────────
const TZ = {
  'America/New_York': [40.7, -74.0], 'America/Detroit': [42.3, -83.0], 'America/Toronto': [43.7, -79.4],
  'America/Chicago': [41.9, -87.6], 'America/Denver': [39.7, -105.0], 'America/Phoenix': [33.4, -112.1],
  'America/Los_Angeles': [34.1, -118.2], 'America/Vancouver': [49.3, -123.1], 'America/Anchorage': [61.2, -149.9],
  'Pacific/Honolulu': [21.3, -157.9], 'America/Mexico_City': [19.4, -99.1], 'America/Bogota': [4.7, -74.1],
  'America/Sao_Paulo': [-23.5, -46.6], 'America/Argentina/Buenos_Aires': [-34.6, -58.4], 'America/Halifax': [44.6, -63.6],
  'Europe/London': [51.5, -0.1], 'Europe/Dublin': [53.3, -6.3], 'Europe/Lisbon': [38.7, -9.1], 'Europe/Madrid': [40.4, -3.7],
  'Europe/Paris': [48.9, 2.35], 'Europe/Amsterdam': [52.4, 4.9], 'Europe/Brussels': [50.8, 4.4], 'Europe/Berlin': [52.5, 13.4],
  'Europe/Zurich': [47.4, 8.5], 'Europe/Rome': [41.9, 12.5], 'Europe/Vienna': [48.2, 16.4], 'Europe/Prague': [50.1, 14.4],
  'Europe/Warsaw': [52.2, 21.0], 'Europe/Stockholm': [59.3, 18.1], 'Europe/Oslo': [59.9, 10.8], 'Europe/Helsinki': [60.2, 24.9],
  'Europe/Athens': [38.0, 23.7], 'Europe/Istanbul': [41.0, 29.0], 'Europe/Kiev': [50.4, 30.5], 'Europe/Kyiv': [50.4, 30.5],
  'Europe/Moscow': [55.8, 37.6], 'Africa/Cairo': [30.0, 31.2], 'Africa/Lagos': [6.5, 3.4], 'Africa/Nairobi': [-1.3, 36.8],
  'Africa/Johannesburg': [-26.2, 28.0], 'Asia/Dubai': [25.2, 55.3], 'Asia/Karachi': [24.9, 67.0], 'Asia/Kolkata': [19.1, 72.9],
  'Asia/Bangkok': [13.8, 100.5], 'Asia/Singapore': [1.35, 103.8], 'Asia/Jakarta': [-6.2, 106.8], 'Asia/Hong_Kong': [22.3, 114.2],
  'Asia/Shanghai': [31.2, 121.5], 'Asia/Taipei': [25.0, 121.6], 'Asia/Manila': [14.6, 121.0], 'Asia/Seoul': [37.6, 127.0],
  'Asia/Tokyo': [35.7, 139.7], 'Australia/Perth': [-31.9, 115.9], 'Australia/Brisbane': [-27.5, 153.0],
  'Australia/Sydney': [-33.9, 151.2], 'Australia/Melbourne': [-37.8, 145.0], 'Pacific/Auckland': [-36.8, 174.8],
};

const globe = (() => {
  const cv = $('globe');
  const wrap = cv.parentElement;
  let ctx, W = 1, H = 1, R = 1, CX = 0, CY = 0, rotY = 0, last = 0, lastLink = 0, raf = 0;
  let home = null, rate = 1;
  const TILT = 0.38;
  const dots = [];
  for (let i = 0, N = 700; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), t = i * 2.399963;
    dots.push([Math.cos(t) * r, y, Math.sin(t) * r]);
  }
  const toVec = (la, lo) => {
    const a = la * Math.PI / 180, b = lo * Math.PI / 180;
    return [Math.cos(a) * Math.sin(b), Math.sin(a), Math.cos(a) * Math.cos(b)];
  };
  const CITIES = [
    ['NEW YORK', 40.7, -74.0], ['SAN FRANCISCO', 37.8, -122.4], ['LONDON', 51.5, -0.1], ['TOKYO', 35.7, 139.7],
    ['SYDNEY', -33.9, 151.2], ['SAO PAULO', -23.5, -46.6], ['SINGAPORE', 1.35, 103.8], ['FRANKFURT', 50.1, 8.7],
    ['MUMBAI', 19.1, 72.9], ['JOHANNESBURG', -26.2, 28.0], ['MOSCOW', 55.8, 37.6], ['TORONTO', 43.7, -79.4],
    ['DUBAI', 25.2, 55.3], ['SEOUL', 37.6, 127.0], ['MEXICO CITY', 19.4, -99.1], ['REYKJAVIK', 64.1, -21.9],
    ['CAIRO', 30.0, 31.2], ['HONG KONG', 22.3, 114.2], ['LOS ANGELES', 34.1, -118.2], ['NAIROBI', -1.3, 36.8],
  ].map(([n, la, lo]) => ({ n, la, lo, v: toVec(la, lo) }));
  const links = [];
  const sats = [0, 1, 2].map((i) => ({ inc: 0.5 + i * 0.6, speed: 0.00035 + i * 0.00012, ph: i * 2.1, r: 1.3 + i * 0.07 }));

  function project(v, lift = 1) {
    const cy = Math.cos(rotY), sy = Math.sin(rotY);
    const x = v[0] * cy + v[2] * sy, z = -v[0] * sy + v[2] * cy, y = v[1];
    const ct = Math.cos(TILT), st = Math.sin(TILT);
    return { x: CX + x * R * lift, y: CY - (y * ct - z * st) * R * lift, z: y * st + z * ct };
  }
  function slerp(a, b, t) {
    const d = clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1);
    const th = Math.acos(d), s = Math.sin(th) || 1e-6, k1 = Math.sin((1 - t) * th) / s, k2 = Math.sin(t * th) / s;
    return [a[0] * k1 + b[0] * k2, a[1] * k1 + b[1] * k2, a[2] * k1 + b[2] * k2];
  }
  function resize() {
    ({ ctx, w: W, h: H } = fitCanvas(cv));
    R = Math.min(W, H) * 0.36; CX = W / 2; CY = H / 2;
  }
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (now - last < 40) return;               // ~25 fps keeps a Celeron cool
    last = now;
    ctx.clearRect(0, 0, W, H);
    rotY = now * 0.00011;

    const g = ctx.createRadialGradient(CX, CY, R * 0.85, CX, CY, R * 1.3);
    g.addColorStop(0, rgba(CYAN, 0.10)); g.addColorStop(1, rgba(CYAN, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(CX, CY, R * 1.3, 0, 7); ctx.fill();
    ctx.strokeStyle = rgba(CYAN, 0.22); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(CX, CY, R * 1.14, 0, 7); ctx.stroke();
    for (let i = 0; i < 72; i++) {
      const a = i / 72 * Math.PI * 2 + now * 0.00004, l = i % 6 ? 3 : 8;
      ctx.beginPath();
      ctx.moveTo(CX + Math.cos(a) * R * 1.14, CY + Math.sin(a) * R * 1.14);
      ctx.lineTo(CX + Math.cos(a) * (R * 1.14 + l), CY + Math.sin(a) * (R * 1.14 + l));
      ctx.stroke();
    }
    // arc-reactor style segments counter-rotating on the outer ring
    ctx.strokeStyle = rgba(CYAN, 0.55); ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const a = -now * 0.0003 + i * 2.094;
      ctx.beginPath(); ctx.arc(CX, CY, R * 1.22, a, a + 0.55); ctx.stroke();
    }

    for (const d of dots) {
      const p = project(d), front = p.z > 0;
      ctx.fillStyle = front ? rgba(CYAN, 0.22 + p.z * 0.6) : rgba(DIM, 0.12);
      const s = front ? 1.6 : 1;
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
    for (const s of sats) {
      const a = now * s.speed + s.ph;
      const p = project([Math.cos(a), Math.sin(a) * Math.sin(s.inc), Math.sin(a) * Math.cos(s.inc)], s.r);
      ctx.fillStyle = p.z > -0.2 ? rgba(HOT, 0.9) : rgba(DIM, 0.3);
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    if (now - lastLink > 1300 / rate) {
      const from = home && Math.random() < 0.5 ? home : CITIES[Math.random() * CITIES.length | 0];
      let to = from;
      while (to === from) to = CITIES[Math.random() * CITIES.length | 0];
      links.push({ a: from, b: to, t0: now, dur: 1800 + Math.random() * 1200 });
      lastLink = now;
    }
    for (let i = links.length - 1; i >= 0; i--) {
      const L = links[i], t = (now - L.t0) / L.dur;
      if (t > 1.6) { links.splice(i, 1); continue; }
      const head = Math.min(1, t), tail = Math.max(0, t - 0.6), fade = t > 1 ? 1 - (t - 1) / 0.6 : 1;
      ctx.beginPath();
      for (let k = 0; k <= 32; k++) {
        const u = tail + (head - tail) * (k / 32);
        const p = project(slerp(L.a.v, L.b.v, u), 1 + 0.22 * Math.sin(Math.PI * u));
        k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
      }
      ctx.strokeStyle = rgba(HOT, 0.75 * fade); ctx.lineWidth = 1.1; ctx.stroke();
    }
    ctx.font = '9px "Saira Semi Condensed", "Fira Mono", sans-serif';
    for (const c of home ? [...CITIES, home] : CITIES) {
      const p = project(c.v);
      if (p.z <= 0.05) continue;
      const isHome = c === home;
      const pulse = (isHome ? 5 : 3) + 2 * Math.sin(now * 0.004 + c.lo);
      ctx.strokeStyle = rgba(isHome ? HOT : CYAN, isHome ? 1 : 0.75); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(p.x, p.y, pulse, 0, 7); ctx.stroke();
      ctx.fillStyle = rgba(HOT, 1); ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
      if (isHome || p.z > 0.75) { ctx.fillStyle = rgba(isHome ? HOT : CYAN, isHome ? 1 : 0.7); ctx.fillText(c.n, p.x + 7, p.y - 4); }
    }
  }
  return {
    resize,
    start() { if (!raf && S.globeOn) { resize(); raf = requestAnimationFrame(frame); } },
    stop() { cancelAnimationFrame(raf); raf = 0; },
    toggle() {
      S.globeOn = !S.globeOn;
      wrap.classList.toggle('off', !S.globeOn);
      if (S.globeOn) this.start(); else { this.stop(); ctx && ctx.clearRect(0, 0, W, H); }
    },
    setHome(tz) {
      const c = tz && TZ[tz];
      if (!c) { $('geo').textContent = tz || '-'; home = null; return; }
      home = { n: tz.split('/').pop().replace(/_/g, ' ').toUpperCase(), la: c[0], lo: c[1], v: toVec(c[0], c[1]) };
      $('geo').textContent = `${c[0].toFixed(4)}, ${c[1].toFixed(4)}`;
    },
    traffic(bps) { rate = clamp(1 + Math.log10(1 + (bps || 0) / 4096), 1, 4); },
  };
})();

// ───────────────────────── boot sequence ─────────────────────────
function sectionsOn() {
  ['left', 'term', 'right', 'fs', 'kb'].forEach((id, i) => setTimeout(() => $(id).classList.add('on'), i * 110));
}
let booting = false;
function boot(lines) {
  const bootEl = $('boot');
  if (booting || !bootEl) return;               // init() can run again (monitor change)
  booting = true;
  const done = () => {
    bootEl.classList.add('done');
    sectionsOn();
    setTimeout(() => { bootEl.remove(); send({ cmd: 'booted' }); }, 750);
  };
  if (QUICK || !lines) { bootEl.remove(); sectionsOn(); send({ cmd: 'booted' }); return; }
  const log = $('boot-log');
  let i = 0;
  const step = () => {
    if (i >= lines.length) {
      setTimeout(() => { bootEl.classList.add('logo'); setTimeout(done, 1900); }, 250);
      return;
    }
    const div = document.createElement('div');
    const l = lines[i++];
    div.textContent = l;
    if (/\[ *OK *\]/.test(l)) div.className = 'ok';
    else if (l.startsWith('  ')) div.className = 'dim';
    log.append(div);
    while (log.childElementCount > 120) log.firstChild.remove();
    setTimeout(step, i < 8 ? 70 : 14);
  };
  step();
}

// ───────────────────────── API used by hud-shell ─────────────────────────
window.hud = {
  init(d) {
    applyLayout(d.layout || defaultLayout(innerWidth, innerHeight));
    setInfo(d.info || {});
    if (d.keysOn === false) keysEnabled(false);
    boot(d.started ? null : d.boot || []);
  },
  tick, procs, fs, term, ws, key, keysEnabled,
  toggleGlobe() { globe.toggle(); },
};

// ───────────────────────── start ─────────────────────────
buildKeys();
clockTick();
setInterval(clockTick, 1000);
addEventListener('resize', () => applyLayout(S.layout && !DEMO ? S.layout : defaultLayout(innerWidth, innerHeight)));
globe.start();
if (BRIDGE) send({ cmd: 'ready' });
else demo();

// ───────────────────────── demo feed (browser preview only) ─────────────────────────
function demoFs() {
  const names = [['..', 'up', 1], ['.config', 'd', 1], ['Documents', 'd', 1], ['Downloads', 'd', 1], ['arch-hud', 'd', 1],
    ['Pictures', 'd', 1], ['projects', 'd', 1], ['notes.md', 'code', 0], ['setup.sh', 'x', 0], ['wallpaper.png', 'img', 0],
    ['backup.tar.zst', 'arc', 0], ['report.pdf', 'doc', 0], ['demo.mp4', 'vid', 0], ['track.flac', 'aud', 0],
    ['dotfiles', 'l', 1], ['README.txt', 'f', 0]];
  fs({ cwd: '/home/r3v4n', mount: '/', used: 18,
    entries: names.filter(([n]) => S.hidden || !n.startsWith('.') || n === '..').map(([n, t, dir]) => ({ n, t, dir: !!dir, p: `/home/r3v4n/${n}` })) });
}
function demo() {
  const lines = ['ARCH // HUD boot sequence — demo feed', '', ...Array.from({ length: 90 }, (_, i) =>
    i % 7 === 0 ? `[  OK  ] Started service unit ${i}` : `  [${(i * 0.0371).toFixed(6)}] loading module mod_${(i * 37 % 211).toString(16)}`)];
  window.hud.init({ info: { vendor: 'GATEWAY', model: 'GWTN116-3', chassis: 'Notebook', cpu: 'Celeron N4020', cores: 2, tz: 'America/New_York' }, boot: lines });
  term({ title: 'MAIN SHELL', attached: true });
  ws({ count: 4, current: 0 });
  demoFs();
  let up = 71000, rxT = 1.32e9, txT = 1.58e8;
  const ps = ['WebKitWebProcess', 'kitty', 'python3', 'Xorg', 'picom', 'openbox', 'pipewire', 'NetworkManager'];
  setInterval(() => {
    const cpu = Array.from({ length: 2 }, (_, i) => clamp(25 + 20 * Math.sin(Date.now() / 3000 + i) + Math.random() * 15, 0, 100));
    const rx = Math.random() < 0.3 ? Math.random() * 400000 : Math.random() * 8000, tx = Math.random() * 6000;
    rxT += rx; txT += tx; up += 1;
    tick({ cpu, temp: 48 + Math.random() * 4, fmin: 1.1, fmax: 2.79, tasks: 182, uptime: up, power: '100% · AC',
      mem: { total: 3.6 * 1073741824, used: 1.2 * 1073741824, cached: 1.1 * 1073741824, swapTotal: 1.8 * 1073741824, swapFree: 1.8 * 1073741824 },
      net: { iface: 'wlp0s21f0u7i2', wifi: true, ip: '192.168.254.28', ping: 18 + Math.random() * 6, rx, tx, rxTotal: rxT, txTotal: txT } });
    procs(ps.map((name, i) => ({ pid: 400 + i * 97, name, cpu: Math.max(0, 9 - i * 1.3 + Math.random()), mem: Math.max(0.1, 6 - i * 0.8) })));
  }, 1000);
  const text = 'sudo pacman -Syu\rcd ~/arch-hud && git pull\r';
  const CODE = {};
  KB.flat().forEach(([l, c]) => { if (l && l.length === 1) CODE[l.toLowerCase()] = c; });
  Object.assign(CODE, { ' ': 65, '\r': 36, '&': 16, '~': 49 });
  let j = 0;
  setInterval(() => {
    const ch = text[j++ % text.length], c = CODE[ch];
    if (!c) return;
    key(c, 1);
    setTimeout(() => key(c, 0), 110);
  }, 180);
}
