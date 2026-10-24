// Ernährung: Tagesübersicht, Lebensmittel hinzufügen (Barcode, Foto, Suche, manuell).
import { db, uid, getSetting } from './db.js';
import { esc, mount, toast, openSheet, closeSheet, num, fmt, round, dateStr, parseDate, shiftDate, dayLabel, $, $$ } from './ui.js';
import { lookupBarcode, searchLocal, searchOnline, recentFoods, scale } from './food-sources.js';
import { searchGeneric } from './food-db.js';
import { targetsFor } from './targets.js';
import { scanBarcode } from './scanner.js';
import { fileToJpeg, analyzeMeal, analyzeText } from './ai.js';

export const MEALS = [
  ['breakfast', 'Frühstück'],
  ['lunch', 'Mittagessen'],
  ['dinner', 'Abendessen'],
  ['snack', 'Snacks'],
];
const mealName = (id) => (MEALS.find((m) => m[0] === id) || MEALS[3])[1];

function mealForNow() {
  const h = new Date().getHours() + new Date().getMinutes() / 60;
  if (h < 10.5) return 'breakfast';
  if (h < 14.5) return 'lunch';
  if (h < 17) return 'snack';
  if (h < 21.5) return 'dinner';
  return 'snack';
}

function sum(logs) {
  return logs.reduce((t, l) => ({
    kcal: t.kcal + (l.kcal || 0),
    protein: t.protein + (l.protein || 0),
    carbs: t.carbs + (l.carbs || 0),
    fat: t.fat + (l.fat || 0),
  }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
}

function viewSwitch(active, date) {
  return `<div class="seg" style="margin-bottom:6px">
    <a class="segbtn ${active === 'day' ? 'active' : ''}" href="#/food?d=${date}">Tag</a>
    <a class="segbtn ${active === 'week' ? 'active' : ''}" href="#/food/week?d=${date}">Woche</a>
  </div>`;
}

function mondayOf(str) {
  const d = parseDate(str);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return dateStr(d);
}

// ---------- Wochenansicht ----------

export async function renderWeek({ params }) {
  const ref = params.get('d') || dateStr();
  const monday = mondayOf(ref);
  const days = Array.from({ length: 7 }, (_, i) => shiftDate(monday, i));
  const today = dateStr();
  const [allLogs, goals, targets] = await Promise.all([db.all('logs'), getSetting('goals'), targetsFor(days)]);
  const goal = goals?.kcal || 0;
  const perDay = days.map((d) => ({
    date: d, ...sum(allLogs.filter((l) => l.date === d)), count: allLogs.filter((l) => l.date === d).length,
    target: targets[d]?.kcal || 0, trainingKcal: targets[d]?.training.kcal || 0,
  }));
  // Für Durchschnitte nur abgeschlossene Tage mit Einträgen – vergessene Tage und das halbe Heute verfälschen sonst alles.
  const tracked = perDay.filter((d) => d.count && d.date < today);
  const avg = (key) => (tracked.length ? tracked.reduce((s, d) => s + d[key], 0) / tracked.length : 0);
  const balance = tracked.reduce((s, d) => s + (d.kcal - d.target), 0);
  const inRange = tracked.filter((d) => d.target && Math.abs(d.kcal - d.target) <= d.target * 0.1).length;

  // Balkendiagramm: Kalorien pro Tag, gestrichelte Linie = Ziel.
  const w = 320; const h = 170; const padB = 22; const padT = 10;
  const max = Math.max(goal * 1.25, ...perDay.map((d) => d.kcal), 1);
  const y = (v) => padT + (1 - v / max) * (h - padT - padB);
  const bw = 30; const gap = (w - 7 * bw) / 8;
  const names = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  const bars = perDay.map((d, i) => {
    const x = gap + i * (bw + gap);
    const cls = !d.count ? 'empty' : d.target && d.kcal > d.target * 1.1 ? 'over' : d.target && d.kcal < d.target * 0.9 ? 'under' : 'ok';
    const top = y(d.kcal);
    // Trainingstag: kurzer Strich auf Höhe des erhöhten Tagesziels.
    const tMark = d.trainingKcal ? `<line class="tgoal" x1="${x - 3}" x2="${x + bw + 3}" y1="${y(d.target)}" y2="${y(d.target)}"/>` : '';
    return `<a href="#/food?d=${d.date}">${tMark}
      ${d.count ? `<rect class="wbar ${cls}" x="${x}" y="${top}" width="${bw}" height="${Math.max(2, h - padB - top)}" rx="5"/>` : `<rect class="wbar empty" x="${x}" y="${h - padB - 3}" width="${bw}" height="3" rx="1.5"/>`}
      <text class="axis ${d.date === today ? 'today' : ''}" x="${x + bw / 2}" y="${h - 6}" text-anchor="middle">${names[i]}</text></a>`;
  }).join('');
  const goalLine = goal ? `<line class="goal" x1="${gap / 2}" x2="${w - gap / 2}" y1="${y(goal)}" y2="${y(goal)}"/>
    <text class="axis" x="${w - gap / 2}" y="${y(goal) - 4}" text-anchor="end">Ziel ${fmt(goal)}</text>` : '';

  const label = `${parseDate(monday).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' })} – ${parseDate(days[6]).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' })}`;
  const thisWeek = monday === mondayOf(today);

  const el = mount(`<div class="page">
    ${viewSwitch('week', ref)}
    <div class="daynav">
      <button class="icon-btn" data-week="-7" aria-label="Vorherige Woche">‹</button>
      <div class="center"><h1 style="font-size:24px">${thisWeek ? 'Diese Woche' : 'Woche'}</h1><div class="muted small">${label}</div></div>
      <button class="icon-btn" data-week="7" aria-label="Nächste Woche">›</button>
    </div>
    <div class="card">
      <svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Kalorien pro Tag">${goalLine}${bars}</svg>
      <div class="row small muted legend" style="justify-content:center;gap:6px 14px;margin-top:6px;flex-wrap:wrap">
        <span><i class="dot ok"></i>im Ziel (±10 %)</span><span><i class="dot under"></i>drunter</span><span><i class="dot over"></i>drüber</span>${perDay.some((d) => d.trainingKcal) ? '<span><i class="dash"></i>Ziel Trainingstag</span>' : ''}
      </div>
    </div>
    ${tracked.length ? `
    <div class="stat-row">
      <div class="stat"><b>${fmt(avg('kcal'))}</b><span>kcal Ø pro Tag</span></div>
      <div class="stat"><b>${fmt(avg('protein'))} g</b><span>Eiweiß Ø${goals?.protein ? ` (Ziel ${fmt(goals.protein)})` : ''}</span></div>
      <div class="stat"><b>${goal ? `${inRange}/${tracked.length}` : '–'}</b><span>Tage im Ziel</span></div>
    </div>
    ${goal ? `<div class="card"><div class="row between"><span>Bilanz der Woche</span><b class="${balance > 0 ? 'down' : 'up'}">${balance > 0 ? '+' : ''}${fmt(balance)} kcal</b></div>
      <p class="hint" style="margin:6px 0 0">${balance < 0 ? `Du bist insgesamt ${fmt(-balance)} kcal unter deinem Ziel` : `Du bist insgesamt ${fmt(balance)} kcal über deinem Ziel`} – grob ${fmt(Math.abs(balance) / 7700, 2)} kg Körperfett ${balance < 0 ? 'weniger' : 'mehr'}. Gezählt werden abgeschlossene Tage mit Einträgen, heute noch nicht.</p></div>` : ''}`
    : `<p class="muted center">${perDay.some((d) => d.count) ? 'Durchschnitt und Bilanz zählen abgeschlossene Tage – heute kommt ab morgen dazu.' : 'In dieser Woche ist noch nichts eingetragen.'}</p>`}
    <h2>Tage</h2>
    <div class="card tight">
      ${perDay.map((d) => `<a class="list-item" href="#/food?d=${d.date}">
        <span class="grow"><div class="name">${esc(dayLabel(d.date))}</div>
        <div class="muted small">${d.count ? `E ${fmt(d.protein)} · K ${fmt(d.carbs)} · F ${fmt(d.fat)} g` : 'nichts eingetragen'}${d.trainingKcal ? ` · Training +${fmt(d.trainingKcal)}` : ''}</div></span>
        ${d.count ? `<span class="kcal">${fmt(d.kcal)}</span>${d.target ? `<span class="meta ${d.kcal > d.target ? 'down' : 'up'}" style="min-width:58px;text-align:right">${d.kcal > d.target ? '+' : ''}${fmt(d.kcal - d.target)}</span>` : ''}` : ''}
        <span class="chev">›</span></a>`).join('')}
    </div>
  </div>`);

  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-week]');
    if (b) location.hash = `#/food/week?d=${shiftDate(monday, Number(b.dataset.week))}`;
  });
}

