/* Contracts and software licences, shared by the server (which checks what it saves) and the page (which shows the
   dates and counts). No browser code here. */
export const CONTRACT_KINDS = { maintenance: 'Maintenance', support: 'Support', lease: 'Lease', subscription: 'Subscription', licence: 'Licence', warranty: 'Extended warranty', other: 'Other' };
export const PERIODS = { year: 'per year', month: 'per month', once: 'once' };
/* A notice to give, or a contract that ends, within this many days is marked. */
export const NOTICE_SOON_DAYS = 60;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const isDay = v => typeof v === 'string' && DAY.test(v) && !isNaN(new Date(v + 'T00:00:00Z'));
const text = (v, max) => v === undefined || (typeof v === 'string' && v.length <= max);
const count = (v, max) => v === undefined || (Number.isInteger(v) && v >= 0 && v <= max);
const money = v => v === undefined || v === null || (typeof v === 'number' && isFinite(v) && v >= 0 && v <= 1e9);

/* Returns the first problem with a contract, or null. */
export function contractProblem(c){
  if (!c || typeof c !== 'object' || Array.isArray(c)) return 'A contract is a record.';
  if (typeof c.id !== 'string' || !c.id || c.id.length > 40) return 'A contract needs an id.';
  if (typeof c.name !== 'string' || !c.name.trim() || c.name.length > 120) return 'A contract needs a name of up to 120 characters.';
  if (!CONTRACT_KINDS[c.kind]) return `${c.name}: the kind is one of ${Object.values(CONTRACT_KINDS).join(', ')}.`;
  if (!text(c.supplier, 120) || !text(c.ref, 60) || !text(c.note, 1000)) return `${c.name}: the supplier, the contract number or the note is too long.`;
  for (const k of ['start', 'end']) if (c[k] !== undefined && c[k] !== '' && !isDay(c[k])) return `${c.name}: the ${k} is a date.`;
  if (c.start && c.end && c.end < c.start) return `${c.name}: it ends before it starts.`;
  if (!count(c.notice, 36)) return `${c.name}: the notice period is 0 to 36 months.`;
  if (!count(c.renew, 60)) return `${c.name}: the renewal term is 0 to 60 months.`;
  if (!money(c.cost)) return `${c.name}: the cost is a number of 0 or more.`;
  if (c.per !== undefined && !PERIODS[c.per]) return `${c.name}: the cost is per year, per month or once.`;
  if (c.devices !== undefined && (!Array.isArray(c.devices) || c.devices.length > 10000 || !c.devices.every(d => typeof d === 'string' && d.length <= 60))) return `${c.name}: the devices are a list of device ids.`;
  return null;
}
export function licenceProblem(l){
  if (!l || typeof l !== 'object' || Array.isArray(l)) return 'A licence is a record.';
  if (typeof l.id !== 'string' || !l.id || l.id.length > 40) return 'A licence needs an id.';
  if (typeof l.name !== 'string' || !l.name.trim() || l.name.length > 120) return 'A licence needs the software name it counts, up to 120 characters.';
  if (!Number.isInteger(l.seats) || l.seats < 0 || l.seats > 1000000) return `${l.name}: the seats are a whole number of 0 or more.`;
  if (!money(l.cost)) return `${l.name}: the cost is a number of 0 or more.`;
  if (l.per !== undefined && !PERIODS[l.per]) return `${l.name}: the cost is per year, per month or once.`;
  if (l.end !== undefined && l.end !== '' && !isDay(l.end)) return `${l.name}: the end is a date.`;
  if (!text(l.note, 1000) || !text(l.contract, 40)) return `${l.name}: the note is too long.`;
  return null;
}
/* The whole list: each record right, and no id twice. */
export function listProblem(list, check, what){
  if (!Array.isArray(list)) return `The ${what} must be a list.`;
  const ids = new Set();
  for (const x of list){
    const p = check(x); if (p) return p;
    if (ids.has(x.id)) return `The ${what} list has the id ${x.id} twice.`;
    ids.add(x.id);
  }
  return null;
}

const iso = d => d.toISOString().slice(0, 10);
const addMonths = (day, n) => { const d = new Date(day + 'T00:00:00Z'); const m = d.getUTCMonth() + n, want = ((m % 12) + 12) % 12; d.setUTCMonth(m); if (d.getUTCMonth() !== want) d.setUTCDate(0); return iso(d); };
const daysTo = (day, today) => Math.round((new Date(day + 'T00:00:00Z') - new Date(iso(today) + 'T00:00:00Z')) / 86400000);

/* Where a contract stands today. A contract that renews by itself runs on in terms of `renew` months: its end is the end
   of the current term, and the notice is due `notice` months before it. One that does not renew ends on its end date.
   state: 'open' (no end), 'ok', 'soon' (notice due, or it ends, within NOTICE_SOON_DAYS), 'late' (the notice date has
   passed: it renews), 'ended'. */
export function contractStatus(c, today = new Date()){
  if (!c.end) return { state: 'open', end: '', noticeBy: '', days: null };
  let end = c.end;
  const t = iso(today);
  /* Each term is counted from the first end date, so a term ending on the 31st does not drift to the 28th. */
  if (c.renew > 0) for (let k = 1; end < t && k < 1000; k++) end = addMonths(c.end, k * c.renew);
  const noticeBy = c.notice > 0 ? addMonths(end, -c.notice) : end;
  if (!(c.renew > 0)){
    const d = daysTo(end, today);
    return { state: d < 0 ? 'ended' : d <= NOTICE_SOON_DAYS ? 'soon' : 'ok', end, noticeBy: '', days: d };
  }
  const d = daysTo(noticeBy, today);
  return { state: d < 0 ? 'late' : d <= NOTICE_SOON_DAYS ? 'soon' : 'ok', end, noticeBy, days: d };
}
/* Running now: started (or no start given) and not ended. A contract signed for next year costs nothing yet. */
export const runningNow = (c, today = new Date()) => contractStatus(c, today).state !== 'ended' && !(c.start && c.start > iso(today));
/* The cost of a year: a monthly cost times twelve; a one-off cost is not a yearly one. */
export const yearlyCost = c => !(c.cost > 0) ? 0 : c.per === 'month' ? c.cost * 12 : c.per === 'once' ? 0 : c.cost;
/* What a contract costs in one calendar year: each month it runs in that year at a twelfth of its yearly cost (a month
   it starts or ends in counts whole), and a one-off cost in the year it starts. A contract that renews by itself is
   counted as running on; one that does not, up to its end. */
export function costInYear(c, year){
  if (!(c.cost > 0)) return 0;
  const y = String(year);
  if (c.per === 'once') return (c.start || c.end || '').slice(0, 4) === y ? c.cost : 0;
  const last = c.renew > 0 ? '' : (c.end || '');
  let months = 0;
  for (let m = 1; m <= 12; m++){
    const from = `${y}-${String(m).padStart(2, '0')}-01`, to = `${y}-${String(m).padStart(2, '0')}-31`;
    if ((!c.start || c.start <= to) && (!last || last >= from)) months++;
  }
  return Math.round(yearlyCost(c) * months / 12 * 100) / 100;
}

/* The devices a licence counts: those not retired with a package whose name holds the licence's name. */
export function licenceUse(l, objs){
  const q = String(l.name || '').trim().toLowerCase();
  const devices = q ? objs.filter(o => o.status !== 'retired' && (o.software || []).some(p => String(p.name || '').toLowerCase().includes(q))) : [];
  return { used: devices.length, free: l.seats - devices.length, over: devices.length > l.seats, devices };
}
