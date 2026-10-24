// Lebensmittel-Daten: lokale Datenbank zuerst, dann Open Food Facts (kostenlos, ohne Schlüssel).
import { db } from './db.js';
import { round } from './ui.js';
import { normalize } from './food-db.js';

const OFF = 'https://world.openfoodfacts.org';
const FIELDS = 'code,product_name,product_name_de,generic_name_de,brands,nutriments,serving_quantity,serving_size';

function fromOff(p) {
  const n = p.nutriments || {};
  let kcal = n['energy-kcal_100g'];
  if (kcal === undefined && n.energy_100g !== undefined) kcal = n.energy_100g / 4.184;
  const name = (p.product_name_de || p.product_name || p.generic_name_de || '').trim();
  if (!name || kcal === undefined) return null;
  return {
    id: `off:${p.code}`,
    barcode: p.code,
    name,
    brand: (p.brands || '').split(',')[0].trim(),
    per100: {
      kcal: round(kcal),
      protein: round(n.proteins_100g, 1),
      carbs: round(n.carbohydrates_100g, 1),
      fat: round(n.fat_100g, 1),
    },
    serving: Number(p.serving_quantity) > 0 ? round(p.serving_quantity) : null,
    servingLabel: p.serving_size || '',
    source: 'off',
  };
}

export async function lookupBarcode(code) {
  const local = (await db.all('foods')).find((f) => f.barcode === code);
  if (local) return local;
  const res = await fetch(`${OFF}/api/v2/product/${encodeURIComponent(code)}.json?fields=${FIELDS}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Open Food Facts antwortet nicht (${res.status})`);
  const data = await res.json();
  if (data.status !== 1 || !data.product) return null;
  return fromOff({ ...data.product, code });
}

export async function searchLocal(term) {
  const t = normalize(term);
  return (await db.all('foods'))
    .filter((f) => normalize(`${f.name} ${f.brand || ''}`).includes(t))
    .sort((a, b) => (b.lastUsed || '').localeCompare(a.lastUsed || ''))
    .slice(0, 20);
}

// Open Food Facts hat zwei Suchdienste, die nicht immer beide erreichbar sind – der Reihe nach probieren.
export async function searchOnline(term) {
  const q = encodeURIComponent(term);
  const attempts = [
    async () => {
      const res = await fetch(`https://search.openfoodfacts.org/search?q=${q}&page_size=25&langs=de&fields=${FIELDS}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      return (data.hits || []).map((p) => fromOff({ ...p, brands: Array.isArray(p.brands) ? p.brands.join(',') : p.brands }));
    },
    async () => {
      const res = await fetch(`${OFF}/cgi/search.pl?search_terms=${q}&search_simple=1&action=process&json=1&page_size=25&lc=de&fields=${FIELDS}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      return (data.products || []).map(fromOff);
    },
  ];
  for (const attempt of attempts) {
    try {
      return (await attempt()).filter(Boolean);
    } catch (err) {
      console.warn('Suche', err);
    }
  }
  throw new Error('Die Online-Suche von Open Food Facts ist gerade nicht erreichbar');
}

export async function recentFoods(limit = 15) {
  return (await db.all('foods'))
    .filter((f) => f.lastUsed)
    .sort((a, b) => b.lastUsed.localeCompare(a.lastUsed))
    .slice(0, limit);
}

export function scale(per100, grams) {
  const f = (Number(grams) || 0) / 100;
  return {
    kcal: round(per100.kcal * f),
    protein: round((per100.protein || 0) * f, 1),
    carbs: round((per100.carbs || 0) * f, 1),
    fat: round((per100.fat || 0) * f, 1),
  };
}
