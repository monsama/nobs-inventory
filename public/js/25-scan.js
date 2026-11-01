/* Reading codes from the camera picture. Where the browser reads barcodes itself (BarcodeDetector: Chrome and Edge),
   every kind it knows; elsewhere (Firefox, Safari on the iPhone) QR codes, such as the app's own labels, with jsQR,
   served by this server (no outside address). The picture stays in the browser. */
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
