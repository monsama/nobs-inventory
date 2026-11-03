/* Photos of a device, on its page: the label with the serial number, how it is cabled, where it stands. Shown as small
   previews; one opens large, with the ones before and after it (arrow keys too). An admin adds them (the button, by
   dropping pictures on the panel, or by pasting one), gives each a caption and removes them.
   A photo is made smaller here before it is sent (at most 2560 pixels on its long side, and a preview of 480; JPEG or
   WebP, whichever is smaller, see prepare), turned the way the camera held it, and drawn again, which leaves its
   metadata behind: the camera, the time and the GPS
   position stay on this computer. The server checks the picture again and keeps it apart from the inventory
   (server/device-images.js). */
import { evEl, $, byId, hist, now, st, toast } from './01-core.js';
import { dateText } from './dates.js';
import { closeModal, modal } from './19-modal.js';
import { isAdmin, who } from './04-settings.js';
import { SERVER, queueServerSave, view } from './07-render.js';
import { html } from './html.js';

const LONG_SIDE = 2560, THUMB_SIDE = 480, MAX_FILE = 40 * 1048576, MAX_SENT = 6 * 1048576;
/* What the server said each device has, so a redraw of the page does not ask again. */
const CACHE = new Map();
const kb = n => n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
const label = p => p.caption || p.name || 'Photo';
const thumbUrl = p => `api/images/${encodeURIComponent(p.id)}?size=thumb`;
const fullUrl = p => `api/images/${encodeURIComponent(p.id)}`;

/* How many photos a device has, once read (null before). */
export const photoCount = id => { const c = CACHE.get(id); return c && !c.failed ? c.images.length : null; };
/* The Photos panel of device o's page: previews of its photos once read (Loading… before), and for an admin the
   Add photos row with the count and limit. Nothing without a server or for a record still in To review. */
export function photosPanel(o){
  if (!SERVER.on || o.review) return '';
  const c = CACHE.get(o.id), list = c ? c.images : null, edit = isAdmin();
  const empty = edit ? 'No photos yet: the label with its serial number, how it is cabled, where it stands. Drop pictures here or paste one.' : 'No photos yet.';
  return String(html`<div class="panelbox ph-panel" id="phPanel"><div class="hdr">Photos <span class="cnt">${list ? list.length || 'none' : '…'}</span></div>
    <div class="ph-grid" id="phGrid">${!list ? html`<p class="note lempty">Loading…</p>` : c.failed ? html`<p class="note lempty">The photos could not be read. They are asked for again when the page is opened.</p>` : list.length
      ? list.map((p, i) => html`<button type="button" class="ph-thumb" data-ph="${i}" title="${label(p)}" aria-label="Open photo ${i + 1} of ${list.length}: ${label(p)}"><img src="${thumbUrl(p)}" alt="" loading="lazy" decoding="async"></button>`)
      : html`<p class="note lempty">${empty}</p>`}</div>
    ${edit && list && !c.failed ? html`<div class="addrel ph-add"><button type="button" id="phAdd" ${list.length >= c.max ? html`disabled title="A device keeps up to ${c.max} photos"` : ''}>Add photos…</button>
      <input id="phFile" type="file" accept="image/*" multiple hidden><span class="muted" id="phMsg" role="status" aria-live="polite">${list.length ? `${list.length} photo${list.length === 1 ? '' : 's'} (max. ${c.max})` : ''}</span></div>` : ''}</div>`);
}

