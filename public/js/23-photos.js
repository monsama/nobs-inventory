/* Photos of a device, on its page: the label with the serial number, how it is cabled, where it stands. Shown as small
   previews; one opens large, with the ones before and after it (arrow keys too). An admin adds them (the button, by
   dropping pictures on the panel, or by pasting one), gives each a caption and removes them.
   A photo is made smaller here before it is sent (at most 2560 pixels on its long side, and a preview of 480), turned
   the way the camera held it, and drawn again, which leaves its metadata behind: the camera, the time and the GPS
   position stay on this computer. The server checks the picture again and keeps it apart from the inventory
   (server/device-images.js). */
import { $, byId, esc, hist, now, toast } from './01-core.js';
import { dateText } from './dates.js';
import { closeModal, modal } from './19-modal.js';
import { canEdit, who } from './04-settings.js';
import { SERVER, queueServerSave } from './07-render.js';

const LONG_SIDE = 2560, THUMB_SIDE = 480, MAX_FILE = 40 * 1048576, MAX_SENT = 6 * 1048576;
/* What the server said each device has, so a redraw of the page does not ask again. */
const CACHE = new Map();
const kb = n => n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
const label = p => p.caption || p.name || 'Photo';
const thumbUrl = p => `api/images/${encodeURIComponent(p.id)}?size=thumb`;
const fullUrl = p => `api/images/${encodeURIComponent(p.id)}`;

export function photosPanel(o){
  if (!SERVER.on || o.review) return '';
  const c = CACHE.get(o.id), list = c ? c.images : null, edit = canEdit();
  const empty = edit ? 'No photos yet: the label with its serial number, how it is cabled, where it stands. Drop pictures here or paste one.' : 'No photos yet.';
  return `<div class="panelbox ph-panel" id="phPanel"><div class="hdr">Photos <span class="cnt">${list ? list.length || 'none' : '…'}</span></div>
    <div class="ph-grid" id="phGrid">${!list ? '<p class="note lempty">Loading…</p>' : list.length
      ? list.map((p, i) => `<button type="button" class="ph-thumb" data-ph="${i}" title="${esc(label(p))}" aria-label="Open photo ${i + 1} of ${list.length}: ${esc(label(p))}"><img src="${thumbUrl(p)}" alt="" loading="lazy" decoding="async"></button>`).join('')
      : `<p class="note lempty">${empty}</p>`}</div>
    ${edit && list ? `<div class="addrel ph-add"><button type="button" id="phAdd" ${list.length >= c.max ? `disabled title="A device keeps up to ${c.max} photos"` : ''}>Add photos…</button>
      <input id="phFile" type="file" accept="image/*" multiple hidden><span class="muted" id="phMsg" role="status" aria-live="polite">${list.length ? `${list.length} of ${c.max}` : ''}</span></div>` : ''}</div>`;
}

/* Called after the device page is drawn: reads the list the first time, and wires the panel. */
export function bindPhotos(o){
  const panel = $('#phPanel'); if (!panel) return;
  openId = o.id;
  if (!CACHE.has(o.id)) { load(o); return; }
  panel.querySelectorAll('[data-ph]').forEach(b => b.onclick = () => viewer(o, Number(b.dataset.ph)));
  if (!canEdit()) return;
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
  if (!panel || !o || !canEdit() || !$('#phAdd') || $('#mdl') || e.target.closest('input, textarea, [contenteditable]')) return;
  const files = [...(e.clipboardData ? e.clipboardData.files : [])].filter(f => /^image\//.test(f.type));
  if (files.length) { e.preventDefault(); add(o, files); }
});
/* The device the panel on the page is for. */
let openId = null;

