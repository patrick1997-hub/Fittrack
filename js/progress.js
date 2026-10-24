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
          <span class="meta">${fmt(last.best, 2)} kg${hist.length > 1 && diff ? ` <span style="color:${diff > 0 ? 'var(--good)' : 'var(--warn)'}">${diff > 0 ? '+' : ''}${fmt(diff, 2)}</span>` : ''}</span>
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
