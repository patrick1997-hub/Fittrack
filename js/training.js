// Training: Pläne, Übungen, laufende Einheit mit Sätzen, Pausentimer.
import { db, uid, getSetting, setSetting } from './db.js';
import { esc, mount, toast, openSheet, closeSheet, num, fmt, byId, shortDate, $, $$ } from './ui.js';
import { onLeave } from './app.js';

const DEFAULT_EXERCISES = [
  ['Bankdrücken', 'Brust'], ['Schrägbankdrücken (Kurzhantel)', 'Brust'], ['Butterfly', 'Brust'],
  ['Kniebeuge', 'Beine'], ['Beinpresse', 'Beine'], ['Beinstrecker', 'Beine'], ['Beinbeuger', 'Beine'],
  ['Rumänisches Kreuzheben', 'Beine'], ['Wadenheben', 'Beine'],
  ['Kreuzheben', 'Rücken'], ['Klimmzüge', 'Rücken'], ['Latzug', 'Rücken'],
  ['Rudern am Kabel', 'Rücken'], ['Langhantelrudern', 'Rücken'],
  ['Schulterdrücken', 'Schultern'], ['Seitheben', 'Schultern'], ['Face Pulls', 'Schultern'],
  ['Bizepscurls', 'Arme'], ['Hammercurls', 'Arme'], ['Trizepsdrücken am Kabel', 'Arme'], ['Dips', 'Arme'],
  ['Plank', 'Core'], ['Crunches', 'Core'],
];

const MUSCLES = ['Brust', 'Rücken', 'Beine', 'Schultern', 'Arme', 'Core', 'Sonstiges'];

export async function seedIfEmpty() {
  if (await getSetting('seeded')) return;
  for (const [name, muscle] of DEFAULT_EXERCISES) {
    await db.put('exercises', { id: uid(), name, muscle });
  }
  const names = ['Training A', 'Training B', 'Training C'];
  for (let i = 0; i < names.length; i++) {
    await db.put('plans', { id: uid(), name: names[i], order: i, items: [] });
  }
  await setSetting('seeded', true);
}

const sortPlans = (plans) => plans.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
const sortSessions = (s) => s.sort((a, b) => b.startedAt.localeCompare(a.startedAt));

function doneSets(entry) {
  return entry.sets.filter((s) => s.done);
}

export function sessionVolume(session) {
  let vol = 0;
  for (const e of session.entries) {
    for (const s of doneSets(e)) vol += (num(s.weight) || 0) * (num(s.reps) || 0);
  }
  return vol;
}

// Letzte erledigte Sätze einer Übung (für "Vorher"-Spalte und Vorschläge).
function lastSetsFor(sessions, exerciseId, excludeId) {
  for (const s of sortSessions([...sessions])) {
    if (s.id === excludeId || !s.finishedAt) continue;
    const entry = s.entries.find((e) => e.exerciseId === exerciseId);
    if (entry && doneSets(entry).length) {
      return doneSets(entry).map((x) => ({ weight: x.weight, reps: x.reps }));
    }
  }
  return null;
}

function makeEntry(exercise, sessions, setsCount, reps) {
  const prev = lastSetsFor(sessions, exercise.id);
  const n = setsCount || (prev ? prev.length : 3);
  return {
    exerciseId: exercise.id,
    name: exercise.name,
    targetReps: reps || '',
    prev: prev || [],
    sets: Array.from({ length: n }, () => ({ weight: '', reps: '', done: false })),
  };
}

// ---------- Übersicht ----------