// ---------- Tagesansicht ----------

export async function renderDay({ params, rerender }) {
  const date = params.get('d') || dateStr();
  const [allLogs, goals] = await Promise.all([db.all('logs'), targetsFor([date]).then((t) => t[date])]);
  const logs = allLogs.filter((l) => l.date === date).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const t = sum(logs);
  const goal = goals?.kcal || 0;
  const left = goal - t.kcal;
  const r = 50;
  const circ = 2 * Math.PI * r;
  const frac = goal ? Math.min(1, t.kcal / goal) : 0;

  const macro = (key, label) => {
    const target = goals?.[key] || 0;
    const pct = target ? Math.min(100, (t[key] / target) * 100) : 0;
    const over = target && t[key] > target * 1.05;
    return `<div class="macro">
      <div class="row between"><span>${label}</span><span class="muted">${fmt(t[key])}${target ? ` / ${fmt(target)}` : ''} g</span></div>
      <div class="bar ${key} ${over ? 'over' : ''}"><div style="width:${pct}%"></div></div>
    </div>`;
  };

  const el = mount(`<div class="page">
    ${viewSwitch('day', date)}
    <div class="daynav">
      <button class="icon-btn" data-day="-1" aria-label="Vorheriger Tag">‹</button>
      <h1 data-act="today">${esc(dayLabel(date))}</h1>
      <button class="icon-btn" data-day="1" aria-label="Nächster Tag">›</button>
    </div>
    ${goal ? '' : '<a class="banner" href="#/settings">Leg zuerst dein Kalorienziel fest ›</a>'}
    <div class="card">
      <div class="summary">
        <svg class="ring ${left < 0 ? 'over' : ''}" viewBox="0 0 120 120" aria-hidden="true">
          <circle class="bg" cx="60" cy="60" r="${r}"/>
          <circle class="fg" cx="60" cy="60" r="${r}" stroke-dasharray="${circ}" stroke-dashoffset="${circ * (1 - (left < 0 ? 1 : frac))}" transform="rotate(-90 60 60)"/>
          <text class="big" x="60" y="62">${goal ? fmt(Math.abs(left)) : fmt(t.kcal)}</text>
          <text class="lbl" x="60" y="80">${goal ? (left < 0 ? 'kcal drüber' : 'kcal offen') : 'kcal'}</text>
        </svg>
        <div class="kv grow">
          <span class="muted">Ziel</span><b>${goal ? fmt(goal) : '–'}</b>
          <span class="muted">Gegessen</span><b>${fmt(t.kcal)}</b>
          <span class="muted">${left < 0 ? 'Drüber' : 'Offen'}</span><b style="color:${left < 0 ? 'var(--warn)' : 'var(--good)'}">${goal ? fmt(Math.abs(left)) : '–'}</b>
        </div>
      </div>
      ${goals?.training?.kcal ? `<div class="banner" style="margin:12px 0 0;padding:8px 12px;font-size:14px">🏋️ Trainingstag: Ziel +${fmt(goals.training.kcal)} kcal (${fmt(goals.training.minutes)} min Training)</div>` : ''}
      ${macro('protein', 'Eiweiß')}
      ${macro('carbs', 'Kohlenhydrate')}
      ${macro('fat', 'Fett')}
    </div>

    ${MEALS.map(([id, label]) => {
      const items = logs.filter((l) => l.meal === id);
      return `<div class="card tight">
        <div class="meal-head">
          <div class="grow"><h3 style="display:inline">${label}</h3>${items.length ? `<span class="meta">${fmt(sum(items).kcal)} kcal</span>` : ''}</div>
          ${items.length ? `<button class="icon-btn" data-savemeal="${id}" aria-label="${label} als Mahlzeit speichern" style="font-size:20px">☆</button>` : ''}
          <a class="icon-btn" href="#/food/add?meal=${id}&d=${date}" aria-label="${label} hinzufügen">＋</a>
        </div>
        ${items.length ? items.map((l) => `
          <button class="list-item food-row" data-log="${l.id}">
            <span class="grow"><div class="name">${esc(l.name)}</div><div>${l.grams ? `${fmt(l.grams)} g · ` : ''}E ${fmt(l.protein)} · K ${fmt(l.carbs)} · F ${fmt(l.fat)}</div></span>
            <span class="kcal">${fmt(l.kcal)}</span>
          </button>`).join('') : '<div class="meal-empty">Noch nichts eingetragen</div>'}
      </div>`;
    }).join('')}
  </div>`);

  el.addEventListener('click', (e) => {
    const day = e.target.closest('[data-day]');
    if (day) { location.hash = `#/food?d=${shiftDate(date, Number(day.dataset.day))}`; return; }
    if (e.target.closest('[data-act="today"]') && date !== dateStr()) { location.hash = '#/food'; return; }
    const row = e.target.closest('[data-log]');
    if (row) editLog(logs.find((l) => l.id === row.dataset.log), rerender);
    const save = e.target.closest('[data-savemeal]');
    if (save) saveMealSheet(save.dataset.savemeal, logs.filter((l) => l.meal === save.dataset.savemeal));
  });

  // Wischen nach links/rechts wechselt den Tag.
  let x0 = null;
  el.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  el.addEventListener('touchend', (e) => {
    if (x0 === null || document.querySelector('.sheet-wrap')) return;
    const dx = e.changedTouches[0].clientX - x0;
    x0 = null;
    if (Math.abs(dx) > 80) location.hash = `#/food?d=${shiftDate(date, dx < 0 ? 1 : -1)}`;
  }, { passive: true });
}