/* Called after the device page is drawn: reads the list the first time, and wires the panel. */
export function bindPhotos(o){
  const panel = $('#phPanel'); if (!panel) return;
  openId = o.id;
  const c = CACHE.get(o.id);
  if (!c) { load(o); return; }
  /* What is shown is read again in the background when the page is drawn anew (another admin, a restore): at most every
     few seconds, so the redraw after it does not ask again. */
  if (Date.now() - c.at > 5000) load(o);
  panel.querySelectorAll('[data-ph]').forEach(b => b.onclick = () => viewer(o, Number(b.dataset.ph)));
  if (!isAdmin()) return;
  const file = $('#phFile');
  $('#phAdd').onclick = () => file.click();
  file.onchange = () => { const f = [...file.files]; file.value = ''; add(o, f); };
  if (panel.dataset.bound) return;
  panel.dataset.bound = '1';
  panel.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); panel.classList.add('ph-drop'); } });
  panel.addEventListener('dragleave', e => { if (!panel.contains(e.relatedTarget)) panel.classList.remove('ph-drop'); });
  panel.addEventListener('drop', e => { e.preventDefault(); panel.classList.remove('ph-drop'); add(o, [...e.dataTransfer.files]); });
}
/* A picture pasted on the device page (not into a field) is added to it. */
document.addEventListener('paste', e => {
  const panel = $('#phPanel'), o = panel && openId && byId(openId);
  if (!panel || !o || !isAdmin() || !$('#phAdd') || $('#mdl') || evEl(e).closest('input, textarea, [contenteditable]')) return;
  const files = [...(e.clipboardData ? e.clipboardData.files : [])].filter(f => /^image\//.test(f.type));
  if (files.length) { e.preventDefault(); add(o, files); }
});
/* The device the panel on the page is for. */
let openId = null;

/* Only the panel's count, previews and Add row are drawn again: its title (open or closed, like every panel) stays. */
function redraw(o){
  const panel = $('#phPanel');
  if (!panel || openId !== o.id) return;
  /* No photo left (or a first one added): the whole page is drawn again, so the panel gets or loses its × like the
     other extras. */
  const n = photoCount(o.id), hadX = !!panel.querySelector('[data-xhide]');
  if (!panel.hidden && (n === 0) !== hadX && isAdmin()) {
    /* Drawn again in the background (the photos come after the page): the focus stays where it was. */
    const f = document.activeElement && document.activeElement.id;
    view();
    if (f && document.getElementById(f) && document.activeElement?.id !== f) document.getElementById(f).focus({ preventScroll: true });
    return;
  }
  const t = document.createElement('div'); t.innerHTML = photosPanel(o);
  const next = t.firstElementChild; if (!next) return;
  const cnt = panel.querySelector('.hdr .cnt'), cnt2 = next.querySelector('.hdr .cnt');
  if (cnt && cnt2) cnt.textContent = cnt2.textContent;
  [...panel.children].filter(x => !x.classList.contains('hdr')).forEach(x => x.remove());
  panel.append(...[...next.children].filter(x => !x.classList.contains('hdr')));
  bindPhotos(o);
  /* Read for the first time and none there: folded in place onto the Add line (the page is not drawn again, so what is
     being typed in a field stays). */
  if (photoCount(o.id) === 0 && !panel.dataset.xpanel && !panel.hidden && !(st.showPanels && st.showPanels.has(o.id + ':photos'))){
    panel.hidden = true;
    if (isAdmin()){
      panel.dataset.xpanel = 'photos';
      let bar = $('#xAdd');
      if (!bar){ bar = document.createElement('div'); bar.className = 'xadd'; bar.id = 'xAdd'; bar.innerHTML = '<span class="muted">Add</span>'; panel.parentNode.insertBefore(bar, panel.parentNode.firstChild); }
      const b = document.createElement('button'); b.type = 'button'; b.dataset.xadd = 'photos'; b.textContent = '+ Photo';
      b.onclick = () => { (st.showPanels = st.showPanels || new Set()).add(o.id + ':photos'); panel.hidden = false; b.remove(); if (!bar.querySelector('[data-xadd]')) bar.remove(); const f = panel.querySelector('button:not([disabled])'); if (f) f.focus(); };
      bar.append(b);
    }
  }
}
/* Reads device o's photo list from the server into CACHE and draws the panel again when it changed. A list that
   could not be read is marked failed and asked for again on the next drawing. */
async function load(o){
  const was = CACHE.get(o.id);
  if (was) was.at = Date.now();
  const r = await fetch(`api/objects/${encodeURIComponent(o.id)}/images`, { credentials: 'same-origin' }).catch(() => null);
  const j = r && r.ok ? await r.json().catch(() => null) : null;
  /* A device not saved yet (just made) has none on the server: an empty list, asked again later. A list that could not be
     read is not kept: the next drawing of the page asks again. */
  const next = j ? { images: j.images || [], max: j.max || 30, at: Date.now() } : { images: [], max: 30, at: 0, failed: !(r && r.status === 404) };
  if (was && JSON.stringify(was.images) === JSON.stringify(next.images) && !was.failed) return;
  CACHE.set(o.id, next);
  redraw(o);
}
/* Forgets what was read: after a restore, a reload from the server, or photos moved by a merge. */
export const forgetPhotos = (...ids) => { if (ids.length) ids.forEach(id => CACHE.delete(id)); else CACHE.clear(); };
/* A record folded into a device as the same device: its photos go to that device. */
export async function movePhotos(from, to){
  if (!SERVER.on) return;
  const r = await fetch(`api/objects/${encodeURIComponent(from)}/images/move`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to }) }).catch(() => null);
  forgetPhotos(from, to);
  const j = r && r.ok ? await r.json().catch(() => ({})) : {};
  if (j.left) toast(`${j.left} photo${j.left === 1 ? '' : 's'} stayed with the record: the device has no room for more.`);
}

