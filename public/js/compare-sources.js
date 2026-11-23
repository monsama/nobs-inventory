/* Sources disagree, side by side: every field where Lansweeper, Entra & Intune and Active Directory give a device
   different values, grouped by field. Each row shows what each source says, the value in use marked, the others
   highlighted; a click fixes the field to that source's value (srcpick.js applyPick, as the picker beside a field does).
   For a field, one source can be taken for all the devices listed at once. Every pick can be undone. */
import { $, SRC_ICON, byId, filtered, restoreSnapshot, snapshot, sourceOf, sourcesDisagree, toastUndo } from './01-core.js';
import { FIELD_LABEL } from './01-core.js';
import { closeModal, modal } from './19-modal.js';
import { render } from './07-render.js';
import { html, rawHtml } from './html.js';
import { NAMES, applyPick, choicesOf } from './srcpick.js';
import { isAdmin } from './04-settings.js';
import { openObj } from './02-views.js';

const LABELS = { ...FIELD_LABEL, purpose: 'Description', serial: 'Serial number', loc: 'Location' };
const box0 = () => /** @type {HTMLElement} */ ($('#mdl'));
const icon = src => `<svg viewBox="0 0 24 24" aria-hidden="true">${SRC_ICON[src] || ''}</svg>`;

/* The fields where the sources differ, each with its devices (of those given): [[field, [device…]]…], the most first. */
export function disagreements(list){
  const by = new Map();
  for (const o of list) for (const k of Object.keys(o.vals || {})) if (sourcesDisagree(o, k)) { const l = by.get(k) || []; l.push(o); by.set(k, l); }
  return [...by.entries()].sort((a, b) => b[1].length - a[1].length || (LABELS[a[0]] || a[0]).localeCompare(LABELS[b[0]] || b[0]));
}

/* The dialog, for the devices shown (the list's filters apply). */
export function compareSourcesModal(ids = filtered().map(o => o.id)){
  /* This dialog's own mark: an Undo from an earlier one does not draw over another opened since. */
  const token = String(Date.now()) + Math.random();
  const mine = () => !!$(`#mdl [data-cmpdlg="${token}"]`);
  const draw = () => {
    /* Drawn again after a pick: where the list was scrolled to and the next value stay. */
    const mb0 = /** @type {HTMLElement|null} */ ($('#mdl [data-cmpdlg]')), top = mb0 ? mb0.scrollTop : 0;
    const list = ids.map(byId).filter(Boolean), groups = disagreements(list), ed = isAdmin();
    const n = groups.reduce((t, [, l]) => t + l.length, 0);
    const body = !groups.length ? html`<p class="muted">The sources agree on every device listed now.</p>` : groups.map(([k, devs]) => {
      /* The sources that have a value for this field on any of these devices, in the usual order. */
      const srcs = [...new Set(devs.flatMap(o => choicesOf(o, k).map(c => c.src)))];
      return html`<section class="cmp-group" data-cmpk="${k}"><div class="cmp-head"><b>${LABELS[k] || k}</b><span class="muted">${devs.length} ${devs.length === 1 ? 'device' : 'devices'}</span><span class="grow"></span>
        ${ed ? srcs.filter(s => s !== 'unknown').map(s => html`<button type="button" class="mini" data-cmpall="${k}|${s}" title="${`Fix ${LABELS[k] || k} to ${NAMES[s]}'s value on each of these devices that has one`}">Use ${NAMES[s]} for all</button>`) : ''}</div>
        <div class="cmp-rows">${devs.map(o => {
          const cur = String(o[k] ?? ''), inUse = sourceOf(o, k);
          return html`<div class="cmp-row"><button type="button" class="link cmp-dev" data-cmpopen="${o.id}" title="Open ${o.name}">${o.name}</button><span class="cmp-vals">${choicesOf(o, k).map(c => {
            const on = c.value === cur && (c.src === inUse || c.src === 'unknown');
            return html`<button type="button" class="cmp-val${on ? ' cur' : ' diff'}" data-cmp="${o.id}|${k}|${c.src}" ${ed ? '' : 'disabled'} title="${on ? `${NAMES[c.src]}: in use` : `${NAMES[c.src]}: use this value`}"><span class="cmp-ico">${rawHtml(icon(c.src))}</span><span class="cmp-src">${NAMES[c.src]}</span><span class="cmp-v">${c.value || '(empty)'}</span>${on ? html`<span class="cmp-tick" aria-hidden="true">✓</span>` : ''}</button>`;
          })}</span></div>`;
        })}</div></section>`;
    });
    modal(html`<div class="mh">Sources disagree</div>
      <div class="mb" data-cmpdlg="${token}"><p class="note">${groups.length ? `${n} ${n === 1 ? 'value differs' : 'values differ'} between the sources. The one in use is ticked; pick another to fix the field to that source (the syncs then keep it). Undo in the message after each pick.` : ''}</p>${body}</div>
      <div class="mf"><button type="button" id="cmpClose">Close</button></div>`, 'wide');
    $('#cmpClose').onclick = closeModal;
    const mb = /** @type {HTMLElement|null} */ ($('#mdl [data-cmpdlg]'));
    if (mb && top) { mb.scrollTop = top; const next = /** @type {HTMLElement|null} */ ([...mb.querySelectorAll('.cmp-val.diff')].find(b => b.getBoundingClientRect().top >= mb.getBoundingClientRect().top)); if (next) next.focus({ preventScroll: true }); }
    /** @type {NodeListOf<HTMLElement>} */ (box0().querySelectorAll('[data-cmpopen]')).forEach(b => b.onclick = () => { closeModal(); openObj(b.dataset.cmpopen); });
    const box = box0();
    /** @type {NodeListOf<HTMLElement>} */ (box.querySelectorAll('[data-cmp]')).forEach(b => b.onclick = () => {
      const [id, k, src] = b.dataset.cmp.split('|'), o = byId(id); if (!o) return;
      const snap = snapshot([o]);
      applyPick(o, k, src);
      render(); draw();
      toastUndo(`${o.name}: ${LABELS[k] || k} from ${NAMES[src]}`, () => { restoreSnapshot(snap, 'Pick undone'); render(); if (mine()) draw(); });
    });
    /** @type {NodeListOf<HTMLElement>} */ (box.querySelectorAll('[data-cmpall]')).forEach(b => b.onclick = () => {
      const [k, src] = b.dataset.cmpall.split('|');
      const devs = ((groups.find(([f]) => f === k) || [])[1] || []).filter(o => choicesOf(o, k).some(c => c.src === src));
      const snap = snapshot(devs);
      for (const o of devs) applyPick(o, k, src);
      render(); draw();
      toastUndo(`${LABELS[k] || k} from ${NAMES[src]} on ${devs.length} ${devs.length === 1 ? 'device' : 'devices'}`, () => { restoreSnapshot(snap, 'Picks undone'); render(); if (mine()) draw(); });
    });
  };
  draw();
}