function editLog(log, done) {
  const sheet = openSheet(`<h2>Eintrag bearbeiten</h2>
    <label class="field"><span>Name</span><input id="lname" value="${esc(log.name)}"></label>
    <div class="fields-2">
      <label class="field"><span>Menge (g)</span><input id="lgrams" inputmode="decimal" value="${log.grams ? esc(log.grams) : ''}" placeholder="–"></label>
      <label class="field"><span>Mahlzeit</span><select id="lmeal">${MEALS.map(([id, l]) => `<option value="${id}" ${id === log.meal ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    </div>
    <div class="fields-4">
      <label class="field"><span>kcal</span><input data-n="kcal" inputmode="decimal" value="${round(log.kcal)}"></label>
      <label class="field"><span>Eiweiß</span><input data-n="protein" inputmode="decimal" value="${round(log.protein, 1)}"></label>
      <label class="field"><span>KH</span><input data-n="carbs" inputmode="decimal" value="${round(log.carbs, 1)}"></label>
      <label class="field"><span>Fett</span><input data-n="fat" inputmode="decimal" value="${round(log.fat, 1)}"></label>
    </div>
    <p class="hint">Wenn du die Menge änderst, rechnet die App die Nährwerte mit.</p>
    <div class="actions"><button class="btn danger" data-act="del">Löschen</button><button class="btn primary" data-act="save">Speichern</button></div>`);

  const gramsIn = $('#lgrams', sheet);
  let baseGrams = num(log.grams);
  gramsIn.addEventListener('input', () => {
    const g = num(gramsIn.value);
    if (!baseGrams || !g) return;
    const f = g / baseGrams;
    for (const input of $$('[data-n]', sheet)) {
      const v = num(input.value);
      if (!Number.isNaN(v)) input.value = round(v * f, input.dataset.n === 'kcal' ? 0 : 1);
    }
    baseGrams = g;
  });

  sheet.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'del') {
      await db.del('logs', log.id);
      closeSheet();
      toast('Eintrag gelöscht');
      done();
    }
    if (act === 'save') {
      const updated = { ...log, name: $('#lname', sheet).value.trim() || log.name, meal: $('#lmeal', sheet).value };
      const g = num(gramsIn.value);
      updated.grams = Number.isNaN(g) ? null : round(g);
      for (const input of $$('[data-n]', sheet)) updated[input.dataset.n] = Math.max(0, num(input.value) || 0);
      await db.put('logs', updated);
      closeSheet();
      done();
    }
  });
}

// ---------- Gespeicherte Mahlzeiten ----------

const mealItem = (l) => ({
  name: l.name, grams: l.grams ?? null, kcal: l.kcal || 0, protein: l.protein || 0,
  carbs: l.carbs || 0, fat: l.fat || 0, foodId: l.foodId || null,
});

function saveMealSheet(mealId, items) {
  const total = sum(items);
  const sheet = openSheet(`<h2>Mahlzeit speichern</h2>
    <p class="hint" style="margin-top:-6px">Speichert diese ${items.length} Einträge zusammen. Beim nächsten Mal fügst du alles mit einem Tipp hinzu.</p>
    <label class="field"><span>Name</span><input id="tplname" value="Mein ${esc(mealName(mealId))}" autocomplete="off"></label>
    <div class="card tight">
      ${items.map((l) => `<div class="list-item"><span class="grow name">${esc(l.name)}</span><span class="meta">${l.grams ? `${fmt(l.grams)} g · ` : ''}${fmt(l.kcal)} kcal</span></div>`).join('')}
      <div class="list-item"><b class="grow">Summe</b><b>${fmt(total.kcal)} kcal</b></div>
    </div>
    <div class="actions"><button class="btn" data-close>Abbrechen</button><button class="btn primary" data-act="save">Speichern</button></div>`);
  sheet.addEventListener('click', async (e) => {
    if (!e.target.closest('[data-act="save"]')) return;
    const name = $('#tplname', sheet).value.trim();
    if (!name) return toast('Bitte einen Namen eingeben');
    await db.put('meals', { id: uid(), name, meal: mealId, items: items.map(mealItem), createdAt: new Date().toISOString(), lastUsed: new Date().toISOString() });
    closeSheet();
    toast(`„${name}“ gespeichert`);
  });
}

function useMealSheet(tpl, { date, meal, back }, done) {
  const picked = tpl.items.map(() => true);
  const sheet = openSheet(`<h2>${esc(tpl.name)}</h2>
    <div class="card tight" id="tplitems">
      ${tpl.items.map((it, i) => `<label class="list-item"><input type="checkbox" data-i="${i}" checked style="width:22px;height:22px;min-height:0">
        <span class="grow name">${esc(it.name)}</span><span class="meta">${it.grams ? `${fmt(it.grams)} g · ` : ''}${fmt(it.kcal)} kcal</span></label>`).join('')}
    </div>
    <div class="card"><div class="row between"><span>Summe</span><b id="tplsum"></b></div></div>
    <div class="actions"><button class="btn danger" data-act="del">Löschen</button><button class="btn primary" data-act="add">Zu ${esc(mealName(meal))} hinzufügen</button></div>`);
  const update = () => {
    const s = sum(tpl.items.filter((_, i) => picked[i]));
    $('#tplsum', sheet).textContent = `${fmt(s.kcal)} kcal · E ${fmt(s.protein)} g`;
  };
  update();
  $('#tplitems', sheet).addEventListener('change', (e) => {
    picked[e.target.dataset.i] = e.target.checked;
    update();
  });
  sheet.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'del' && confirm(`Mahlzeit „${tpl.name}“ löschen?`)) {
      await db.del('meals', tpl.id);
      closeSheet();
      done();
    }
    if (act === 'add') {
      const chosen = tpl.items.filter((_, i) => picked[i]);
      if (!chosen.length) return toast('Nichts ausgewählt');
      for (const it of chosen) await addLog({ date, meal, ...it, source: 'meal' });
      await db.put('meals', { ...tpl, lastUsed: new Date().toISOString() });
      closeSheet();
      toast(`${tpl.name} → ${mealName(meal)}`);
      location.hash = back;
    }
  });
}

// ---------- Hinzufügen ----------

async function addLog(entry) {
  const log = { id: uid(), createdAt: new Date().toISOString(), ...entry };
  await db.put('logs', log);
  return log;
}

async function rememberFood(food) {
  const saved = { ...food, lastUsed: new Date().toISOString() };
  await db.put('foods', saved);
}

export async function renderAdd({ params, rerender }) {
  const date = params.get('d') || dateStr();
  let meal = params.get('meal') || mealForNow();
  const [recent, templates] = await Promise.all([recentFoods(), db.all('meals')]);
  templates.sort((a, b) => (b.lastUsed || '').localeCompare(a.lastUsed || ''));
  const back = `#/food${date === dateStr() ? '' : `?d=${date}`}`;

  const el = mount(`<div class="page add-page">
    <div class="topbar"><a class="back" href="${back}">‹ ${esc(dayLabel(date))}</a><div class="title">Hinzufügen</div><span class="spacer"></span></div>
    <div class="chips" id="meals">${MEALS.map(([id, l]) => `<button class="chip ${id === meal ? 'active' : ''}" data-meal="${id}">${l}</button>`).join('')}</div>
    <div class="grid-3">
      <button class="big-action" data-act="scan"><span class="ico">▥</span>Barcode</button>
      <button class="big-action" data-act="photo"><span class="ico">📷</span>Foto</button>
      <button class="big-action" data-act="manual"><span class="ico">✎</span>Manuell</button>
    </div>
    <input type="file" accept="image/*" id="photoinput" hidden>
    <form id="searchform" class="row" style="margin-top:16px">
      <input type="search" id="q" placeholder="Lebensmittel suchen …" class="grow" autocomplete="off" enterkeyhint="search">
      <button class="btn soft">Suchen</button>
    </form>
    <div id="results"></div>
    <h2>Meine Mahlzeiten</h2>
    <div class="card tight">
      ${templates.length ? templates.map((t) => `
        <button class="list-item" data-tpl="${t.id}">
          <span class="grow"><div class="name">${esc(t.name)}</div><div class="muted small">${t.items.length} Teile · ${fmt(sum(t.items).kcal)} kcal</div></span>
          <span class="chev">›</span></button>`).join('')
        : '<div class="meal-empty" style="padding-top:12px">Tipp: Auf der Tagesseite bei einer Mahlzeit auf ☆ tippen – dann kannst du sie hier mit einem Tipp wieder eintragen.</div>'}
    </div>
    <h2>Zuletzt verwendet</h2>
    <div class="card tight" id="recent">
      ${recent.length ? recent.map(foodRow).join('') : '<div class="meal-empty" style="padding-top:12px">Hier erscheinen Lebensmittel, die du schon einmal eingetragen hast.</div>'}
    </div>
  </div>`);

  const foods = new Map(recent.map((f) => [f.id, f]));
  const ctx = () => ({ date, meal, back });

  $('#meals', el).addEventListener('click', (e) => {
    const b = e.target.closest('[data-meal]');
    if (!b) return;
    meal = b.dataset.meal;
    for (const c of $$('.chip', el)) c.classList.toggle('active', c === b);
  });

  el.addEventListener('click', async (e) => {
    const row = e.target.closest('[data-food]');
    if (row) return amountSheet(foods.get(row.dataset.food), ctx());
    const ai = e.target.closest('[data-aitext]');
    if (ai) return aiSheet({ text: ai.dataset.aitext }, ctx());
    const tpl = e.target.closest('[data-tpl]');
    if (tpl) return useMealSheet(templates.find((t) => t.id === tpl.dataset.tpl), ctx(), rerender);
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'scan') {
      const code = await scanBarcode();
      if (!code) return;
      toast('Suche Produkt …');
      try {
        const food = await lookupBarcode(code);
        if (food) amountSheet(food, ctx());
        else { toast('Produkt nicht gefunden – bitte Werte eintragen'); manualSheet(ctx(), { barcode: code }); }
      } catch (err) {
        toast(err.message);
        manualSheet(ctx(), { barcode: code });
      }
    }
    if (act === 'manual') manualSheet(ctx());
    if (act === 'photo') $('#photoinput', el).click();
  });

  $('#photoinput', el).addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) aiSheet({ file }, ctx());
  });

  // Suche: eigene + eingebaute Lebensmittel sofort beim Tippen, Markenprodukte online erst bei "Suchen".
  const out = $('#results', el);
  let searchRun = 0;
  const runSearch = async (withOnline) => {
    const term = $('#q', el).value.trim();
    const run = ++searchRun;
    if (term.length < 2) { out.innerHTML = ''; return; }
    const local = [...await searchLocal(term), ...searchGeneric(term)];
    const draw = (online, status) => {
      if (run !== searchRun) return;
      const seen = new Set();
      const list = [...local, ...online].filter((f) => !seen.has(f.id) && seen.add(f.id));
      for (const f of list) foods.set(f.id, f);
      out.innerHTML = `<h2>Ergebnisse</h2><div class="card tight">
        ${list.map(foodRow).join('')}
        ${status ? `<div class="meal-empty" style="padding-top:12px">${status}</div>` : ''}
        <button class="list-item" data-aitext="${esc(term)}" style="color:var(--accent)"><span class="grow">✨ Mit KI schätzen: „${esc(term)}“</span><span class="chev">›</span></button>
      </div>
      ${withOnline ? '' : '<p class="hint" style="margin-top:-4px">Markenprodukte: auf „Suchen“ tippen oder den Barcode scannen.</p>'}`;
    };
    if (!withOnline) return draw([], local.length ? '' : 'Nichts in der eingebauten Liste.');
    draw([], '<div class="spinner"></div>');
    try {
      const online = await searchOnline(term);
      draw(online, online.length || local.length ? '' : 'Nichts gefunden. Probier einen anderen Begriff, die KI-Schätzung oder trag es manuell ein.');
    } catch {
      draw([], local.length ? 'Markenprodukte online gerade nicht erreichbar – dafür den Barcode scannen.' : 'Nichts gefunden – die Online-Suche ist gerade nicht erreichbar. Nutze den Barcode, die KI-Schätzung oder trag es manuell ein.');
    }
  };
  let typeTimer;
  // Suchfeld nach oben holen, damit die Treffer nicht hinter der Tastatur landen.
  $('#q', el).addEventListener('focus', () => {
    setTimeout(() => $('#searchform', el).scrollIntoView({ block: 'start', behavior: 'smooth' }), 300);
  });
  $('#q', el).addEventListener('input', () => {
    clearTimeout(typeTimer);
    typeTimer = setTimeout(() => runSearch(false), 150);
  });
  $('#searchform', el).addEventListener('submit', (e) => {
    e.preventDefault();
    $('#q', el).blur();
    runSearch(true);
  });
}