export async function renderHome() {
  const [plans, sessions, exercises] = await Promise.all([db.all('plans'), db.all('sessions'), db.all('exercises')]);
  sortPlans(plans);
  sortSessions(sessions);
  const exMap = byId(exercises);
  const active = sessions.find((s) => !s.finishedAt);
  const finished = sessions.filter((s) => s.finishedAt);
  const lastByPlan = {};
  for (const s of finished) if (!lastByPlan[s.planId]) lastByPlan[s.planId] = s;

  const el = mount(`<div class="page">
    <div class="topbar"><h1>Training</h1></div>
    ${active ? `<a class="banner" href="#/train/session/${active.id}">▶ Laufendes Training: ${esc(active.planName)} – weiter</a>` : ''}
    ${plans.map((p) => `
      <div class="card plan-card">
        <a class="grow" href="#/train/plan/${p.id}" style="color:inherit">
          <h3>${esc(p.name)}</h3>
          <div class="muted small">${p.items.length ? p.items.map((it) => esc(exMap[it.exerciseId]?.name || '?')).join(' · ') : 'Noch keine Übungen – tippen zum Bearbeiten'}</div>
          <div class="muted small">${lastByPlan[p.id] ? `Zuletzt: ${shortDate(lastByPlan[p.id].startedAt)}` : 'Noch nie trainiert'}</div>
        </a>
        <button class="btn primary small" data-start="${p.id}">Start</button>
      </div>`).join('')}
    <div class="row" style="gap:10px">
      <button class="btn grow" data-act="newplan">+ Neuer Plan</button>
      <button class="btn grow" data-act="free">Freies Training</button>
    </div>
    <h2>Übungen</h2>
    <div class="card tight">
      <a class="list-item" href="#/train/exercises"><span class="grow">Übungen verwalten</span><span class="meta">${exercises.length}</span><span class="chev">›</span></a>
    </div>
    <h2>Letzte Trainings</h2>
    <div class="card tight">
      ${finished.length ? finished.slice(0, 12).map((s) => `
        <a class="list-item" href="#/train/session/${s.id}">
          <span class="grow"><div class="name">${esc(s.planName)}</div><div class="muted small">${shortDate(s.startedAt)} · ${s.entries.length} Übungen</div></span>
          <span class="meta">${fmt(sessionVolume(s))} kg</span><span class="chev">›</span>
        </a>`).join('') : '<div class="meal-empty" style="padding-top:12px">Noch keine Trainings gespeichert.</div>'}
    </div>
  </div>`);

  el.addEventListener('click', async (e) => {
    const startBtn = e.target.closest('[data-start]');
    if (startBtn) return startSession(startBtn.dataset.start, active);
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'newplan') {
      const plan = { id: uid(), name: `Training ${String.fromCharCode(65 + plans.length)}`, order: plans.length, items: [] };
      await db.put('plans', plan);
      location.hash = `#/train/plan/${plan.id}`;
    }
    if (act === 'free') startSession(null, active);
  });
}

async function startSession(planId, active) {
  if (active) {
    toast('Es läuft schon ein Training');
    location.hash = `#/train/session/${active.id}`;
    return;
  }
  const [sessions, exercises] = await Promise.all([db.all('sessions'), db.all('exercises')]);
  const exMap = byId(exercises);
  const plan = planId ? await db.get('plans', planId) : null;
  const entries = plan
    ? plan.items.filter((it) => exMap[it.exerciseId]).map((it) => makeEntry(exMap[it.exerciseId], sessions, Number(it.sets) || 0, it.reps))
    : [];
  const session = {
    id: uid(),
    planId: plan?.id || null,
    planName: plan?.name || 'Freies Training',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    entries,
  };
  await db.put('sessions', session);
  location.hash = `#/train/session/${session.id}`;
}

// ---------- Laufende / vergangene Einheit ----------

