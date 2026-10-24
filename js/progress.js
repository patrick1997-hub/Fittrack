// Fortschritt: Körpergewicht und Entwicklung pro Übung.
import { db, uid, getSetting, setSetting } from './db.js';
import { esc, mount, toast, num, fmt, round, byId, shortDate, dateStr, lineChart, $ } from './ui.js';
import { e1rm } from './calc.js';

function exerciseHistory(sessions, exerciseId) {
  const rows = [];
  for (const s of sessions) {
    if (!s.finishedAt) continue;
    const entry = s.entries.find((e) => e.exerciseId === exerciseId);
    if (!entry) continue;
    const sets = entry.sets.filter((x) => x.done);
    if (!sets.length) continue;
    const best = Math.max(...sets.map((x) => num(x.weight) || 0));
    const bestE1rm = Math.max(...sets.map((x) => e1rm(num(x.weight), num(x.reps))));
    const volume = sets.reduce((v, x) => v + (num(x.weight) || 0) * (num(x.reps) || 0), 0);
    rows.push({ session: s, sets, best, bestE1rm, volume });
  }
  return rows.sort((a, b) => a.session.startedAt.localeCompare(b.session.startedAt));
}

// Woche = Montag bis Sonntag. offset 0 = diese Woche, 1 = Vorwoche.
function weekStats(sessions, offset) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - 7 * offset);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  const list = sessions.filter((s) => s.finishedAt && new Date(s.startedAt) >= start && new Date(s.startedAt) < end);
  const best = {};
  let sets = 0;
  let volume = 0;
  for (const s of list) {
    for (const e of s.entries) {
      for (const x of e.sets.filter((y) => y.done)) {
        sets += 1;
        volume += (num(x.weight) || 0) * (num(x.reps) || 0);
        best[e.exerciseId] = Math.max(best[e.exerciseId] || 0, num(x.weight) || 0);
      }
    }
  }
  return { count: list.length, sets, volume, best };
}

function weekCompareHtml(sessions, exercises) {
  const now = weekStats(sessions, 0);
  const last = weekStats(sessions, 1);
  if (!now.count && !last.count) return '';
  const delta = (a, b, unit = '', pct = false) => {
    if (!b) return '<span class="muted">–</span>';
    const d = pct ? Math.round(((a - b) / b) * 100) : a - b;
    const cls = d > 0 ? 'up' : d < 0 ? 'down' : 'muted';
    return `<b class="${cls}">${d > 0 ? '+' : ''}${fmt(d, pct ? 0 : 2)}${pct ? ' %' : unit}</b>`;
  };
  const names = Object.fromEntries(exercises.map((x) => [x.id, x.name]));
  const gains = Object.keys(now.best)
    .filter((id) => last.best[id] && names[id])
    .map((id) => ({ name: names[id], now: now.best[id], diff: now.best[id] - last.best[id] }))
    .sort((a, b) => b.diff - a.diff);
  return `<h2>Diese Woche vs. Vorwoche</h2>
    <div class="card">
      <div class="kv" style="grid-template-columns:1fr auto auto auto;gap:6px 14px">
        <span></span><span class="muted small">Diese</span><span class="muted small">Vorwoche</span><span class="muted small">Δ</span>
        <span>Trainings</span><b>${now.count}</b><b class="muted">${last.count}</b>${delta(now.count, last.count)}
        <span>Sätze</span><b>${now.sets}</b><b class="muted">${last.sets}</b>${delta(now.sets, last.sets)}
        <span>Volumen (kg)</span><b>${fmt(now.volume)}</b><b class="muted">${fmt(last.volume)}</b>${delta(now.volume, last.volume, '', true)}
      </div>
      ${gains.length ? `<div style="margin-top:14px" class="muted small">Schwerster Satz je Übung</div>
        ${gains.slice(0, 8).map((g) => `<div class="row between" style="margin-top:6px"><span>${esc(g.name)}</span><span>${fmt(g.now, 2)} kg ${delta(g.diff, 1, ' kg')}</span></div>`).join('')}`
        : '<p class="hint" style="margin:12px 0 0">Sobald du eine Übung in beiden Wochen gemacht hast, siehst du hier deine Steigerung.</p>'}
      <p class="hint" style="margin:10px 0 0">Die laufende Woche zählt bis heute – gegen Wochenende wird der Vergleich aussagekräftiger.</p>
    </div>`;
}