function foodRow(f) {
  return `<button class="list-item" data-food="${esc(f.id)}">
    <span class="grow"><div class="name">${esc(f.name)}</div><div class="muted small">${f.brand ? `${esc(f.brand)} · ` : ''}${fmt(f.per100.kcal)} kcal / 100 g${f.source === 'generic' ? ' · Durchschnitt' : ''}</div></span>
    <span class="chev">›</span></button>`;
}

function amountSheet(food, { date, meal, back }) {
  const start = food.lastGrams || food.serving || 100;
  const quick = [...new Set([food.serving, 50, 100, 150, 200].filter(Boolean))];
  const sheet = openSheet(`<h2>${esc(food.name)}</h2>
    ${food.brand ? `<p class="muted" style="margin:-8px 0 12px">${esc(food.brand)}</p>` : ''}
    <div class="card">
      <div class="row between"><span class="muted">pro 100 g</span><span>${fmt(food.per100.kcal)} kcal · E ${fmt(food.per100.protein, 1)} · K ${fmt(food.per100.carbs, 1)} · F ${fmt(food.per100.fat, 1)}</span></div>
    </div>
    <label class="field"><span>Menge in Gramm</span><input id="grams" inputmode="decimal" value="${start}"></label>
    <div class="chips">${quick.map((g) => `<button class="chip" data-g="${g}">${g === food.serving ? esc(food.source === 'generic' ? food.servingLabel : `1 Portion (${g} g)`) : `${g} g`}</button>`).join('')}</div>
    <div class="card"><div class="row between"><b id="preview"></b><span class="muted" id="preview2"></span></div></div>
    <div class="actions"><button class="btn" data-close>Abbrechen</button><button class="btn primary" data-act="add">Hinzufügen</button></div>`);
  const input = $('#grams', sheet);
  const update = () => {
    const v = scale(food.per100, num(input.value) || 0);
    $('#preview', sheet).textContent = `${fmt(v.kcal)} kcal`;
    $('#preview2', sheet).textContent = `E ${fmt(v.protein)} · K ${fmt(v.carbs)} · F ${fmt(v.fat)} g`;
  };
  update();
  input.addEventListener('input', update);
  sheet.addEventListener('click', async (e) => {
    const g = e.target.closest('[data-g]');
    if (g) { input.value = g.dataset.g; update(); return; }
    if (e.target.closest('[data-act="add"]')) {
      const grams = num(input.value);
      if (!grams || grams <= 0) return toast('Bitte eine Menge eingeben');
      await addLog({ date, meal, name: food.name, grams: round(grams), ...scale(food.per100, grams), foodId: food.id, source: food.source || 'food' });
      await rememberFood({ ...food, lastGrams: round(grams) });
      closeSheet();
      toast(`${food.name} → ${mealName(meal)}`);
      location.hash = back;
    }
  });
}

