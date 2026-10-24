// Einstieg: Router und Tab-Leiste.
import * as training from './training.js';
import * as progress from './progress.js';
import * as nutrition from './nutrition.js';
import * as settings from './settings.js';
import { $$, closeSheet } from './ui.js';

const routes = [
  [/^\/food$/, 'food', nutrition.renderDay],
  [/^\/food\/add$/, 'food', nutrition.renderAdd],
  [/^\/train$/, 'train', training.renderHome],
  [/^\/train\/session\/([\w-]+)$/, 'train', training.renderSession],
  [/^\/train\/plan\/([\w-]+)$/, 'train', training.renderPlan],
  [/^\/train\/exercises$/, 'train', training.renderExercises],
  [/^\/progress$/, 'progress', progress.renderHome],
  [/^\/progress\/exercise\/([\w-]+)$/, 'progress', progress.renderExercise],
  [/^\/settings$/, 'settings', settings.renderSettings],
];

// Aufräumfunktionen (z. B. Intervalle) der aktuell angezeigten Seite.
const cleanups = [];
export function onLeave(fn) { cleanups.push(fn); }

let lastPath = null;

async function render() {
  while (cleanups.length) cleanups.pop()();
  closeSheet();
  const hash = location.hash.slice(1) || '/food';
  const [path, query = ''] = hash.split('?');
  const params = new URLSearchParams(query);
  for (const [re, tab, fn] of routes) {
    const match = path.match(re);
    if (!match) continue;
    for (const a of $$('.tabs a')) a.classList.toggle('active', a.dataset.tab === tab);
    const samePage = path === lastPath;
    const scroll = window.scrollY;
    try {
      await fn({ params, match, rerender: render });
    } catch (err) {
      console.error(err);
      document.getElementById('view').innerHTML = `<div class="page"><p class="error">Fehler: ${String(err.message || err)}</p></div>`;
    }
    window.scrollTo(0, samePage ? scroll : 0);
    lastPath = path;
    return;
  }
  location.replace('#/food');
}

window.addEventListener('hashchange', render);

async function start() {
  await training.seedIfEmpty();
  await render();
  training.restoreRestTimer();
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    // Neue Version aktiv → einmal neu laden, damit sie sofort gilt (nicht erst beim nächsten Öffnen).
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController && !reloaded) { reloaded = true; location.reload(); }
    });
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
      .then((reg) => reg.update())
      .catch((e) => console.warn('SW', e));
  }
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});
  }
}

start();
