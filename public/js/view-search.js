/* The search field of a list of its own (Software, Contracts, Contacts): it filters as you type, word by word (every word
   must be found, in any of the record's fields, accents and case ignored), Esc clears it, and it is the same search as
   the one at the top, so a search made there shows here too. The match is marked in the names. */
import { $, st } from './01-core.js';
import { html, rawHtml } from './html.js';

/** Lower case without accents: "Zürich" and "zurich" are the same. */
export const fold = v => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** @param {string} q */
export const qWords = q => fold(q).split(/\s+/).filter(Boolean);
/** Whether every word of the search is in one of the texts. @param {unknown[]} texts @param {string[]} words */
export const matchWords = (texts, words) => { if (!words.length) return true; const hay = texts.map(fold).join('\n'); return words.every(w => hay.includes(w)); };
/** The text with the words of the search marked. @param {string} text @param {string[]} words */
export function markHtml(text, words){
  const t = String(text ?? '');
  if (!words.length || !t) return html`${t}`;
  const f = fold(t), hits = new Array(t.length).fill(false);
  /* fold() keeps one character per character for the scripts used here, so the places line up. */
  if (f.length === t.length) for (const w of words) { let i = f.indexOf(w); while (i >= 0) { for (let k = i; k < i + w.length; k++) hits[k] = true; i = f.indexOf(w, i + w.length); } }
  let out = '', on = false, run = '';
  const flush = () => { if (run) out += on ? String(html`<mark>${run}</mark>`) : String(html`${run}`); run = ''; };
  for (let i = 0; i < t.length; i++){ if (hits[i] !== on){ flush(); on = hits[i]; } run += t[i]; }
  flush();
  return rawHtml(out);
}
/** The field, for the toolbar. @param {string} placeholder @param {string} label */
export const viewSearchHtml = (placeholder, label) => html`<span class="vsearch"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4"/></svg><input id="vq" type="search" autocomplete="off" spellcheck="false" placeholder="${placeholder}" aria-label="${label}" value="${st.q || ''}"></span>`;
let timer = 0;
/** Wires the field: it sets the search, keeps the one at the top in step, and draws the list again, the focus kept.
    @param {() => void} redraw */
export function bindViewSearch(redraw){
  const box = /** @type {HTMLInputElement|null} */ ($('#vq'));
  if (!box) return;
  const top = /** @type {HTMLInputElement|null} */ ($('#search'));
  clearTimeout(timer);
  const go = () => {
    /* A list drawn again, or another tab opened, since the typing: this field is gone and the search is the new one's. */
    if (!box.isConnected) return;
    const at = box.selectionStart;
    st.q = box.value; if (top) top.value = box.value;
    redraw();
    const again = /** @type {HTMLInputElement|null} */ ($('#vq'));
    if (again && document.activeElement !== again){ again.focus(); if (at != null) again.setSelectionRange(at, at); }
  };
  box.addEventListener('input', () => { clearTimeout(timer); timer = window.setTimeout(go, 120); });
  box.addEventListener('keydown', e => {
    if (e.key === 'Escape' && box.value){ e.preventDefault(); e.stopPropagation(); box.value = ''; clearTimeout(timer); go(); }
    else if (e.key === 'Enter'){ clearTimeout(timer); go(); }
  });
}