function manualSheet({ date, meal, back }, preset = {}) {
  let mode = preset.barcode ? 'per100' : 'total';
  const sheet = openSheet(`<h2>Manuell eintragen</h2>
    <label class="field"><span>Name</span><input id="mname" placeholder="z. B. Schnitzel mit Pommes" autocomplete="off"></label>
    <div class="seg" id="mode">
      <button data-mode="total" class="${mode === 'total' ? 'active' : ''}">Werte für Portion</button>
      <button data-mode="per100" class="${mode === 'per100' ? 'active' : ''}">Werte pro 100 g</button>
    </div>
    <label class="field"><span id="glabel">Menge in Gramm (optional)</span><input id="mgrams" inputmode="decimal" placeholder="g"></label>
    <div class="fields-4">
      <label class="field"><span>kcal</span><input data-n="kcal" inputmode="decimal"></label>
      <label class="field"><span>Eiweiß</span><input data-n="protein" inputmode="decimal" placeholder="0"></label>
      <label class="field"><span>KH</span><input data-n="carbs" inputmode="decimal" placeholder="0"></label>
      <label class="field"><span>Fett</span><input data-n="fat" inputmode="decimal" placeholder="0"></label>
    </div>
    <label class="check-row"><input type="checkbox" id="mremember" ${preset.barcode ? 'checked' : ''}> Für später merken${preset.barcode ? ` (Barcode ${esc(preset.barcode)})` : ''}</label>
    <div class="actions"><button class="btn" data-close>Abbrechen</button><button class="btn primary" data-act="add">Hinzufügen</button></div>`);
  setTimeout(() => $('#mname', sheet).focus(), 250);
  const setMode = (m) => {
    mode = m;
    for (const b of $$('#mode button', sheet)) b.classList.toggle('active', b.dataset.mode === m);
    $('#glabel', sheet).textContent = m === 'per100' ? 'Gegessene Menge in Gramm' : 'Menge in Gramm (optional)';
  };
  setMode(mode);
  sheet.addEventListener('click', async (e) => {
    const m = e.target.closest('[data-mode]');
    if (m) return setMode(m.dataset.mode);
    if (!e.target.closest('[data-act="add"]')) return;
    const name = $('#mname', sheet).value.trim();
    const grams = num($('#mgrams', sheet).value);
    const vals = {};
    for (const input of $$('[data-n]', sheet)) vals[input.dataset.n] = Math.max(0, num(input.value) || 0);
    if (!name) return toast('Bitte einen Namen eingeben');
    if (!vals.kcal) return toast('Bitte Kalorien eingeben');
    if (mode === 'per100' && !grams) return toast('Bitte die gegessene Menge eingeben');
    const remember = $('#mremember', sheet).checked;
    if (remember && !grams) return toast('Zum Merken bitte die Menge in Gramm angeben');

    const per100 = mode === 'per100' ? vals : grams ? scaleTo100(vals, grams) : null;
    const totals = mode === 'per100' ? scale(vals, grams) : vals;
    const food = per100 ? { id: preset.barcode ? `bc:${preset.barcode}` : uid(), barcode: preset.barcode || null, name, brand: '', per100, serving: null, source: 'manual' } : null;
    await addLog({ date, meal, name, grams: grams ? round(grams) : null, ...totals, foodId: food?.id || null, source: 'manual' });
    if (remember && food) await rememberFood({ ...food, lastGrams: round(grams) });
    closeSheet();
    toast(`${name} → ${mealName(meal)}`);
    location.hash = back;
  });
}

