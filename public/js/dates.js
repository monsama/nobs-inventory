/* Dates as the inventory writes them: day first, the time to the minute (26.10.2026 18:03). Shared by the page and the
   server, so a date reads the same everywhere. */
export const pad2 = n => String(n).padStart(2, '0');
/* A moment as "dd.mm.yyyy hh:mm", the form history lines and sync stamps are kept in. */
export const stamp = d => `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
const dateOf = v => { const d = v instanceof Date ? v : v ? new Date(v) : null; return d && !isNaN(d) ? d : null; };
/* A date and time for people, from a Date or anything new Date() reads (an ISO time); '' when there is none. */
export const dateTimeText = v => { const d = dateOf(v); return d ? stamp(d) : ''; };
/* A day for people, "dd.mm.yyyy"; '' when there is none. */
export const dateText = v => { const d = dateOf(v); return d ? `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}` : ''; };
/* The moment a stamp ("dd.mm.yyyy hh:mm") stands for, in milliseconds; 0 when it is not one. */
export const stampTime = s => { const m = /^(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2})$/.exec(s || ''); return m ? new Date(+m[3], m[2] - 1, +m[1], +m[4], +m[5]).getTime() : 0; };