export async function renderSession({ match, rerender }) {
  const session = await db.get('sessions', match[1]);
  if (!session) { location.hash = '#/train'; return; }
  const active = !session.finishedAt;
  const restSeconds = await getSetting('restSeconds', 90);

  const row = (entry, i, s, j) => {
    const p = entry.prev[j] || entry.prev[entry.prev.length - 1];
    // Vorschlag: letztes Training, sonst der Satz davor in diesem Training.
    const before = entry.sets[j - 1];
    const wPh = p ? String(p.weight) : (before?.weight || 'kg');
    const rPh = p ? p.reps : (before?.reps || entry.targetReps || 'Wdh');
    return `<tr class="${s.done ? 'done' : ''}" data-i="${i}" data-j="${j}">
      <td class="idx">${j + 1}</td>
      <td class="prev">${entry.prev[j] ? `${fmt(entry.prev[j].weight, 2)} × ${entry.prev[j].reps}` : '–'}</td>
      <td><input data-f="weight" inputmode="decimal" enterkeyhint="next" value="${esc(s.weight)}" placeholder="${esc(wPh)}" aria-label="Gewicht Satz ${j + 1}"></td>
      <td><input data-f="reps" inputmode="numeric" enterkeyhint="done" value="${esc(s.reps)}" placeholder="${esc(rPh)}" aria-label="Wiederholungen Satz ${j + 1}"></td>
      <td class="chk"><button class="checkbtn" data-act="done" aria-label="Satz erledigt">✓</button></td>
    </tr>`;
  };

  const el = mount(`<div class="page">
    <div class="topbar">
      <a class="back" href="#/train">‹ Training</a>
      <div class="title">${esc(session.planName)}</div>
      <span class="timer" id="elapsed">${active ? '' : shortDate(session.startedAt)}</span>
    </div>
    ${session.entries.map((entry, i) => `
      <div class="card ex-card" data-i="${i}">
        <div class="row">
          <h3>${esc(entry.name)}</h3>
          ${entry.targetReps ? `<span class="muted small">Ziel ${esc(entry.targetReps)} Wdh</span>` : ''}
          <button class="icon-btn" data-act="exmenu" aria-label="Optionen">⋯</button>
        </div>
        <table class="sets">
          <thead><tr><th>Satz</th><th>Vorher</th><th>kg</th><th>Wdh</th><th></th></tr></thead>
          <tbody>${entry.sets.map((s, j) => row(entry, i, s, j)).join('')}</tbody>
        </table>
        <div class="ex-actions">
          <button class="btn soft small" data-act="addset">+ Satz</button>
          <button class="btn small" data-act="delset" ${entry.sets.length ? '' : 'disabled'}>− Satz</button>
        </div>
      </div>`).join('')}
    ${session.entries.length ? '' : '<p class="muted center">Füge deine erste Übung hinzu.</p>'}
    <button class="btn block" data-act="addex">+ Übung hinzufügen</button>
    <div style="height:12px"></div>
    ${active
      ? '<button class="btn primary block" data-act="finish">Training beenden</button><div style="height:8px"></div><button class="btn danger block" data-act="discard">Training verwerfen</button>'
      : `<div class="card"><div class="row between"><span>Volumen</span><b>${fmt(sessionVolume(session))} kg</b></div></div>
         <button class="btn danger block" data-act="discard">Training löschen</button>`}
  </div>`);

  if (active) {
    const tick = () => {
      const t = Math.floor((Date.now() - new Date(session.startedAt)) / 1000);
      const out = $('#elapsed');
      if (out) out.textContent = `${Math.floor(t / 3600) ? `${Math.floor(t / 3600)}:` : ''}${String(Math.floor(t / 60) % 60).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
    };
    tick();
    const iv = setInterval(tick, 1000);
    onLeave(() => clearInterval(iv));
  }

  let saveTimer;
  let deleted = false;
  const save = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => db.put('sessions', session), 300);
  };
  onLeave(() => { clearTimeout(saveTimer); if (!deleted) db.put('sessions', session); });

  const clean = (v) => v.trim().replace(',', '.');

  el.addEventListener('input', (e) => {
    const input = e.target.closest('input[data-f]');
    if (!input) return;
    const tr = input.closest('tr');
    const set = session.entries[tr.dataset.i].sets[tr.dataset.j];
    set[input.dataset.f] = clean(input.value);
    save();
  });

  el.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    const card = btn.closest('.ex-card');
    const i = card ? Number(card.dataset.i) : null;
    const entry = i !== null ? session.entries[i] : null;

    if (act === 'done') {
      const tr = btn.closest('tr');
      const set = entry.sets[tr.dataset.j];
      const wIn = $('input[data-f="weight"]', tr);
      const rIn = $('input[data-f="reps"]', tr);
      // Leere Felder mit dem Vorschlag (Platzhalter) füllen.
      if (!set.done) {
        const isNum = (v) => /^\d+([.,]\d+)?$/.test(v);
        if (!wIn.value && isNum(wIn.placeholder)) wIn.value = wIn.placeholder;
        if (!rIn.value && isNum(rIn.placeholder)) rIn.value = rIn.placeholder;
        set.weight = clean(wIn.value);
        set.reps = clean(rIn.value);
        if (!set.reps) { toast('Bitte Wiederholungen eintragen'); rIn.focus(); return; }
      }
      set.done = !set.done;
      tr.classList.toggle('done', set.done);
      // Folgesatz mit gleichem Gewicht vorbelegen, wenn dort noch nichts steht.
      const next = tr.nextElementSibling;
      if (set.done && next && !entry.prev[Number(tr.dataset.j) + 1]) {
        const nw = $('input[data-f="weight"]', next);
        const nr = $('input[data-f="reps"]', next);
        if (!nw.value && set.weight) nw.placeholder = set.weight;
        if (!nr.value && set.reps) nr.placeholder = set.reps;
      }
      await db.put('sessions', session);
      if (set.done && active) startRest(restSeconds);
      return;
    }
    if (act === 'addset') {
      const last = entry.sets[entry.sets.length - 1];
      entry.sets.push({ weight: last?.weight || '', reps: last?.reps || '', done: false });
      await db.put('sessions', session);
      return rerender();
    }
    if (act === 'delset') {
      entry.sets.pop();
      await db.put('sessions', session);
      return rerender();
    }
    if (act === 'exmenu') {
      const sheet = openSheet(`<h2>${esc(entry.name)}</h2>
        <div class="card tight">
          <button class="list-item" data-m="up" ${i === 0 ? 'disabled' : ''}>Nach oben</button>
          <button class="list-item" data-m="down" ${i === session.entries.length - 1 ? 'disabled' : ''}>Nach unten</button>
          <button class="list-item" data-m="remove" style="color:var(--warn)">Übung entfernen</button>
        </div>
        <button class="btn block" data-close>Abbrechen</button>`);
      sheet.addEventListener('click', async (ev) => {
        const m = ev.target.closest('[data-m]')?.dataset.m;
        if (!m) return;
        if (m === 'up') [session.entries[i - 1], session.entries[i]] = [session.entries[i], session.entries[i - 1]];
        if (m === 'down') [session.entries[i + 1], session.entries[i]] = [session.entries[i], session.entries[i + 1]];
        if (m === 'remove') session.entries.splice(i, 1);
        await db.put('sessions', session);
        closeSheet();
        rerender();
      });
      return;
    }
    if (act === 'addex') {
      return pickExercise(async (ex) => {
        const sessions = await db.all('sessions');
        session.entries.push(makeEntry(ex, sessions.filter((s) => s.id !== session.id), 0, ''));
        await db.put('sessions', session);
        rerender();
      });
    }
    if (act === 'finish') {
      const open = session.entries.reduce((n, en) => n + en.sets.filter((s) => !s.done).length, 0);
      if (open && !confirm(`${open} Satz/Sätze sind nicht abgehakt und werden nicht gespeichert. Trotzdem beenden?`)) return;
      for (const en of session.entries) en.sets = en.sets.filter((s) => s.done);
      session.entries = session.entries.filter((en) => en.sets.length);
      session.finishedAt = new Date().toISOString();
      await db.put('sessions', session);
      stopRest();
      toast(`Gespeichert · ${fmt(sessionVolume(session))} kg Volumen`);
      location.hash = '#/train';
      return;
    }
    if (act === 'discard') {
      if (!confirm(active ? 'Training verwerfen? Alle Eingaben gehen verloren.' : 'Dieses Training endgültig löschen?')) return;
      clearTimeout(saveTimer);
      deleted = true;
      await db.del('sessions', session.id);
      stopRest();
      location.replace('#/train');
    }
  });

  // Enter springt ins nächste Feld.
  el.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !e.target.matches('input[data-f]')) return;
    e.preventDefault();
    const inputs = $$('input[data-f]', el);
    const next = inputs[inputs.indexOf(e.target) + 1];
    if (next) next.focus(); else e.target.blur();
  });
}

// ---------- Pausentimer ----------

let restIv = null;

export function startRest(seconds) {
  const end = Date.now() + seconds * 1000;
  localStorageSafe('restEnd', String(end));
  runRest(end);
}

export function restoreRestTimer() {
  const end = Number(localStorageSafe('restEnd'));
  if (end && end > Date.now()) runRest(end);
}

function stopRest() {
  clearInterval(restIv);
  restIv = null;
  localStorageSafe('restEnd', '');
  const el = document.getElementById('rest');
  el.hidden = true;
  el.classList.remove('finished');
  document.body.classList.remove('resting');
}

function runRest(initialEnd) {
  let end = initialEnd;
  const el = document.getElementById('rest');
  el.hidden = false;
  el.classList.remove('finished');
  document.body.classList.add('resting');
  el.innerHTML = `<span>Pause</span><span class="t"></span>
    <button data-r="-15">−15</button><button data-r="15">+15</button><button data-r="x" aria-label="Pause beenden">✕</button>`;
  el.onclick = (e) => {
    const r = e.target.closest('[data-r]')?.dataset.r;
    if (!r) return;
    if (r === 'x') return stopRest();
    end += Number(r) * 1000;
    localStorageSafe('restEnd', String(end));
    tick();
  };
  const tick = () => {
    const left = Math.round((end - Date.now()) / 1000);
    const t = el.querySelector('.t');
    if (left <= 0) {
      t.textContent = 'Los geht’s!';
      if (!el.classList.contains('finished')) {
        el.classList.add('finished');
        beep();
        setTimeout(() => { if (el.classList.contains('finished')) stopRest(); }, 4000);
      }
      return;
    }
    t.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  };
  clearInterval(restIv);
  tick();
  restIv = setInterval(tick, 250);
}

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.25, 0.5].forEach((at) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.25, ctx.currentTime + at);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + at + 0.18);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + at);
      o.stop(ctx.currentTime + at + 0.2);
    });
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  } catch { /* Ton ist nur ein Extra */ }
}

function localStorageSafe(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch { return null; }
  return null;
}

// ---------- Übung auswählen ----------

export async function pickExercise(onPick) {
  const exercises = (await db.all('exercises')).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const sheet = openSheet(`<h2>Übung wählen</h2>
    <input type="search" id="exq" placeholder="Suchen oder neue Übung eingeben" autocomplete="off">
    <div style="height:10px"></div>
    <div class="card tight" id="exlist"></div>
    <button class="btn block" data-close>Abbrechen</button>`);
  const list = $('#exlist', sheet);
  const q = $('#exq', sheet);
  const draw = () => {
    const term = q.value.trim().toLowerCase();
    const hits = exercises.filter((x) => !term || x.name.toLowerCase().includes(term));
    const exact = exercises.some((x) => x.name.toLowerCase() === term);
    list.innerHTML = (term && !exact ? `<button class="list-item" data-new="1" style="color:var(--accent)">+ „${esc(q.value.trim())}“ neu anlegen</button>` : '')
      + hits.map((x) => `<button class="list-item" data-id="${x.id}"><span class="grow name">${esc(x.name)}</span><span class="meta">${esc(x.muscle || '')}</span></button>`).join('')
      + (hits.length || term ? '' : '<div class="meal-empty">Keine Übungen</div>');
  };
  draw();
  q.addEventListener('input', draw);
  list.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    let ex;
    if (b.dataset.new) {
      ex = { id: uid(), name: q.value.trim(), muscle: 'Sonstiges' };
      await db.put('exercises', ex);
    } else {
      ex = exercises.find((x) => x.id === b.dataset.id);
    }
    closeSheet();
    onPick(ex);
  });
}

// ---------- Plan bearbeiten ----------

export async function renderPlan({ match, rerender }) {
  const plan = await db.get('plans', match[1]);
  if (!plan) { location.hash = '#/train'; return; }
  const exMap = byId(await db.all('exercises'));

  const el = mount(`<div class="page">
    <div class="topbar"><a class="back" href="#/train">‹ Training</a><div class="title">Plan bearbeiten</div><span class="spacer"></span></div>
    <label class="field"><span>Name</span><input id="pname" value="${esc(plan.name)}" autocomplete="off"></label>
    <div class="row between small muted" style="padding:0 4px 6px"><span>Übung</span><span>Sätze × Wdh</span></div>
    <div class="card tight">
      ${plan.items.map((it, i) => `
        <div class="plan-item" data-i="${i}">
          <span class="name">${esc(exMap[it.exerciseId]?.name || 'Gelöschte Übung')}</span>
          <input data-f="sets" inputmode="numeric" value="${esc(it.sets)}" aria-label="Sätze">
          <span class="x">×</span>
          <input data-f="reps" inputmode="text" value="${esc(it.reps)}" placeholder="8–12" aria-label="Wiederholungen">
          <button class="icon-btn" data-act="up" ${i === 0 ? 'disabled' : ''} aria-label="Nach oben">↑</button>
          <button class="icon-btn" data-act="rm" aria-label="Entfernen" style="color:var(--warn)">✕</button>
        </div>`).join('') || '<div class="meal-empty" style="padding-top:12px">Noch keine Übungen.</div>'}
    </div>
    <button class="btn soft block" data-act="add">+ Übung hinzufügen</button>
    <p class="hint" style="margin-top:12px">Änderungen werden sofort gespeichert. Gewichte trägst du beim Training ein – die App merkt sich dann, was du zuletzt geschafft hast.</p>
    <button class="btn danger block" data-act="delete">Plan löschen</button>
  </div>`);

  const save = () => db.put('plans', plan);
  $('#pname', el).addEventListener('input', (e) => { plan.name = e.target.value.trim() || 'Ohne Namen'; save(); });
  el.addEventListener('input', (e) => {
    const input = e.target.closest('.plan-item input');
    if (!input) return;
    plan.items[input.closest('.plan-item').dataset.i][input.dataset.f] = input.value.trim();
    save();
  });
  el.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    const i = Number(e.target.closest('.plan-item')?.dataset.i);
    if (act === 'up') { [plan.items[i - 1], plan.items[i]] = [plan.items[i], plan.items[i - 1]]; await save(); rerender(); }
    if (act === 'rm') { plan.items.splice(i, 1); await save(); rerender(); }
    if (act === 'add') pickExercise(async (ex) => { plan.items.push({ exerciseId: ex.id, sets: '3', reps: '8-12' }); await save(); rerender(); });
    if (act === 'delete' && confirm(`Plan „${plan.name}“ löschen? Vergangene Trainings bleiben erhalten.`)) {
      await db.del('plans', plan.id);
      location.replace('#/train');
    }
  });
}

// ---------- Übungen verwalten ----------

export async function renderExercises({ rerender }) {
  const exercises = (await db.all('exercises')).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const groups = {};
  for (const x of exercises) (groups[x.muscle || 'Sonstiges'] ||= []).push(x);
  const order = [...MUSCLES, ...Object.keys(groups).filter((m) => !MUSCLES.includes(m))];

  const el = mount(`<div class="page">
    <div class="topbar"><a class="back" href="#/train">‹ Training</a><div class="title">Übungen</div><button class="icon-btn" data-act="new" aria-label="Neue Übung">＋</button></div>
    ${order.filter((m) => groups[m]).map((m) => `
      <h2>${esc(m)}</h2>
      <div class="card tight">
        ${groups[m].map((x) => `<button class="list-item" data-id="${x.id}"><span class="grow name">${esc(x.name)}</span><span class="chev">›</span></button>`).join('')}
      </div>`).join('')}
  </div>`);

  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-act="new"]')) return editExercise({ id: uid(), name: '', muscle: 'Sonstiges' }, true, rerender);
    const b = e.target.closest('[data-id]');
    if (b) editExercise(exercises.find((x) => x.id === b.dataset.id), false, rerender);
  });
}

function editExercise(ex, isNew, done) {
  const sheet = openSheet(`<h2>${isNew ? 'Neue Übung' : 'Übung bearbeiten'}</h2>
    <label class="field"><span>Name</span><input id="exname" value="${esc(ex.name)}" autocomplete="off"></label>
    <label class="field"><span>Muskelgruppe</span><select id="exmuscle">${MUSCLES.map((m) => `<option ${m === ex.muscle ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
    <div class="actions">
      ${isNew ? '<button class="btn" data-close>Abbrechen</button>' : '<button class="btn danger" data-act="del">Löschen</button>'}
      <button class="btn primary" data-act="save">Speichern</button>
    </div>`);
  if (isNew) setTimeout(() => $('#exname', sheet).focus(), 250);
  sheet.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'save') {
      const name = $('#exname', sheet).value.trim();
      if (!name) return toast('Bitte einen Namen eingeben');
      await db.put('exercises', { ...ex, name, muscle: $('#exmuscle', sheet).value });
      closeSheet();
      done();
    }
    if (act === 'del' && confirm(`„${ex.name}“ löschen? Sie verschwindet auch aus deinen Plänen, vergangene Trainings bleiben.`)) {
      await db.del('exercises', ex.id);
      for (const p of await db.all('plans')) {
        const items = p.items.filter((it) => it.exerciseId !== ex.id);
        if (items.length !== p.items.length) await db.put('plans', { ...p, items });
      }
      closeSheet();
      done();
    }
  });
}