function scaleTo100(vals, grams) {
  const f = 100 / grams;
  return { kcal: round(vals.kcal * f), protein: round(vals.protein * f, 1), carbs: round(vals.carbs * f, 1), fat: round(vals.fat * f, 1) };
}

// KI-Schätzung aus einem Foto ({ file }) oder einer Beschreibung ({ text }).
async function aiSheet({ file, text }, { date, meal, back }) {
  let image = null;
  if (file) {
    try {
      image = await fileToJpeg(file);
    } catch (err) {
      return toast(err.message);
    }
  }
  const hasKey = !!(await getSetting('apiKey'));
  const sheet = openSheet(`<h2>${image ? 'Foto analysieren' : 'Mit KI schätzen'}</h2>
    ${image ? `<img class="photo-preview" src="${image.dataUrl}" alt="Dein Essen">` : ''}
    ${hasKey ? '' : '<a class="banner" href="#/settings" data-close>Für die KI-Schätzung brauchst du einen Claude-API-Schlüssel. Jetzt eintragen ›</a>'}
    ${image
      ? '<label class="field"><span>Zusatzinfo (optional)</span><input id="hint" placeholder="z. B. mit Olivenöl gebraten, halbe Portion" autocomplete="off"></label>'
      : `<label class="field"><span>Was hast du gegessen? (mit Menge, wenn du sie weißt)</span><input id="hint" value="${esc(text)}" placeholder="z. B. 250 g Spaghetti Bolognese" autocomplete="off"></label>`}
    <div id="airesult"></div>
    <div class="actions" id="aiactions"><button class="btn" data-close>Abbrechen</button><button class="btn primary" data-act="analyze" ${hasKey ? '' : 'disabled'}>Analysieren</button></div>`);

  let items = [];
  const out = $('#airesult', sheet);
  const actions = $('#aiactions', sheet);

  const drawItems = (note, model) => {
    out.innerHTML = `${items.map((it, i) => `
      <div class="ai-item ${it.on ? '' : 'off'}" data-i="${i}">
        <div class="row"><input type="checkbox" data-f="on" ${it.on ? 'checked' : ''} style="width:22px;height:22px;min-height:0" aria-label="Übernehmen">
          <input data-f="name" value="${esc(it.name)}" class="grow"></div>
        <div class="fields-4" style="margin-top:8px">
          <label><span class="muted">g</span><input data-f="grams" inputmode="decimal" value="${round(it.grams)}"></label>
          <label><span class="muted">kcal</span><input data-f="kcal" inputmode="decimal" value="${round(it.kcal)}"></label>
          <label><span class="muted">E</span><input data-f="protein" inputmode="decimal" value="${round(it.protein, 1)}"></label>
          <label><span class="muted">K / F</span><input data-f="cf" value="${round(it.carbs, 1)} / ${round(it.fat, 1)}" readonly tabindex="-1"></label>
        </div>
      </div>`).join('')}
      ${note ? `<p class="hint">💡 ${esc(note)}</p>` : ''}
      <div class="card"><div class="row between"><span>Summe</span><b id="aisum"></b></div></div>
      <p class="hint">Schätzung von ${esc(model)}. Passe Mengen an, wenn sie nicht stimmen – die Werte rechnen sich mit.</p>`;
    updateSum();
  };
  const updateSum = () => {
    const s = sum(items.filter((x) => x.on));
    const el = $('#aisum', sheet);
    if (el) el.textContent = `${fmt(s.kcal)} kcal · E ${fmt(s.protein)} g`;
  };

  out.addEventListener('input', (e) => {
    const box = e.target.closest('.ai-item');
    if (!box) return;
    const it = items[box.dataset.i];
    const f = e.target.dataset.f;
    if (f === 'on') { it.on = e.target.checked; box.classList.toggle('off', !it.on); }
    if (f === 'name') it.name = e.target.value;
    if (f === 'kcal' || f === 'protein') it[f] = num(e.target.value) || 0;
    if (f === 'grams') {
      const g = num(e.target.value);
      if (g > 0 && it.grams > 0) {
        const k = g / it.grams;
        it.kcal *= k; it.protein *= k; it.carbs *= k; it.fat *= k; it.grams = g;
        $('[data-f="kcal"]', box).value = round(it.kcal);
        $('[data-f="protein"]', box).value = round(it.protein, 1);
        $('[data-f="cf"]', box).value = `${round(it.carbs, 1)} / ${round(it.fat, 1)}`;
      }
    }
    updateSum();
  });

  sheet.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'analyze') {
      actions.hidden = true;
      out.innerHTML = '<div class="spinner"></div><p class="center muted small">Claude schaut sich dein Essen an …</p>';
      try {
        const hint = $('#hint', sheet).value.trim();
        if (!image && !hint) throw new Error('Bitte beschreibe kurz, was du gegessen hast.');
        const res = image ? await analyzeMeal(image.base64, hint) : await analyzeText(hint);
        items = res.items.map((x) => ({ ...x, on: true }));
        if (!items.length) {
          out.innerHTML = `<p class="error">Kein Essen erkannt.${res.note ? ` ${esc(res.note)}` : ''}</p>`;
          actions.innerHTML = '<button class="btn" data-close>Schließen</button><button class="btn primary" data-act="analyze">Nochmal</button>';
        } else {
          drawItems(res.note, res.model);
          actions.innerHTML = '<button class="btn" data-close>Abbrechen</button><button class="btn primary" data-act="addall">Hinzufügen</button>';
        }
      } catch (err) {
        out.innerHTML = `<p class="error">${esc(err.message)}</p>`;
        actions.innerHTML = '<button class="btn" data-close>Schließen</button><button class="btn primary" data-act="analyze">Nochmal</button>';
      }
      actions.hidden = false;
    }
    if (act === 'addall') {
      const chosen = items.filter((x) => x.on && x.name.trim());
      if (!chosen.length) return toast('Nichts ausgewählt');
      for (const it of chosen) {
        await addLog({
          date, meal, name: it.name.trim(), grams: round(it.grams),
          kcal: round(it.kcal), protein: round(it.protein, 1), carbs: round(it.carbs, 1), fat: round(it.fat, 1),
          foodId: null, source: image ? 'photo' : 'ai-text',
        });
      }
      closeSheet();
      toast(`${chosen.length} Einträge → ${mealName(meal)}`);
      location.hash = back;
    }
  });
}