export async function renderHome({ rerender }) {
  const [weights, sessions, exercises] = await Promise.all([db.all('weights'), db.all('sessions'), db.all('exercises')]);
  weights.sort((a, b) => a.date.localeCompare(b.date));
  const latest = weights[weights.length - 1];
  const used = exercises
    .map((x) => ({ x, hist: exerciseHistory(sessions, x.id) }))
    .filter((r) => r.hist.length)
    .sort((a, b) => b.hist[b.hist.length - 1].session.startedAt.localeCompare(a.hist[a.hist.length - 1].session.startedAt));
  const finished = sessions.filter((s) => s.finishedAt);
  const weekAgo = Date.now() - 7 * 864e5;
  const thisWeek = finished.filter((s) => new Date(s.startedAt) > weekAgo).length;

  const el = mount(`<div class="page">
    <div class="topbar"><h1>Fortschritt</h1></div>
    <div class="stat-row">
      <div class="stat"><b>${finished.length}</b><span>Trainings gesamt</span></div>
      <div class="stat"><b>${thisWeek}</b><span>letzte 7 Tage</span></div>
      <div class="stat"><b>${latest ? fmt(latest.kg, 1) : '–'}</b><span>kg Körpergewicht</span></div>
    </div>
    ${weekCompareHtml(sessions, exercises)}

    <h2>Körpergewicht</h2>
    <div class="card">
      ${lineChart(weights.slice(-30).map((w) => ({ label: shortDate(w.date), y: w.kg })))}
      <form class="row" id="wform" style="margin-top:12px">
        <input id="wkg" inputmode="decimal" placeholder="${latest ? fmt(latest.kg, 1) : 'kg'}" aria-label="Gewicht in kg" class="grow">
        <button class="btn primary">Eintragen</button>
      </form>
      ${weights.length ? `<div class="muted small" style="margin-top:8px">Letzter Eintrag: ${shortDate(latest.date)}${weights.length > 1 ? ` · Veränderung seit Start: ${fmt(latest.kg - weights[0].kg, 1)} kg` : ''}</div>` : ''}
    </div>

    <h2>Übungen</h2>
    <div class="card tight">
      ${used.length ? used.map(({ x, hist }) => {
        const last = hist[hist.length - 1];
        const first = hist[0];
        const diff = last.best - first.best;
        return `<a class="list-item" href="#/progress/exercise/${x.id}">
          <span class="grow"><div class="name">${esc(x.name)}</div><div class="muted small">${hist.length}× trainiert · zuletzt ${shortDate(last.session.startedAt)}</div></span>
          <span class="meta">${fmt(last.best, 2)} kg${hist.length > 1 && diff ? ` <span style="color:${diff > 0 ? 'var(--good)' : 'var(--warn)'}">${diff > 0 ? '+' : ''}${fmt(diff, 2)} seit Start</span>` : ''}</span>
          <span class="chev">›</span></a>`;
      }).join('') : '<div class="meal-empty" style="padding-top:12px">Sobald du ein Training beendest, siehst du hier deine Entwicklung.</div>'}
    </div>
  </div>`);

  $('#wform', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const kg = num($('#wkg', el).value);
    if (!kg || kg < 20 || kg > 400) return toast('Bitte ein gültiges Gewicht eingeben');
    const today = dateStr();
    const existing = weights.find((w) => w.date === today);
    await db.put('weights', { id: existing?.id || uid(), date: today, kg: round(kg, 1) });
    // Profilgewicht mitziehen, damit das Kalorienziel aktuell bleibt.
    const profile = await getSetting('profile', {});
    await setSetting('profile', { ...profile, weight: round(kg, 1) });
    toast('Gewicht gespeichert');
    rerender();
  });
}

export async function renderExercise({ match }) {
  const [ex, sessions] = await Promise.all([db.get('exercises', match[1]), db.all('sessions')]);
  if (!ex) { location.hash = '#/progress'; return; }
  const hist = exerciseHistory(sessions, ex.id);
  const pr = hist.reduce((m, r) => Math.max(m, r.best), 0);
  const prE = hist.reduce((m, r) => Math.max(m, r.bestE1rm), 0);

  mount(`<div class="page">
    <div class="topbar"><a class="back" href="#/progress">‹ Fortschritt</a><div class="title">${esc(ex.name)}</div><span class="spacer"></span></div>
    <div class="stat-row">
      <div class="stat"><b>${fmt(pr, 2)}</b><span>kg Bestwert</span></div>
      <div class="stat"><b>${fmt(prE, 1)}</b><span>kg geschätztes 1RM</span></div>
      <div class="stat"><b>${hist.length}</b><span>Einheiten</span></div>
    </div>
    <h2>Schwerster Satz</h2>
    <div class="card">${lineChart(hist.map((r) => ({ label: shortDate(r.session.startedAt), y: r.best })))}</div>
    <h2>Geschätztes 1RM</h2>
    <div class="card">${lineChart(hist.map((r) => ({ label: shortDate(r.session.startedAt), y: round(r.bestE1rm, 1) })))}</div>
    <h2>Verlauf</h2>
    <div class="card tight">
      ${hist.slice().reverse().map((r) => `
        <a class="list-item" href="#/train/session/${r.session.id}">
          <span class="grow"><div class="name">${shortDate(r.session.startedAt)} · ${esc(r.session.planName)}</div>
          <div class="muted small">${r.sets.map((x) => `${fmt(num(x.weight), 2)}×${esc(x.reps)}`).join('  ')}</div></span>
          <span class="meta">${fmt(r.volume)} kg</span>
        </a>`).join('') || '<div class="meal-empty">Noch keine Daten.</div>'}
    </div>
    <p class="hint" style="margin-top:12px">1RM = geschätztes Maximalgewicht für 1 Wiederholung (Epley-Formel). Gut zum Vergleichen, auch wenn du mit unterschiedlichen Wiederholungszahlen trainierst.</p>
  </div>`);
}