/* Only the panel's count, previews and Add row are drawn again: its title (open or closed, like every panel) stays. */
function redraw(o){
  const panel = $('#phPanel');
  if (!panel || openId !== o.id) return;
  const t = document.createElement('div'); t.innerHTML = photosPanel(o);
  const next = t.firstElementChild; if (!next) return;
  const cnt = panel.querySelector('.hdr .cnt'), cnt2 = next.querySelector('.hdr .cnt');
  if (cnt && cnt2) cnt.textContent = cnt2.textContent;
  [...panel.children].filter(x => !x.classList.contains('hdr')).forEach(x => x.remove());
  panel.append(...[...next.children].filter(x => !x.classList.contains('hdr')));
  bindPhotos(o);
}
async function load(o){
  const r = await fetch(`api/objects/${encodeURIComponent(o.id)}/images`, { credentials: 'same-origin' }).catch(() => null);
  const j = r && r.ok ? await r.json().catch(() => null) : null;
  /* A device not saved yet (just made) has none on the server: an empty list, filled once it is saved. */
  CACHE.set(o.id, j ? { images: j.images || [], max: j.max || 30 } : { images: [], max: 30 });
  redraw(o);
}

/* A picture file, made ready to send: turned upright, at most LONG_SIDE pixels, without its metadata, and a preview. */
async function prepare(file){
  if (file.size > MAX_FILE) throw new Error(`${file.name} is larger than ${MAX_FILE / 1048576} MB.`);
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { throw new Error(`${file.name} cannot be read as a picture here. Save it as JPEG or PNG and add it again.`); }
  const fit = max => { const k = Math.min(1, max / Math.max(bmp.width, bmp.height)); return [Math.max(1, Math.round(bmp.width * k)), Math.max(1, Math.round(bmp.height * k))]; };
  const draw = ([w, h], type, q) => new Promise((resolve, reject) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d');
    if (type === 'image/jpeg') { x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); }   /* a transparent PNG gets a white ground, not a black one */
    x.drawImage(bmp, 0, 0, w, h);
    c.toBlob(b => b ? resolve(b) : reject(new Error(`${file.name} could not be made smaller.`)), type, q);
  });
  const size = fit(LONG_SIDE);
  /* A screenshot (PNG) stays sharp as a PNG while that is not too large; a photo becomes a JPEG. */
  let data = file.type === 'image/png' ? await draw(size, 'image/png') : null;
  if (!data || data.size > MAX_SENT) data = await draw(size, 'image/jpeg', 0.85);
  if (data.size > MAX_SENT) data = await draw(size, 'image/jpeg', 0.7);
  const thumb = await draw(fit(THUMB_SIDE), 'image/jpeg', 0.8);
  bmp.close && bmp.close();
  return { name: file.name || 'Photo', data: await base64(data), thumb: await base64(thumb), w: size[0], h: size[1] };
}
async function base64(blob){
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

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
      if (!r.ok) throw new Error(j.error || (r.status === 404 ? 'Save the device first, then add its photos.' : `The photo was not added (${r.status}).`));
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
  const list = c.images, p = list[i], edit = canEdit(), many = list.length > 1;
  modal(`<div class="mh">${esc(o.name)}: photo ${i + 1} of ${list.length}</div>
    <div class="mb ph-view">
      ${many ? `<button type="button" class="icon ph-nav ph-prev" id="phPrev" aria-label="Previous photo" title="Previous (←)">‹</button>` : ''}
      <a class="ph-big" href="${fullUrl(p)}" target="_blank" rel="noopener" title="Open in full size"><img src="${fullUrl(p)}" alt="${esc(label(p))}" width="${p.w}" height="${p.h}"></a>
      ${many ? `<button type="button" class="icon ph-nav ph-next" id="phNext" aria-label="Next photo" title="Next (→)">›</button>` : ''}
    </div>
    <div class="ph-info">${edit ? `<input id="phCaption" maxlength="200" value="${esc(p.caption || '')}" placeholder="Caption, e.g. Label on the back" aria-label="Caption of the photo">` : p.caption ? `<b>${esc(p.caption)}</b>` : ''}
      <span class="muted">Added ${esc(dateText(p.created.slice(0, 10)))}${p.by ? ` by ${esc(p.by)}` : ''} · ${p.w} × ${p.h} · ${kb(p.bytes)}</span></div>
    <div class="mf">${edit ? '<button id="phDel" class="danger-text">Remove…</button>' : ''}<span class="grow"></span><a class="btnlike" href="${fullUrl(p)}?download=1" download>Download</a><button id="phClose" class="primary">Close</button></div>`, 'wide ph-modal');
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
