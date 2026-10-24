// Essensfoto analysieren mit der Claude-API (eigener API-Schlüssel, direkt vom Gerät).
import { getSetting } from './db.js';

const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.133.0/+esm';

export const MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 – am genauesten (ca. 1,5–2 ct/Foto)' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 – ausgewogen (ca. 0,8 ct/Foto)' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 – am günstigsten (ca. 0,04 ct/Foto)' },
];
export const DEFAULT_MODEL = 'claude-opus-5-5';

const SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          grams: { type: 'number' },
          kcal: { type: 'number' },
          protein: { type: 'number' },
          carbs: { type: 'number' },
          fat: { type: 'number' },
        },
        required: ['name', 'grams', 'kcal', 'protein', 'carbs', 'fat'],
        additionalProperties: false,
      },
    },
    note: { type: 'string' },
  },
  required: ['items', 'note'],
  additionalProperties: false,
};

const SYSTEM = `Du bist eine erfahrene Ernährungsberaterin und schätzt Mahlzeiten anhand von Fotos oder Beschreibungen.
Zerlege das Essen in seine erkennbaren Bestandteile. Gib für jeden Bestandteil an:
- name: kurzer deutscher Name (z. B. "Spaghetti, gekocht", "Hühnerbrust, gebraten")
- grams: geschätzte Menge in Gramm (verzehrfertiger Zustand)
- kcal, protein, carbs, fat: Werte für genau diese Menge (Makros in Gramm)
Nutze auf Fotos Teller, Besteck und Verpackungen als Größenvergleich; bei Beschreibungen ohne Menge nimm eine übliche Portion an. Rechne sichtbares und typisches Bratfett, Öl, Butter und Soßen realistisch mit ein – lieber als eigenen Bestandteil.
Wenn kein Essen zu sehen ist, gib eine leere Liste zurück.
note: ein kurzer deutscher Satz zu den größten Unsicherheiten der Schätzung.`;

// Bild verkleinern (spart Kosten, die API nutzt ohnehin max. ~1568 px) und als JPEG kodieren.
export function fileToJpeg(file, maxSide = 1568) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      URL.revokeObjectURL(url);
      resolve({ dataUrl, base64: dataUrl.split(',')[1] });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Bild konnte nicht gelesen werden')); };
    img.src = url;
  });
}

export function analyzeMeal(base64, hint = '') {
  return estimate([
    { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
    { type: 'text', text: hint ? `Zusatzinfo von mir: ${hint}` : 'Was habe ich gegessen?' },
  ]);
}

// Schätzung aus einer Beschreibung, z. B. "200 g Spaghetti Bolognese" – wenn es kein Foto gibt.
export function analyzeText(description) {
  return estimate([{ type: 'text', text: `Kein Foto – ich beschreibe, was ich gegessen habe: ${description}` }]);
}

export async function hasApiKey() {
  return !!(await getSetting('apiKey'));
}

async function estimate(content) {
  const apiKey = await getSetting('apiKey');
  if (!apiKey) throw new Error('Kein API-Schlüssel hinterlegt. Trag ihn unter Profil › KI-Foto-Erkennung ein.');
  const model = await getSetting('aiModel', DEFAULT_MODEL);

  const { default: Anthropic } = await import(SDK_URL);
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 });

  const params = {
    model,
    max_tokens: 16000,
    system: SYSTEM,
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content }],
  };

  let response;
  try {
    if (model === 'claude-haiku-5-5') {
      response = await client.messages.create(params);
    } else {
      // Falls das Modell die Anfrage aus Sicherheitsgründen ablehnt, springt serverseitig ein anderes ein.
      try {
        response = await client.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
      } catch (err) {
        if (!(err instanceof Anthropic.BadRequestError)) throw err;
        response = await client.messages.create(params);
      }
    }
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new Error('API-Schlüssel ungültig. Bitte unter Profil prüfen.');
    if (err instanceof Anthropic.PermissionDeniedError) throw new Error('Kein Zugriff – ist Guthaben auf deinem API-Konto?');
    if (err instanceof Anthropic.RateLimitError) throw new Error('Zu viele Anfragen – bitte kurz warten.');
    if (err instanceof Anthropic.BadRequestError) throw new Error(`Anfrage abgelehnt: ${err.message}`);
    if (err instanceof Anthropic.APIConnectionError) throw new Error('Keine Verbindung zur Claude-API.');
    if (err instanceof Anthropic.APIError) throw new Error(`Claude-API-Fehler ${err.status ?? ''}: ${err.message}`);
    throw err;
  }

  if (response.stop_reason === 'refusal') throw new Error('Die KI konnte dieses Bild nicht auswerten.');
  if (response.stop_reason === 'max_tokens') throw new Error('Antwort unvollständig – bitte nochmal versuchen.');
  const text = response.content.find((b) => b.type === 'text')?.text;
  if (!text) throw new Error('Leere Antwort der KI.');
  const data = JSON.parse(text);
  return { items: data.items || [], note: data.note || '', model: response.model };
}
