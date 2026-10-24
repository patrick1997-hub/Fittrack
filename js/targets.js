// Tagesziele (inkl. Trainings-Plus) und das anpassende Ziel aus echten Daten.
import { db, getSetting } from './db.js';
import { dateStr, shiftDate, parseDate } from './ui.js';
import { trainingKcal, trainingSeparate, goalOf, macrosFor, computeTargets } from './calc.js';

const dayOf = (iso) => dateStr(new Date(iso));

// Ziel je Datum: gespeichertes Grundziel + an Trainingstagen der Trainingsverbrauch (geht in Kohlenhydrate).
export async function targetsFor(dates) {
  const [goals, profile, sessions] = await Promise.all([getSetting('goals'), getSetting('profile', {}), db.all('sessions')]);
  const out = {};
  for (const date of dates) {
    if (!goals?.kcal) { out[date] = null; continue; }
    const t = { ...goals, training: { kcal: 0, minutes: 0, count: 0 } };
    if (trainingSeparate(profile)) {
      for (const s of sessions.filter((x) => dayOf(x.startedAt) === date)) {
        const k = trainingKcal(s, profile.weight);
        t.training.kcal += k.kcal;
        t.training.minutes += k.minutes;
        t.training.count += 1;
      }
      t.kcal += t.training.kcal;
      t.carbs = (t.carbs || 0) + Math.round(t.training.kcal / 4);
    }
    out[date] = t;
  }
  return out;
}

const WINDOW = 21; // Tage
export const NEED_DAYS = 10;
export const NEED_WEIGHINS = 4;

// Anpassendes Ziel: Wie viel isst du im Schnitt, und wie verändert sich dabei dein Gewicht?
// Verbrauch = Ø Essen − Gewichtsveränderung × 7.700 kcal/kg.
export async function adaptiveEstimate() {
  const [logs, weights, sessions, profile] = await Promise.all([
    db.all('logs'), db.all('weights'), db.all('sessions'), getSetting('profile', {}),
  ]);
  const today = dateStr();
  const start = shiftDate(today, -WINDOW);
  const days = Array.from({ length: WINDOW }, (_, i) => shiftDate(start, i)); // bis gestern

  const perDay = days.map((d) => logs.filter((l) => l.date === d).reduce((s, l) => s + (l.kcal || 0), 0));
  // Tage unter 1.000 kcal gelten als unvollständig eingetragen und zählen nicht.
  const tracked = perDay.filter((k) => k >= 1000);
  const wins = weights.filter((w) => w.date >= start && w.date <= today).sort((a, b) => a.date.localeCompare(b.date));
  const spanDays = wins.length > 1 ? (parseDate(wins[wins.length - 1].date) - parseDate(wins[0].date)) / 864e5 : 0;

  const result = {
    trackedDays: tracked.length, weighIns: wins.length, spanDays: Math.round(spanDays),
    ready: tracked.length >= NEED_DAYS && wins.length >= NEED_WEIGHINS && spanDays >= 10,
  };
  if (!result.ready) return result;

  // Gewichtstrend per linearer Regression (glättet Wasserschwankungen besser als erster/letzter Wert).
  const xs = wins.map((w) => (parseDate(w.date) - parseDate(start)) / 864e5);
  const ys = wins.map((w) => Number(w.kg));
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  const slope = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / xs.reduce((s, x) => s + (x - mx) ** 2, 0); // kg/Tag

  const avgIntake = tracked.reduce((a, b) => a + b, 0) / tracked.length;
  const tdee = Math.min(5000, Math.max(1200, avgIntake - slope * 7700));

  // Den Ø Trainingsverbrauch herausrechnen, damit er an Trainingstagen nicht doppelt dazukommt.
  let avgTraining = 0;
  if (trainingSeparate(profile)) {
    const inWindow = sessions.filter((s) => s.finishedAt && dayOf(s.startedAt) >= start && dayOf(s.startedAt) < today);
    avgTraining = inWindow.reduce((sum, s) => sum + trainingKcal(s, profile.weight).kcal, 0) / WINDOW;
  }
  const restDayTdee = tdee - avgTraining;
  const kcal = Math.round((restDayTdee + goalOf(profile).delta) / 10) * 10;
  const formula = computeTargets(profile);

  return {
    ...result,
    avgIntake: Math.round(avgIntake),
    kgPerWeek: Math.round(slope * 7 * 100) / 100,
    tdee: Math.round(tdee),
    avgTraining: Math.round(avgTraining),
    formulaTdee: formula ? formula.tdee + Math.round(avgTraining) : null,
    suggestion: macrosFor(kcal, profile.weight || ys[ys.length - 1], profile),
  };
}
