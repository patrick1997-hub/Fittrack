// Kalorien- und Makroziel aus Körperdaten (Mifflin-St-Jeor).
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

export function computeTargets(p) {
  const weight = Number(p.weight);
  const height = Number(p.height);
  const age = Number(p.age);
  if (!weight || !height || !age) return null;
  const bmr = 10 * weight + 6.25 * height - 5 * age + (p.sex === 'f' ? -161 : 5);
  const tdee = bmr * Number(p.activity || 1.55);
  const goal = GOALS.find((g) => g.value === p.goal) || GOALS[1];
  const kcal = Math.round((tdee + goal.delta) / 10) * 10;
  const protein = Math.round(weight * goal.proteinPerKg);
  const fat = Math.round((kcal * 0.25) / 9);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { kcal, protein, carbs, fat, bmr: Math.round(bmr), tdee: Math.round(tdee) };
}

// Geschätztes 1-Wiederholungs-Maximum (Epley).
export function e1rm(weight, reps) {
  const w = Number(weight);
  const r = Number(reps);
  if (!w || !r) return 0;
  return r === 1 ? w : w * (1 + r / 30);
}
