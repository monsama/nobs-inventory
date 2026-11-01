/* Reading codes from the camera picture. Where the browser reads barcodes itself (BarcodeDetector: Chrome and Edge),
   every kind it knows; elsewhere (Firefox, Safari on the iPhone) QR codes, such as the app's own labels, with jsQR,
   served by this server (no outside address). The picture stays in the browser. */
import { $, byId, esc, objs } from './01-core.js';
import { closeModal, modal } from './19-modal.js';
import { openObjs } from './02-views.js';

export const canScan = () => typeof navigator !== 'undefined' && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

let jsqr = null;
const loadJsQR = () => jsqr || (jsqr = new Promise((resolve, reject) => {
  if (window.jsQR) return resolve(window.jsQR);
  const s = Object.assign(document.createElement('script'), { src: 'vendor/jsqr.js', async: true });
  s.onload = () => window.jsQR ? resolve(window.jsQR) : reject(new Error('The QR reader did not load.'));
  s.onerror = () => { jsqr = null; reject(new Error('The QR reader could not be loaded.')); };
  document.head.appendChild(s);
}));

/* A reader: read(video) gives the text of a code in the picture now, or ''. */
export async function codeReader(){
  if ('BarcodeDetector' in window) {
    try {
      const formats = await window.BarcodeDetector.getSupportedFormats();
      const det = new window.BarcodeDetector(formats.length ? { formats } : undefined);
      return { kind: 'native', read: async v => { const c = await det.detect(v); return c.length ? String(c[0].rawValue || '').trim() : ''; } };
    } catch { /* fall back to QR codes */ }
  }
  const read = await loadJsQR();
  const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
  return { kind: 'qr', read: async v => {
    if (!v.videoWidth) return '';
    /* A smaller copy of the picture is enough and keeps it quick on a phone. */
    const k = Math.min(1, 720 / v.videoWidth), w = Math.round(v.videoWidth * k), h = Math.round(v.videoHeight * k);
    if (canvas.width !== w || canvas.height !== h){ canvas.width = w; canvas.height = h; }
    ctx.drawImage(v, 0, 0, w, h);
    const r = read(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' });
    return r ? String(r.data || '').trim() : '';
  } };
}

/* An address from a device's label (…/?o=INV-0001): the inventory number in it, else ''. */
export const linkedCode = v => { const m = /[?&]o=([^&#\s]+)/.exec(String(v || '')); if (!m) return ''; try { return decodeURIComponent(m[1]); } catch { return ''; } };
/* The device a scanned text names: by inventory number (or id, from a label), then serial number, then name. */
export function deviceOfCode(v){
  const t = String(linkedCode(v) || v || '').trim(), q = t.toLowerCase();
  if (!q) return null;
  return objs.find(o => o.code && o.code.toLowerCase() === q) || byId(t) || objs.find(o => o.serial && o.serial.toLowerCase() === q) || objs.find(o => o.name && o.name.toLowerCase() === q) || null;
}

/* The scan button beside the search: point the camera at a label, and the device opens. */
async function scanToOpen(){
  modal(`<div class="mh">Scan a label</div><div class="mb"><video id="scVideo" class="stk-cam" playsinline muted aria-label="Camera picture"></video>
    <p class="stk-last" id="scLast" role="status" aria-live="polite">Starting the camera…</p></div>
    <div class="mf"><button id="scDone">Close</button></div>`, 'sm');
  let stream = null, timer = 0, stopped = false, last = '';
  const say = t => { const p = $('#scLast'); if (p) p.innerHTML = t; };
  const stop = () => { stopped = true; clearTimeout(timer); if (stream) stream.getTracks().forEach(x => x.stop()); };
  $('#scDone').onclick = () => { stop(); closeModal(); };
  try {
    const reader = await codeReader();
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    const v = $('#scVideo'); if (stopped || !v){ stop(); return; }
    v.srcObject = stream; await v.play();
    say(reader.kind === 'native' ? 'Hold a label, barcode or QR code in the frame.' : 'Hold a label\'s QR code in the frame.');
    const tick = async () => {
      if (stopped || !document.body.contains(v) || document.querySelector('#mdl.minimized')){ stop(); return; }
      try {
        const val = await reader.read(v);
        if (val && val !== last){
          last = val;
          const o = deviceOfCode(val);
          if (o){ stop(); closeModal(); openObjs([o.id]); return; }
          say(`<span class="warn"><b>${esc((linkedCode(val) || val).slice(0, 80))}</b> is not in the inventory.</span>`);
        }
      } catch { /* a frame that cannot be read */ }
      timer = setTimeout(tick, 250);
    };
    tick();
  } catch (e) {
    say(esc(e && e.name === 'NotAllowedError' ? 'The camera is not allowed: allow it for this page in the browser.' : 'The camera cannot be used here: ' + (e.message || e)));
  }
}
const sb = typeof document !== 'undefined' && $('#scanBtn');
if (sb && canScan()){ sb.hidden = false; sb.onclick = scanToOpen; }
