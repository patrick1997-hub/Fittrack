// Profil: Körperdaten, Kalorienziel, KI-Schlüssel, Training, Datensicherung.
import { getSetting, setSetting, exportAll, importAll } from './db.js';
import { esc, mount, toast, num, fmt, round, dateStr, $ } from './ui.js';
import { ACTIVITY, DAILY, GOALS, computeTargets, trainingSeparate } from './calc.js';
import { adaptiveEstimate, NEED_DAYS, NEED_WEIGHINS } from './targets.js';
import { MODELS, DEFAULT_MODEL } from './ai.js';

export async function renderSettings({ rerender }) {
  const [profile, goals, apiKey, model, restSeconds] = await Promise.all([
    getSetting('profile', {}), getSetting('goals', {}), getSetting('apiKey', ''),
    getSetting('aiModel', DEFAULT_MODEL), getSetting('restSeconds', 90),
  ]);
  const p = { sex: 'm', activity: 1.55, daily: 1.375, goal: 'keep', ...profile };
  let persisted = null;
  try { persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : null; } catch { /* egal */ }

  const el = mount(`<div class="page">
    <div class="topbar"><h1>Profil</h1></div>

    <h2>Körperdaten</h2>
    <div class="card">
      <div class="fields-2">
        <label class="field"><span>Geschlecht</span><select id="sex"><option value="m" ${p.sex === 'm' ? 'selected' : ''}>männlich</option><option value="f" ${p.sex === 'f' ? 'selected' : ''}>weiblich</option></select></label>
        <label class="field"><span>Alter</span><input id="age" inputmode="numeric" value="${esc(p.age || '')}" placeholder="Jahre"></label>
        <label class="field"><span>Größe (cm)</span><input id="height" inputmode="numeric" value="${esc(p.height || '')}" placeholder="cm"></label>
        <label class="field"><span>Gewicht (kg)</span><input id="weight" inputmode="decimal" value="${esc(p.weight || '')}" placeholder="kg"></label>
      </div>
      <label class="field"><span>Körperfett in % (optional)</span><input id="bodyfat" inputmode="decimal" value="${esc(p.bodyFat || '')}" placeholder="z. B. 15"></label>
      <p class="hint">Mit Körperfett rechnet die App über deine Muskelmasse (Katch-McArdle) – bei trainierten Menschen genauer. Eine Körperfettwaage reicht als Wert.</p>
      <label class="check-row"><input type="checkbox" id="tbonus" ${trainingSeparate(p) ? 'checked' : ''}> Training extra einrechnen (empfohlen)</label>
      <label class="field"><span id="actlabel"></span><select id="activity"></select></label>
      <label class="field"><span>Ziel</span><select id="goal">${GOALS.map((g) => `<option value="${g.value}" ${p.goal === g.value ? 'selected' : ''}>${g.label}</option>`).join('')}</select></label>
      <div id="calcinfo" class="hint"></div>
      <button class="btn soft block" data-act="calc">Ziel berechnen</button>
    </div>

    <h2>Anpassendes Ziel</h2>
    <div class="card" id="adaptive"><div class="spinner"></div></div>

    <h2>Tagesziel</h2>
    <p class="hint" id="goalhint">${trainingSeparate(p) ? 'Gilt für Ruhetage. An Trainingstagen kommt der Trainingsverbrauch automatisch dazu (als Kohlenhydrate).' : 'Gilt für jeden Tag (Training ist im Aktivitätsfaktor enthalten).'}</p>
    <div class="card">
      <div class="fields-2">
        <label class="field"><span>Kalorien (kcal)</span><input id="g_kcal" inputmode="numeric" value="${esc(goals.kcal || '')}"></label>
        <label class="field"><span>Eiweiß (g)</span><input id="g_protein" inputmode="numeric" value="${esc(goals.protein || '')}"></label>
        <label class="field"><span>Kohlenhydrate (g)</span><input id="g_carbs" inputmode="numeric" value="${esc(goals.carbs || '')}"></label>
        <label class="field"><span>Fett (g)</span><input id="g_fat" inputmode="numeric" value="${esc(goals.fat || '')}"></label>
      </div>
      <button class="btn primary block" data-act="savegoals">Speichern</button>
    </div>

    <h2>KI-Foto-Erkennung</h2>
    <div class="card">
      <label class="field"><span>Claude-API-Schlüssel</span><input id="apikey" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(apiKey)}" placeholder="sk-ant-…"></label>
      <p class="hint">Den Schlüssel bekommst du auf <a href="https://platform.claude.com" target="_blank" rel="noopener">platform.claude.com</a> (Guthaben aufladen → API Keys). Er bleibt nur auf diesem Gerät gespeichert und geht direkt an Anthropic. Die Kosten laufen über dein API-Guthaben, nicht über dein Claude-Abo.</p>
      <label class="field"><span>Modell</span><select id="model">${MODELS.map((m) => `<option value="${m.id}" ${m.id === model ? 'selected' : ''}>${m.label}</option>`).join('')}</select></label>
      <button class="btn primary block" data-act="saveai">Speichern</button>
    </div>

    <h2>Training</h2>
    <div class="card">
      <label class="field"><span>Pausenzeit nach jedem Satz (Sekunden)</span><input id="restsec" inputmode="numeric" value="${esc(restSeconds)}"></label>
      <button class="btn primary block" data-act="saverest">Speichern</button>
    </div>

    <h2>Daten</h2>
    <div class="card">
      <p class="hint" style="margin-top:0">Alle Daten liegen nur auf diesem iPhone. Mach ab und zu eine Sicherung – z. B. in iCloud Drive.${persisted === false ? ' <b>Achtung:</b> Der Browser hat dauerhaften Speicher noch nicht bestätigt – nutze die App am besten vom Home-Bildschirm aus.' : ''}</p>
      <div class="row" style="gap:10px">
        <button class="btn soft grow" data-act="export">Sicherung speichern</button>
        <button class="btn grow" data-act="import">Wiederherstellen</button>
      </div>
      <input type="file" id="importfile" accept="application/json,.json" hidden>
    </div>
    <p class="center muted small">FitTrack · läuft komplett im Browser</p>
  </div>`);

  // Aktivitätsliste je nach Modus: Alltag ohne Training oder pauschal mit Training.
  let daily = Number(p.daily || 1.375);
  let activity = Number(p.activity || 1.55);
  const drawActivity = () => {
    const sep = $('#tbonus', el).checked;
    const list = sep ? DAILY : ACTIVITY;
    const current = sep ? daily : activity;
    $('#actlabel', el).textContent = sep ? 'Alltag (ohne Training)' : 'Aktivität (inkl. Training)';
    $('#activity', el).innerHTML = list.map((a) => `<option value="${a.value}" ${current === a.value ? 'selected' : ''}>${a.label}</option>`).join('');
  };
  drawActivity();
  $('#tbonus', el).addEventListener('change', drawActivity);
  $('#activity', el).addEventListener('change', (e) => {
    if ($('#tbonus', el).checked) daily = Number(e.target.value); else activity = Number(e.target.value);
  });

  const readProfile = () => ({
    sex: $('#sex', el).value,
    age: num($('#age', el).value) || '',
    height: num($('#height', el).value) || '',
    weight: num($('#weight', el).value) || '',
    bodyFat: num($('#bodyfat', el).value) || '',
    trainingBonus: $('#tbonus', el).checked,
    daily,
    activity,
    goal: $('#goal', el).value,
  });

  const fillGoals = (g) => {
    $('#g_kcal', el).value = g.kcal;
    $('#g_protein', el).value = g.protein;
    $('#g_carbs', el).value = g.carbs;
    $('#g_fat', el).value = g.fat;
  };

  // Anpassendes Ziel laden (rechnet über die letzten 3 Wochen).
  adaptiveEstimate().then((a) => {
    const box = $('#adaptive', el);
    if (!box) return;
    if (!a.ready) {
      box.innerHTML = `<p style="margin:0 0 8px">Die App lernt aus deinen Daten, wie viel du <b>wirklich</b> verbrauchst: Ø Essen und wie sich dabei dein Gewicht verändert.</p>
        <div class="row between small"><span>Tage mit Essen eingetragen (letzte 3 Wochen)</span><b>${a.trackedDays} / ${NEED_DAYS}</b></div>
        <div class="row between small" style="margin-top:4px"><span>Wiegungen (über ≥ 10 Tage verteilt)</span><b>${a.weighIns} / ${NEED_WEIGHINS}</b></div>
        <p class="hint" style="margin:10px 0 0">Am besten 3–4× pro Woche morgens nüchtern wiegen (Fortschritt › Körpergewicht) und das Essen möglichst vollständig eintragen.</p>`;
      return;
    }
    const s = a.suggestion;
    box.innerHTML = `<div class="kv" style="grid-template-columns:1fr auto">
        <span class="muted">Ø gegessen</span><b>${fmt(a.avgIntake)} kcal</b>
        <span class="muted">Gewichtstrend</span><b>${a.kgPerWeek > 0 ? '+' : ''}${fmt(a.kgPerWeek, 2)} kg/Woche</b>
        <span>Dein echter Verbrauch</span><b>${fmt(a.tdee)} kcal</b>
        ${a.formulaTdee ? `<span class="muted">laut Formel</span><b class="muted">${fmt(a.formulaTdee)} kcal</b>` : ''}
      </div>
      <p class="hint" style="margin:10px 0">Empfohlenes Tagesziel${trainingSeparate(p) ? ' für Ruhetage' : ''}: <b>${fmt(s.kcal)} kcal</b> · E ${fmt(s.protein)} · K ${fmt(s.carbs)} · F ${fmt(s.fat)} g</p>
      <button class="btn soft block" data-act="adopt">Übernehmen</button>`;
    $('[data-act="adopt"]', box).addEventListener('click', async () => {
      fillGoals(s);
      await setSetting('goals', { ...s, source: 'adaptive', updatedAt: dateStr() });
      toast('Anpassendes Ziel übernommen');
    });
  });

  el.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    if (act === 'calc') {
      const prof = readProfile();
      const t = computeTargets(prof);
      if (!t) return toast('Bitte Alter, Größe und Gewicht eintragen');
      await setSetting('profile', prof);
      fillGoals(t);
      $('#calcinfo', el).textContent = `Grundumsatz ${fmt(t.bmr)} kcal (${t.formula}) · ${prof.trainingBonus ? 'Ruhetag' : 'Gesamtumsatz'} ${fmt(t.tdee)} kcal. Werte eingetragen – prüfen und speichern.`;
      $('#goalhint', el).textContent = prof.trainingBonus
        ? 'Gilt für Ruhetage. An Trainingstagen kommt der Trainingsverbrauch automatisch dazu (als Kohlenhydrate).'
        : 'Gilt für jeden Tag (Training ist im Aktivitätsfaktor enthalten).';
    }
    if (act === 'savegoals') {
      const g = {
        kcal: round(num($('#g_kcal', el).value)),
        protein: round(num($('#g_protein', el).value)),
        carbs: round(num($('#g_carbs', el).value)),
        fat: round(num($('#g_fat', el).value)),
      };
      if (!g.kcal) return toast('Bitte ein Kalorienziel eingeben');
      await setSetting('goals', g);
      await setSetting('profile', readProfile());
      toast('Tagesziel gespeichert');
    }
    if (act === 'saveai') {
      const key = $('#apikey', el).value.trim();
      if (key && !key.startsWith('sk-ant-')) return toast('Der Schlüssel beginnt normalerweise mit „sk-ant-“');
      await setSetting('apiKey', key);
      await setSetting('aiModel', $('#model', el).value);
      toast(key ? 'KI-Einstellungen gespeichert' : 'Schlüssel entfernt');
    }
    if (act === 'saverest') {
      const s = Math.round(num($('#restsec', el).value));
      if (!s || s < 10 || s > 900) return toast('Bitte 10–900 Sekunden eingeben');
      await setSetting('restSeconds', s);
      toast('Pausenzeit gespeichert');
    }
    if (act === 'export') exportBackup();
    if (act === 'import') $('#importfile', el).click();
  });

  $('#importfile', el).addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!confirm('Alle aktuellen Daten durch die Sicherung ersetzen?')) return;
    try {
      await importAll(JSON.parse(await file.text()));
      toast('Sicherung wiederhergestellt');
      rerender();
    } catch (err) {
      toast(`Fehler: ${err.message}`);
    }
  });
}

async function exportBackup() {
  const data = await exportAll();
  const name = `fittrack-sicherung-${dateStr()}.json`;
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const file = new File([blob], name, { type: 'application/json' });
  // Auf dem iPhone öffnet das Teilen-Menü („In Dateien sichern“).
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'FitTrack-Sicherung' });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
