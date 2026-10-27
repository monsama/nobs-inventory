/* Pins that cover each other on a floor plan become one group marker: the number of devices, their kinds, and a dot when
   one of them needs attention. Which pins are grouped follows the screen, not the data: zoom in and a group falls apart
   into its pins again. Clicking a group fans up to FAN_MAX pins out around it, each to be opened or dragged on as usual;
   a bigger group opens a list instead, from which a device is opened, or dragged to another place on the plan. */
import { byId, esc, filtered, scanOld, st, tico, TYPES, warrantyState } from './01-core.js';
import { openObj } from './02-views.js';

export const FAN_MAX = 8;
const GAP = 2;   /* pins closer than this many pixels count as touching */
let open = null;   /* the group shown fanned out or as a list: {marker, pins, list} */
let observer = null, frame = 0;

/* A device that needs looking at: Lansweeper flags it for a check by hand, or its warranty has ended. */
const needsAttention = o => scanOld(o) || warrantyState(o) === 'ended';

/* Groups the pins of the plan's canvas, and groups them again whenever the canvas changes size (zoom, window, the
   picture loading). startDrag(id, event, label) starts dragging a device out of a group's list. */
export function groupPins(c, startDrag){
  if (observer) observer.disconnect();
  observer = new ResizeObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => regroup(c, startDrag)); });
  observer.observe(c);
  regroup(c, startDrag);
}

/* Closes a fanned-out group or a group's list. Says whether one was open, so the click that closed it does nothing else. */
export function closeGroup(){
  if (!open) return false;
  open.pins.forEach(p => { p.classList.remove('fanned'); p.classList.add('grouped'); p.style.left = p.dataset.homeX; p.style.top = p.dataset.homeY; });
  if (open.list) open.list.remove();
  if (open.ring) open.ring.remove();
  open.marker.classList.remove('open'); open.marker.setAttribute('aria-expanded', 'false');
  if (open.marker.dataset.homeX){ open.marker.style.left = open.marker.dataset.homeX; open.marker.style.top = open.marker.dataset.homeY; }
  open = null;
  return true;
}

