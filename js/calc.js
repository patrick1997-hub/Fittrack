// Kalorien- und Makroziel: Grundumsatz × Alltag + Training + Zielanpassung.

// Alltag OHNE Training – das Training wird pro Tag aus den eingetragenen Einheiten dazugerechnet.
export const DAILY = [
  { value: 1.2, label: 'Sitzend (Büro, wenig Bewegung)' },
  { value: 1.375, label: 'Leicht aktiv (viel gehen oder stehen)' },
  { value: 1.55, label: 'Aktiv (körperliche Arbeit)' },
  { value: 1.725, label: 'Sehr aktiv (schwere körperliche Arbeit)' },
];

// Pauschal MIT Training – nur wenn das Training nicht extra eingerechnet wird.
export const ACTIVITY = [
  { value: 1.2, label: 'Kaum Bewegung (Bürojob, kein Sport)' },
  { value: 1.375, label: 'Leicht aktiv (1–2× Training/Woche)' },
  { value: 1.55, label: 'Mäßig aktiv (3–4× Training/Woche)' },
  { value: 1.725, label: 'Sehr aktiv (5–6× Training/Woche)' },
  { value: 1.9, label: 'Extrem aktiv (körperliche Arbeit + Training)' },
];

export const GOALS = [
  { value: 'lose', label: 'Abnehmen (−500 kcal)', delta: -500, proteinPerKg: 2.0 },
  { value: 'keep', label: 'Gewicht halten', delta: 0, proteinPerKg: 1.6 },
  { value: 'gain', label: 'Muskelaufbau (+300 kcal)', delta: 300, proteinPerKg: 1.8 },
];

export const goalOf = (p) => GOALS.find((g) => g.value === p.goal) || GOALS[1];
export const trainingSeparate = (p) => p.trainingBonus !== false;

// Grundumsatz: mit Körperfettanteil nach Katch-McArdle (berücksichtigt Muskelmasse), sonst Mifflin-St-Jeor.
export function bmrOf(p) {
  const weight = Number(p.weight);
  const height = Number(p.height);
  const age = Number(p.age);
  const bf = Number(p.bodyFat);
  if (weight && bf >= 3 && bf <= 60) {
    const lean = weight * (1 - bf / 100);
    return { bmr: 370 + 21.6 * lean, formula: 'Katch-McArdle (mit Muskelmasse)', lean };
  }
  if (!weight || !height || !age) return null;
  return { bmr: 10 * weight + 6.25 * height - 5 * age + (p.sex === 'f' ? -161 : 5), formula: 'Mifflin-St-Jeor' };
}

export function macrosFor(kcal, weight, p) {
  const protein = Math.round(Number(weight) * goalOf(p).proteinPerKg);
  const fat = Math.round((kcal * 0.25) / 9);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { kcal, protein, carbs, fat };
}

// Ziel für einen Tag OHNE Training (Ruhetag), bzw. pauschal inkl. Training, wenn nicht getrennt gerechnet wird.
export function computeTargets(p) {
  const b = bmrOf(p);
  if (!b) return null;
  const factor = trainingSeparate(p) ? Number(p.daily || 1.375) : Number(p.activity || 1.55);
  const tdee = b.bmr * factor;
  const kcal = Math.round((tdee + goalOf(p).delta) / 10) * 10;
  return { ...macrosFor(kcal, p.weight, p), bmr: Math.round(b.bmr), tdee: Math.round(tdee), formula: b.formula };
}

// Verbrauch einer Krafttrainings-Einheit, bewusst vorsichtig geschätzt:
// ~4,5 MET minus 1 MET Ruhe (steckt schon im Grundumsatz) → 3,5 kcal pro kg und Stunde.
// Dauer gedeckelt auf 2 h, falls das Beenden vergessen wurde.
export function trainingKcal(session, weightKg) {
  const end = session.finishedAt ? new Date(session.finishedAt) : new Date();
  const minutes = Math.min(120, Math.max(0, (end - new Date(session.startedAt)) / 60000));
  if (minutes < 10 || !weightKg) return { kcal: 0, minutes: Math.round(minutes) };
  return { kcal: Math.round(3.5 * Number(weightKg) * (minutes / 60)), minutes: Math.round(minutes) };
}

// Geschätztes 1-Wiederholungs-Maximum (Epley).
export function e1rm(weight, reps) {
  const w = Number(weight);
  const r = Number(reps);
  if (!w || !r) return 0;
  return r === 1 ? w : w * (1 + r / 30);
}
