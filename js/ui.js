// Kleine UI-Helfer: Escaping, Zahlen, Datum, Sheets, Toasts.
export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// iOS liefert bei deutscher Tastatur ein Komma als Dezimaltrenner.
export function num(value) {
  if (value === null || value === undefined || value === '') return NaN;
  return parseFloat(String(value).replace(',', '.'));
}

export function fmt(n, digits = 0) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '–';
  return Number(n).toLocaleString('de-AT', { maximumFractionDigits: digits });
}

export const round = (n, digits = 0) => {
  const f = 10 ** digits;
  return Math.round((Number(n) || 0) * f) / f;
};

export function dateStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function shiftDate(str, days) {
  const d = parseDate(str);
  d.setDate(d.getDate() + days);
  return dateStr(d);
}

export function dayLabel(str) {
  const today = dateStr();
  if (str === today) return 'Heute';
  if (str === shiftDate(today, -1)) return 'Gestern';
  if (str === shiftDate(today, 1)) return 'Morgen';
  return parseDate(str).toLocaleDateString('de-AT', { weekday: 'short', day: '2-digit', month: '2-digit' });
}

export function shortDate(iso) {
  return new Date(iso).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export function mount(html) {
  const old = document.getElementById('view');
  const el = document.createElement('main');
  el.id = 'view';
  el.innerHTML = html;
  old.replaceWith(el);
  return el;
}

let sheetEl = null;

// tall: volle Höhe, Inhalt oben – für Suchen, damit die Tastatur die Treffer nicht verdeckt.
export function openSheet(html, { onClose, tall = false } = {}) {
  closeSheet();
  const root = document.getElementById('sheet-root');
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="sheet-backdrop"></div><div class="sheet${tall ? ' tall' : ''}" role="dialog" aria-modal="true"><div class="sheet-grip"></div>${html}</div>`;
  root.appendChild(wrap);
  wrap.querySelector('.sheet-backdrop').addEventListener('click', () => closeSheet());
  wrap.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) closeSheet();
  });
  wrap._onClose = onClose;
  sheetEl = wrap;
  requestAnimationFrame(() => wrap.classList.add('open'));
  return wrap.querySelector('.sheet');
}

export function closeSheet() {
  if (!sheetEl) return;
  const el = sheetEl;
  sheetEl = null;
  if (el._onClose) el._onClose();
  el.classList.remove('open');
  setTimeout(() => el.remove(), 200);
}

let toastTimer;
export function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

export function byId(list) {
  return Object.fromEntries(list.map((x) => [x.id, x]));
}

// Einfaches Liniendiagramm als SVG. points: [{ label, y }]
export function lineChart(points, { height = 150, unit = '' } = {}) {
  if (points.length < 2) {
    return `<p class="muted small">Für ein Diagramm braucht es mindestens 2 Einträge.</p>`;
  }
  const w = 320;
  const h = height;
  const pad = { l: 34, r: 10, t: 12, b: 22 };
  const ys = points.map((p) => p.y);
  let min = Math.min(...ys);
  let max = Math.max(...ys);
  if (min === max) { min -= 1; max += 1; }
  const span = max - min;
  min -= span * 0.1;
  max += span * 0.1;
  const x = (i) => pad.l + (i / (points.length - 1)) * (w - pad.l - pad.r);
  const y = (v) => pad.t + (1 - (v - min) / (max - min)) * (h - pad.t - pad.b);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join(' ');
  const dots = points.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.y).toFixed(1)}" r="3"/>`).join('');
  const first = points[0];
  const last = points[points.length - 1];
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Verlauf">
    <line class="grid" x1="${pad.l}" x2="${w - pad.r}" y1="${y(max - span * 0.1)}" y2="${y(max - span * 0.1)}"/>
    <line class="grid" x1="${pad.l}" x2="${w - pad.r}" y1="${y(min + span * 0.1)}" y2="${y(min + span * 0.1)}"/>
    <text class="axis" x="${pad.l - 6}" y="${y(max - span * 0.1) + 4}" text-anchor="end">${fmt(max - span * 0.1, 1)}</text>
    <text class="axis" x="${pad.l - 6}" y="${y(min + span * 0.1) + 4}" text-anchor="end">${fmt(min + span * 0.1, 1)}</text>
    <path class="line" d="${path}"/>
    <g class="dots">${dots}</g>
    <text class="axis" x="${pad.l}" y="${h - 4}">${esc(first.label)}</text>
    <text class="axis" x="${w - pad.r}" y="${h - 4}" text-anchor="end">${esc(last.label)}${unit ? '' : ''}</text>
  </svg>`;
}