function regroup(c, startDrag){
  if (!c.isConnected) { observer && observer.disconnect(); return; }
  open = null;
  c.querySelectorAll('.pl-group,.pl-glist,.pl-fanring').forEach(el => el.remove());
  const pins = [...c.querySelectorAll('.pl-pin')];
  pins.forEach(p => { p.classList.remove('grouped', 'fanned'); delete p.dataset.homeX; delete p.dataset.homeY; });
  const cr = c.getBoundingClientRect();
  if (!cr.width || !cr.height) return;
  spread(pins, cr);
  const boxes = pins.map(p => p.getBoundingClientRect());
  /* Pins that touch, directly or through another, are one group. */
  const up = pins.map((_, i) => i), root = i => up[i] === i ? i : (up[i] = root(up[i]));
  const touch = (a, b) => a.left < b.right + GAP && b.left < a.right + GAP && a.top < b.bottom + GAP && b.top < a.bottom + GAP;
  for (let i = 0; i < pins.length; i++) for (let j = i + 1; j < pins.length; j++) if (touch(boxes[i], boxes[j])) up[root(i)] = root(j);
  const groups = new Map();
  pins.forEach((p, i) => { const r = root(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(i); });
  const hits = st.q ? new Set(filtered().map(o => o.id)) : null;
  pins.forEach(p => p.classList.toggle('hit', !!hits && hits.has(p.dataset.pin)));
  for (const idx of groups.values()) {
    if (idx.length < 2) continue;
    const members = idx.map(i => pins[i]), devs = members.map(p => byId(p.dataset.pin)).filter(Boolean);
    /* The marker sits where its pins are on average, in the canvas's own percentages, so it moves with zoom. */
    const x = idx.reduce((s, i) => s + (boxes[i].left + boxes[i].width / 2 - cr.left), 0) / idx.length / cr.width * 100;
    const y = idx.reduce((s, i) => s + (boxes[i].top + boxes[i].height / 2 - cr.top), 0) / idx.length / cr.height * 100;
    members.forEach(p => { p.dataset.homeX = p.style.left; p.dataset.homeY = p.style.top; p.classList.add('grouped'); });
    const kinds = [...new Set(devs.map(o => o.type))];
    const names = devs.map(o => o.name).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const m = document.createElement('button');
    m.type = 'button';
    m.className = 'pl-group' + (devs.some(needsAttention) ? ' attn' : '') + (hits && devs.some(o => hits.has(o.id)) ? ' hit' : '');
    m.style.left = x + '%'; m.style.top = y + '%'; m.dataset.homeX = m.style.left; m.dataset.homeY = m.style.top;
    m.setAttribute('aria-expanded', 'false');
    m.setAttribute('aria-label', `${devs.length} devices: ${names.join(', ')}`);
    m.title = names.slice(0, 12).join('\n') + (names.length > 12 ? `\nand ${names.length - 12} more` : '') + '\n\nClick to show them. Zoom in to see them apart.';
    m.innerHTML = `<b>${devs.length}</b>${kinds.slice(0, 3).map(t => tico(t, 'tico sm')).join('')}${kinds.length > 3 ? '<span class="muted">…</span>' : ''}${devs.some(needsAttention) ? '<span class="pl-gdot" aria-hidden="true"></span>' : ''}`;
    m.onpointerdown = e => e.stopPropagation();
    m.onclick = e => { e.stopPropagation(); const was = open && open.marker === m; closeGroup(); if (!was) (members.length <= FAN_MAX ? fan(c, m, members) : list(c, m, members, devs, startDrag)); };
    c.appendChild(m);
  }
}

/* The devices shown because they are in an area's room, spread over the area in a grid as wide as the area has room
   for in pixels (so zooming in makes room), in code order; the top is kept clear for the area's name. */
function spread(pins, cr){
  const byBox = new Map();
  for (const p of pins) if (p.dataset.box) { if (!byBox.has(p.dataset.box)) byBox.set(p.dataset.box, []); byBox.get(p.dataset.box).push(p); }
  for (const [key, list] of byBox) {
    const [x, y, w, h] = key.split(',').map(Number), n = list.length;
    const pw = Math.max(...list.map(p => p.offsetWidth)) + 10, ph = Math.max(...list.map(p => p.offsetHeight)) + 8;
    const top = y + Math.min(h * 0.25, 26 / cr.height * 100), hh = y + h - top;
    const fit = Math.max(1, Math.floor(w / 100 * cr.width / pw));
    /* About as many columns as rows by pixels, counted in pins, but never more than fit side by side. */
    const square = Math.ceil(Math.sqrt(n * (w * cr.width) / Math.max(hh * cr.height, 1) * ph / pw));
    const cols = Math.max(1, Math.min(n, fit, square));
    const rows = Math.ceil(n / cols);
    list.sort((a, b) => (a.querySelector('.pl-code') || a).textContent.localeCompare((b.querySelector('.pl-code') || b).textContent, undefined, { numeric: true }))
      .forEach((p, i) => {
        p.style.left = (n === 1 ? x + w / 2 : x + w * (i % cols + 0.5) / cols) + '%';
        p.style.top = (n === 1 ? y + h / 2 : top + hh * (Math.floor(i / cols) + 0.5) / rows) + '%';
      });
  }
}

/* The group's pins around it on an oval: pins are wide and low, so it is wider than high, far enough out that they do
   not cover each other or the marker. The oval is moved in so every pin stays on the plan. */
function fan(c, m, members){
  members.forEach(p => { p.classList.remove('grouped'); p.classList.add('fanned'); });   /* shown first: a hidden pin has no size */
  const cr = c.getBoundingClientRect(), mr = m.getBoundingClientRect();
  const sizes = members.map(p => p.getBoundingClientRect()), w = Math.max(...sizes.map(r => r.width)), h = Math.max(...sizes.map(r => r.height));
  const n = members.length, step = 2 * Math.PI / n;
  /* Neighbours on the oval are at least a pin's height apart up and down, and a pin's width apart sideways. */
  const ry = Math.max(h + mr.height / 2 + 6, n > 2 ? (h + 8) / (2 * Math.sin(step / 2)) * 0.75 : 0);
  const rx = Math.max(w / 2 + mr.width / 2 + 12, ry * 1.6, n > 2 ? (w + 8) / (2 * Math.sin(step / 2)) * 0.6 : 0);
  const cx = Math.min(Math.max(mr.left + mr.width / 2 - cr.left, rx + w / 2), cr.width - rx - w / 2);
  const cy = Math.min(Math.max(mr.top + mr.height / 2 - cr.top, ry + h / 2), cr.height - ry - h / 2);
  const ring = document.createElement('div');
  ring.className = 'pl-fanring';
  Object.assign(ring.style, { left: cx / cr.width * 100 + '%', top: cy / cr.height * 100 + '%', width: rx * 2 + 'px', height: ry * 2 + 'px' });
  c.insertBefore(ring, m);
  m.style.left = cx / cr.width * 100 + '%'; m.style.top = cy / cr.height * 100 + '%';
  members.forEach((p, i) => {
    const a = -Math.PI / 2 + i * step;
    p.style.left = (cx + Math.cos(a) * rx) / cr.width * 100 + '%';
    p.style.top = (cy + Math.sin(a) * ry) / cr.height * 100 + '%';
    p.classList.remove('grouped'); p.classList.add('fanned');
  });
  m.classList.add('open'); m.setAttribute('aria-expanded', 'true');
  open = { marker: m, pins: members, ring };
  members[0].focus({ preventScroll: true });
}

/* A list of a big group's devices beside its marker: click one to open it, or drag it to another place on the plan. */
function list(c, m, members, devs, startDrag){
  const box = document.createElement('div');
  box.className = 'pl-glist';
  box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', `${devs.length} devices`);
  box.style.left = m.style.left; box.style.top = m.style.top;
  const sorted = [...devs].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  box.innerHTML = `<div class="pl-ghead">${devs.length} devices here <span class="muted">· click to open, drag to move</span></div>
    ${sorted.map(o => `<button type="button" class="pl-grow${needsAttention(o) ? ' attn' : ''}" data-gopen="${esc(o.id)}">${tico(o.type, 'tico sm')}<span class="pl-gn">${esc(o.name)}</span><span class="muted mono">${esc(o.code || '')}</span><span class="muted">${esc(TYPES[o.type] ? TYPES[o.type].short : '')}</span></button>`).join('')}`;
  let dragged = false;
  box.onpointerdown = e => {
    e.stopPropagation();
    const b = e.target.closest('[data-gopen]'); if (!b || e.button !== 0) return;
    dragged = false;
    startDrag(b.dataset.gopen, e, b.querySelector('.pl-gn').textContent, () => { dragged = true; closeGroup(); });
  };
  box.onclick = e => { e.stopPropagation(); const b = e.target.closest('[data-gopen]'); if (!b || dragged) return; closeGroup(); openObj(b.dataset.gopen); };
  c.appendChild(box);
  /* Below the marker when there is room, else above it; never past the plan's sides. */
  const cr = c.getBoundingClientRect(), mr = m.getBoundingClientRect(), br = box.getBoundingClientRect();
  const view = c.closest('.pl-stage') ? c.closest('.pl-stage').getBoundingClientRect() : cr;
  const below = Math.min(cr.bottom, view.bottom) - mr.bottom - 26, above = mr.top - Math.max(cr.top, view.top) - 26;
  if (br.height > below && above > below) box.classList.add('up');
  box.style.maxHeight = Math.max(140, Math.min(300, Math.max(below, above))) + 'px';
  const left = Math.min(Math.max(mr.left + mr.width / 2 - br.width / 2, cr.left + 4), cr.right - br.width - 4);
  box.style.left = (left - cr.left + br.width / 2) / cr.width * 100 + '%';
  m.classList.add('open'); m.setAttribute('aria-expanded', 'true');
  open = { marker: m, pins: members, list: box };
  const first = box.querySelector('[data-gopen]'); if (first) first.focus({ preventScroll: true });
}

document.addEventListener('keydown', e => { if (e.key === 'Escape' && open){ const m = open.marker; closeGroup(); m.focus({ preventScroll: true }); } });