/* The JPEG's own orientation (EXIF tag 0x0112): 1 is upright; anything else needs turning, so the file cannot be kept. */
async function jpegOrientation(file){
  const b = new DataView(await file.slice(0, 131072).arrayBuffer());
  if (b.byteLength < 4 || b.getUint16(0) !== 0xffd8) return 1;
  for (let i = 2; i + 4 < b.byteLength;) {
    const m = b.getUint16(i), len = b.getUint16(i + 2);
    if (m === 0xffe1 && b.getUint32(i + 4) === 0x45786966) {   /* "Exif" */
      const t = i + 10, le = b.getUint16(t) === 0x4949, u16 = k => b.getUint16(k, le), u32 = k => b.getUint32(k, le);
      const ifd = t + u32(t + 4);
      for (let n = 0, cnt = u16(ifd); n < cnt; n++) { const at = ifd + 2 + n * 12; if (at + 12 > b.byteLength) break; if (u16(at) === 0x0112) return u16(at + 8); }
      return 1;
    }
    if ((m & 0xff00) !== 0xff00 || m === 0xffda) return 1;
    i += 2 + len;
  }
  return 1;
}
/* Whether this browser writes WebP (Safari writes a PNG instead when asked). */
let WEBP = null;
const webpOk = async () => {
  if (WEBP !== null) return WEBP;
  const c = document.createElement('canvas'); c.width = c.height = 2;
  WEBP = await new Promise(r => c.toBlob(b => r(!!b && b.type === 'image/webp'), 'image/webp', 0.8));
  return WEBP;
};
/* A picture file, made ready to send, as small as it can be without a visible loss: turned upright, at most LONG_SIDE
   pixels, without its metadata, and a preview. Each way of writing it is tried and the smallest wins:
   - a photo: JPEG and WebP at a quality the eye does not tell from the original (WebP is about a third smaller);
   - a screenshot (PNG): PNG and lossless WebP, so text stays exactly as sharp;
   - the file itself, when it is already small enough, upright and not larger than the others: nothing is written again,
     so nothing is lost (the server takes its metadata out). */
