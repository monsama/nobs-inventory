/* The sidebar's sections (To review, Views, Types, Locations, Status, More filters …): each folds up with a click on its
   header, and they are put in another order by dragging a header up or down, or with Alt + arrow up / down on it. The
   order and the folded ones are this browser's choice, kept in its storage; nothing is sent to the server. */
const KEY = 'ni-side-sections';
const side = /** @type {HTMLElement|null} */ (document.getElementById('side'));
const sections = () => /** @type {HTMLElement[]} */ ([...(side ? side.querySelectorAll(':scope>.sidesec') : [])]);
const headOf = sec => /** @type {HTMLElement|null} */ (sec.querySelector(':scope>.hdr, :scope>summary'));

function load(){
  try { const v = JSON.parse(localStorage.getItem(KEY) || '{}'); return { order: Array.isArray(v.order) ? v.order : [], closed: Array.isArray(v.closed) ? v.closed : [] }; }
  catch { return { order: [], closed: [] }; }
}
function save(){
  const closed = sections().filter(s => s.tagName !== 'DETAILS' && s.classList.contains('collapsed')).map(s => s.dataset.sec);
  try { localStorage.setItem(KEY, JSON.stringify({ order: sections().map(s => s.dataset.sec), closed })); } catch { /* Browser storage can be blocked: the choice is then not kept. */ }
}
/* A section folded or opened; More filters is a details element and folds by itself. */
function setOpen(sec, open){
  sec.classList.toggle('collapsed', !open);
  const t = sec.querySelector(':scope>.hdr>.sec-t'); if (t) t.setAttribute('aria-expanded', String(open));
}
/* One place up (-1) or down (+1), past sections that are not shown at the moment. */
function move(sec, dir){
  const shown = sections().filter(s => !s.hidden && headOf(s) && !headOf(s).hidden);
  const i = shown.indexOf(sec), other = shown[i + dir];
  if (!other) return;
  if (dir < 0) other.before(sec); else other.after(sec);
  save();
}

if (side){
  const { order, closed } = load();
  /* The order kept, then any section it does not know yet, where it is in the page. */
  const byName = new Map(sections().map(s => [s.dataset.sec, s]));
  const kept = order.map(n => byName.get(n)).filter(Boolean);
  if (kept.length){
    const rest = sections().filter(s => !kept.includes(s));
    [...kept, ...rest].forEach(s => side.append(s));
  }
  for (const sec of sections()){
    const h = headOf(sec); if (!h) continue;
    h.draggable = true;
    h.title = sec.tagName === 'DETAILS' ? 'Click to open or close; drag to move it up or down (Alt + arrow keys)' : 'Click to fold or open; drag to move it up or down (Alt + arrow keys)';
    /* The section's name is its fold button (a header holding Clear filters cannot be a button itself); a click anywhere
       else on the header folds it too. */
    const t = /** @type {HTMLElement|null} */ (h.querySelector('.sec-t'));
    if (sec.tagName !== 'DETAILS'){
      setOpen(sec, !closed.includes(sec.dataset.sec));
      h.addEventListener('click', e => { const b = /** @type {HTMLElement} */ (e.target).closest('button'); if (b && b !== t) return; setOpen(sec, sec.classList.contains('collapsed')); save(); });
    }
    /* Alt + arrow up / down on the name (or on More filters) moves the section. */
    (t || h).addEventListener('keydown', e => {
      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')){ e.preventDefault(); move(sec, e.key === 'ArrowUp' ? -1 : 1); (t || h).focus(); }
    });
    h.addEventListener('dragstart', e => {
      if (!e.dataTransfer) return;
      e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', sec.dataset.sec || '');
      side.classList.add('sec-dragging'); sec.classList.add('sec-moving');
    });
    h.addEventListener('dragend', () => { side.classList.remove('sec-dragging'); sec.classList.remove('sec-moving'); sections().forEach(s => s.classList.remove('drop-before', 'drop-after')); save(); });
  }
  /* While a header is dragged: the section under the pointer shows a line where it would go, above or below it. */
  side.addEventListener('dragover', e => {
    const moving = side.querySelector('.sec-moving'); if (!moving) return;
    const over = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest('.sidesec'));
    e.preventDefault();
    sections().forEach(s => s.classList.remove('drop-before', 'drop-after'));
    if (!over || over === moving) return;
    const r = over.getBoundingClientRect(), before = e.clientY < r.top + Math.min(r.height / 2, 24);
    over.classList.add(before ? 'drop-before' : 'drop-after');
  });
  side.addEventListener('drop', e => {
    const moving = side.querySelector('.sec-moving'), over = side.querySelector('.drop-before, .drop-after');
    if (!moving || !over) return;
    e.preventDefault();
    if (over.classList.contains('drop-before')) over.before(moving); else over.after(moving);
  });
}
