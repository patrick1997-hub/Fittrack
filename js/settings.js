// Profil: Körperdaten, Kalorienziel, KI-Schlüssel, Training, Datensicherung.
import { getSetting, setSetting, exportAll, importAll } from './db.js';
import { esc, mount, toast, num, fmt, round, dateStr, $ } from './ui.js';
import { ACTIVITY, GOALS, computeTargets } from './calc.js';
import { MODELS, DEFAULT_MODEL } from './ai.js';

export async function renderSettings({ rerender }) {
  const [profile, goals, apiKey, model, restSeconds] = await Promise.all([
    getSetting('profile', {}), getSetting('goals', {}), getSetting('apiKey', ''),
    getSetting('aiModel', DEFAULT_MODEL), getSetting('restSeconds', 90),
  ]);
  const p = { sex: 'm', activity: 1.55, goal: 'keep', ...profile };
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
      <label class="field"><span>Aktivität</span><select id="activity">${ACTIVITY.map((a) => `<option value="${a.value}" ${Number(p.activity) === a.value ? 'selected' : ''}>${a.label}</option>`).join('')}</select></label>
      <label class="field"><span>Ziel</span><select id="goal">${GOALS.map((g) => `<option value="${g.value}" ${p.goal === g.value ? 'selected' : ''}>${g.label}</option>`).join('')}</select></label>
      <div id="calcinfo" class="hint"></div>
      <button class="btn soft block" data-act="calc">Ziel berechnen</button>
    </div>

    <h2>Tagesziel</h2>
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

  const readProfile = () => ({
    sex: $('#sex', el).value,
    age: num($('#age', el).value) || '',
    height: num($('#height', el).value) || '',
    weight: num($('#weight', el).value) || '',
    activity: Number($('#activity', el).value),
    goal: $('#goal', el).value,
  });

  el.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    if (act === 'calc') {
      const prof = readProfile();
      const t = computeTargets(prof);
      if (!t) return toast('Bitte Alter, Größe und Gewicht eintragen');
      await setSetting('profile', prof);
      $('#g_kcal', el).value = t.kcal;
      $('#g_protein', el).value = t.protein;
      $('#g_carbs', el).value = t.carbs;
      $('#g_fat', el).value = t.fat;
      $('#calcinfo', el).textContent = `Grundumsatz ${fmt(t.bmr)} kcal · Gesamtumsatz ${fmt(t.tdee)} kcal. Werte eingetragen – du kannst sie anpassen und dann speichern.`;
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
