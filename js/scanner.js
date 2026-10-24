// Barcode-Scanner über die Kamera (ZXing). Gibt den erkannten Code zurück oder null.
import { openSheet, closeSheet, $, toast } from './ui.js';

const ZXING_URL = 'https://cdn.jsdelivr.net/npm/@zxing/browser@0.2.1/+esm';

export function scanBarcode() {
  return new Promise((resolve) => {
    let controls = null;
    let settled = false;
    const finish = (code) => {
      if (settled) return;
      settled = true;
      if (controls) controls.stop();
      closeSheet();
      resolve(code);
    };

    const sheet = openSheet(`<h2>Barcode scannen</h2>
      <div class="scanner"><video playsinline muted autoplay></video><div class="aim"></div></div>
      <p class="hint" style="margin-top:10px" id="scanmsg">Halte den Strichcode in den Rahmen.</p>
      <form class="row" id="manualcode">
        <input inputmode="numeric" placeholder="Oder Code eintippen" class="grow" aria-label="Barcode">
        <button class="btn soft">OK</button>
      </form>
      <div class="actions"><button class="btn" data-act="cancel">Abbrechen</button></div>`,
    { onClose: () => { if (!settled) { settled = true; if (controls) controls.stop(); resolve(null); } } });

    $('[data-act="cancel"]', sheet).addEventListener('click', () => finish(null));
    $('#manualcode', sheet).addEventListener('submit', (e) => {
      e.preventDefault();
      const code = $('#manualcode input', sheet).value.replace(/\D/g, '');
      if (code.length >= 6) finish(code); else toast('Code zu kurz');
    });

    (async () => {
      try {
        const { BrowserMultiFormatReader } = await import(ZXING_URL);
        const reader = new BrowserMultiFormatReader();
        const video = $('video', sheet);
        controls = await reader.decodeFromConstraints(
          { audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } },
          video,
          (result) => {
            if (result) {
              if (navigator.vibrate) navigator.vibrate(60);
              finish(result.getText());
            }
          },
        );
        if (settled) controls.stop();
      } catch (err) {
        console.warn(err);
        const msg = $('#scanmsg', sheet);
        if (msg) {
          msg.className = 'error small';
          msg.textContent = err && err.name === 'NotAllowedError'
            ? 'Kein Kamerazugriff. Erlaube die Kamera in den Einstellungen (Safari › Kamera) oder tippe den Code ein.'
            : 'Kamera nicht verfügbar. Tippe den Code unten ein.';
        }
      }
    })();
  });
}