export async function prepare(file){
  if (file.size > MAX_FILE) throw new Error(`${file.name} is larger than ${MAX_FILE / 1048576} MB.`);
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { throw new Error(`${file.name} cannot be read as a picture here. Save it as JPEG or PNG and add it again.`); }
  const fit = max => { const k = Math.min(1, max / Math.max(bmp.width, bmp.height)); return /** @type {[number, number]} */ ([Math.max(1, Math.round(bmp.width * k)), Math.max(1, Math.round(bmp.height * k))]); };
  const draw = ([w, h], type, q) => new Promise((resolve, reject) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d');
    if (type === 'image/jpeg') { x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); }   /* a transparent PNG gets a white ground, not a black one */
    x.drawImage(bmp, 0, 0, w, h);
    c.toBlob(b => b ? resolve(b) : reject(new Error(`${file.name} could not be made smaller.`)), type, q);
  });
  const size = fit(LONG_SIDE), webp = await webpOk();
  const screenshot = file.type === 'image/png';
  const tries = screenshot
    ? [draw(size, 'image/png'), ...(webp ? [draw(size, 'image/webp', 1)] : [])]
    : [draw(size, 'image/jpeg', 0.85), ...(webp ? [draw(size, 'image/webp', 0.85)] : [])];
  let data = (await Promise.all(tries)).filter(b => b && b.size).sort((a, b) => a.size - b.size)[0];
  /* The file as it is, when nothing above is smaller and it needs no turning or shrinking. */
  const keepable = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) && size[0] === bmp.width && size[1] === bmp.height
    && (file.type !== 'image/jpeg' || (await jpegOrientation(file)) === 1);
  if (keepable && file.size <= data.size && file.size <= MAX_SENT) data = file;
  if (data.size > MAX_SENT) data = await draw(size, webp ? 'image/webp' : 'image/jpeg', 0.85);
  if (data.size > MAX_SENT) data = await draw(size, webp ? 'image/webp' : 'image/jpeg', 0.7);
  const thumbs = (await Promise.all([draw(fit(THUMB_SIDE), 'image/jpeg', 0.8), ...(webp ? [draw(fit(THUMB_SIDE), 'image/webp', 0.8)] : [])])).sort((a, b) => a.size - b.size);
  bmp.close && bmp.close();
  return { name: file.name || 'Photo', data: await base64(data), thumb: await base64(thumbs[0]), w: size[0], h: size[1], bytes: data.size, tbytes: thumbs[0].size };
}
async function base64(blob){
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/* Adds the pictures in files to device o, one after the other, up to its limit: each is made smaller (prepare) and
   uploaded, the panel showing progress. Notes the photos added in the history; stops at the first error. */
async function add(o, files){
  const pics = files.filter(f => /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name));
  if (!pics.length) { toast('Choose a picture: JPEG, PNG or WebP.'); return; }
  const c = CACHE.get(o.id); if (!c) return;
  const room = c.max - c.images.length;
  if (room <= 0) { toast(`A device keeps up to ${c.max} photos. Remove one first.`); return; }
  const list = pics.slice(0, room);
  const msg = t => { const m = $('#phMsg'); if (m) m.textContent = t; };
  let added = 0;
  for (const [i, f] of list.entries()) {
    msg(list.length > 1 ? `Adding ${i + 1} of ${list.length}…` : 'Adding the photo…');
    try {
      const body = await prepare(f);
      const r = await fetch(`api/objects/${encodeURIComponent(o.id)}/images`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(r.status === 404 && /device/i.test(j.error || '') ? 'Save the device first, then add its photos.' : j.error || `The photo was not added (${r.status}).`);
      c.images.push(j.image); added++;
      redraw(o);
    } catch (e) { toast(e.message); break; }
  }
  if (added) {
    hist(o, now(), `${added === 1 ? 'Photo' : `${added} photos`} added by ${who()}`); queueServerSave();
    toast(added === 1 ? 'Photo added' : `${added} photos added`);
  }
  if (pics.length > room) toast(`${pics.length - room} not added: a device keeps up to ${c.max} photos.`);
  redraw(o);
}

/* One photo, large: the ones before and after it with the arrows (or the arrow keys), its caption, when and by whom it
   was added, Download, and for an admin Remove. */
function viewer(o, i){
  const c = CACHE.get(o.id); if (!c || !c.images[i]) { closeModal(); return; }
  const list = c.images, p = list[i], edit = isAdmin(), many = list.length > 1;
  modal(html`<div class="mh">${o.name}: photo ${i + 1} of ${list.length}</div>
    <div class="mb ph-view">
      ${many ? html`<button type="button" class="icon ph-nav ph-prev" id="phPrev" aria-label="Previous photo" title="Previous (←)">‹</button>` : ''}
      <a class="ph-big" href="${fullUrl(p)}" target="_blank" rel="noopener" title="Open in full size"><img src="${fullUrl(p)}" alt="${label(p)}" width="${p.w}" height="${p.h}"></a>
      ${many ? html`<button type="button" class="icon ph-nav ph-next" id="phNext" aria-label="Next photo" title="Next (→)">›</button>` : ''}
    </div>
    <div class="ph-info">${edit ? html`<input id="phCaption" maxlength="200" value="${p.caption || ''}" placeholder="Caption, e.g. Label on the back" aria-label="Caption of the photo">` : p.caption ? html`<b>${p.caption}</b>` : ''}
      <span class="muted">Added ${dateText(p.created.slice(0, 10))}${p.by ? ` by ${p.by}` : ''} · ${p.w} × ${p.h} · ${kb(p.bytes)}</span></div>
    <div class="mf">${edit ? html`<button id="phDel" class="danger-text">Remove…</button>` : ''}<span class="grow"></span><a class="btnlike" href="${fullUrl(p)}?download=1" download>Download</a><button id="phClose" class="primary">Close</button></div>`, 'wide ph-modal');
  const go = d => viewer(o, (i + d + list.length) % list.length);
  if (many) { $('#phPrev').onclick = () => go(-1); $('#phNext').onclick = () => go(1); }
  $('#phClose').onclick = () => closeModal();
  $('#mdl').addEventListener('keydown', e => {
    if (e.target.matches('input, textarea') || !many) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
  });
  /* The close button has the focus, so the arrow keys work at once. */
  $('#phClose').focus();
  const cap = $('#phCaption');
  if (cap) cap.onchange = async () => {
    const r = await fetch(`api/images/${encodeURIComponent(p.id)}`, { method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ caption: cap.value }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { toast(j.error || 'The caption was not saved.'); return; }
    p.caption = j.image.caption; toast('Caption saved'); redraw(o);
  };
  const del = $('#phDel');
  if (del) del.onclick = async () => {
    /* Asked once in place: a second click removes it for good. */
    if (!del.dataset.sure) { del.dataset.sure = '1'; del.textContent = 'Remove for good'; del.classList.add('danger'); return; }
    const r = await fetch(`api/images/${encodeURIComponent(p.id)}`, { method: 'DELETE', credentials: 'same-origin' });
    if (!r.ok) { const j = await r.json().catch(() => ({})); toast(j.error || 'The photo was not removed.'); return; }
    list.splice(i, 1);
    hist(o, now(), `Photo ${p.caption ? `“${p.caption}” ` : ''}removed by ${who()}`); queueServerSave();
    toast('Photo removed'); redraw(o);
    if (list.length) viewer(o, Math.min(i, list.length - 1)); else closeModal();
  };
}
