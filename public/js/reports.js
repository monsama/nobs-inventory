/* Reports: the inventory by site, location, department or type; the devices by when they are due for replacement; and
   what contracts, licences and new devices cost in a year. One description of each report, made here from the saved
   state; the server writes it as a PDF or an Excel file (server/report-files.js). No DOM: the server imports it. */
import { dateText } from './dates.js';
import { CONTRACT_KINDS, costInYear, yearlyCost } from './costs.js';

export const REPORTS = {
  inventory: ['Inventory', 'Every device not retired, with its user, place and warranty'],
  lifecycle: ['Lifecycle and replacement', 'Devices by when they are due for replacement, from their purchase date'],
  costs: ['Costs per year', 'Contracts, licences and the devices bought in one calendar year'],
  /* From the Stocktake view: one finished stocktake (opts.id). */
  stocktake: ['Stocktake', 'What a stocktake found: missing, moved, not in the inventory, confirmed', true],
};
export const GROUPS = { site: 'Site', loc: 'Location', dept: 'Department', type: 'Type', none: 'No grouping' };
const STATUS_LABEL = { active: 'In use', stock: 'In stock', unused: 'Not in use', repair: 'In repair', retired: 'Retired' };

/* The options a report may be asked for, made safe: unknown values fall back to the defaults. */
export function reportOptions(q = {}, today = new Date()) {
  const kind = REPORTS[q.kind] ? q.kind : 'inventory';
  const group = GROUPS[q.group] ? q.group : 'site';
  const years = Math.min(15, Math.max(1, Math.round(Number(q.years)) || 5));
  const y = Math.round(Number(q.year));
  const year = y >= 2000 && y <= 2100 ? y : today.getFullYear();
  const id = /^[\w-]{1,40}$/.test(String(q.id || '')) ? String(q.id) : '';
  return { kind, group, years, year, id };
}

const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const day = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : '';
const addYears = (d, n) => `${Number(d.slice(0, 4)) + n}${d.slice(4)}`;
const byName = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });

/* { title, subtitle, columns: [{ label, num?, money?, w }], groups: [{ name, rows: [[cell…]], total? }], total?, count }.
   A cell is text or a number; a day is written as dd.mm.yyyy. */
export function buildReport(s, opts, today = new Date()) {
  const o = reportOptions(opts, today);
  const users = new Map((s.users || []).map(u => [u.id, u]));
  const typeLabel = t => (s.types && s.types[t] && s.types[t].label) || t || '';
  const person = d => (d.uid && users.get(d.uid) && users.get(d.uid).name) || d.user || (d.hotdesk ? 'Hot desk' : '');
  const dept = d => (d.uid && users.get(d.uid) && users.get(d.uid).dept) || '';
  /* The inventory: not retired, and not waiting in To review or ignored there. */
  const live = (s.objs || []).filter(d => d.status !== 'retired' && !d.review);
  const currency = s.currency || 'CHF';
  const made = `Made on ${dateText(iso(today))}`;
  const grouped = (list, keyOf, emptyName) => {
    const m = new Map();
    for (const [k, row] of list) { const name = k || emptyName; if (!m.has(name)) m.set(name, []); m.get(name).push(row); }
    return [...m.entries()].sort(([a], [b]) => (a === emptyName) - (b === emptyName) || byName(a, b)).map(([name, rows]) => ({ name, rows }));
  };

  if (o.kind === 'inventory') {
    const keyOf = { site: d => String(d.loc || '').split(' / ')[0], loc: d => d.loc || '', dept, type: d => typeLabel(d.type), none: () => '' }[o.group];
    const rows = live.slice().sort((a, b) => byName(a.name, b.name))
      .map(d => [keyOf(d), [d.code || '', d.name || '', typeLabel(d.type), d.model || '', d.serial || '', person(d), dept(d), d.loc || '', STATUS_LABEL[d.status] || d.status || '', dateText(day(d.warranty))]]);
    return {
      title: 'Inventory', subtitle: `${live.length} devices${o.group === 'none' ? '' : `, by ${GROUPS[o.group].toLowerCase()}`} · ${made}`, count: live.length,
      columns: [{ label: 'Code', w: 1 }, { label: 'Name', w: 1.6 }, { label: 'Type', w: 1.1 }, { label: 'Model', w: 1.6 }, { label: 'Serial number', w: 1.2 },
        { label: 'User', w: 1.4 }, { label: 'Department', w: 1.1 }, { label: 'Location', w: 1.4 }, { label: 'Status', w: 0.8 }, { label: 'Warranty ends', w: 1.1 }],
      groups: o.group === 'none' ? [{ name: '', rows: rows.map(r => r[1]) }] : grouped(rows, keyOf, { site: 'No site', loc: 'No location', dept: 'No department', type: 'No type' }[o.group]),
    };
  }

  if (o.kind === 'stocktake') {
    const t = (s.stocktakes || []).find(x => x.id === o.id && x.finished && x.result);
    if (!t) return { title: 'Stocktake', subtitle: 'This stocktake is not finished, or no longer in the list.', columns: [{ label: 'Name' }], groups: [], count: 0 };
    const r = t.result, byId = new Map(live.map(d => [d.id, d]));
    const now = id => byId.get(id) || {};
    const conf = live.filter(d => d.verified && d.verified.st === t.id).sort((a, b) => byName(a.loc || '', b.loc || '') || byName(a.name, b.name));
    const cols = [{ label: 'Code', w: 1 }, { label: 'Name', w: 1.6 }, { label: 'Type', w: 1.1 }, { label: 'Serial number', w: 1.2 }, { label: 'User', w: 1.4 }, { label: 'Location', w: 1.6 }, { label: 'Note', w: 1.8 }];
    const dev = (m, note) => { const d = now(m.id); return [m.code || d.code || '', m.name || d.name || '', typeLabel(d.type), d.serial || '', person(d), m.loc || d.loc || '', note]; };
    return {
      title: t.name, count: r.total,
      subtitle: `${t.scope || 'Everywhere'} · started ${dateText(t.started.slice(0, 10))} by ${t.by || '—'}, finished ${dateText(t.finished.slice(0, 10))} by ${t.finishedBy || '—'} · ${r.confirmed} of ${r.total} confirmed, ${r.missing.length} missing, ${r.moved.length} moved, ${r.unknown.length} not in the inventory`,
      columns: cols,
      groups: [
        { name: 'Missing', rows: r.missing.map(m => dev(m, 'Not found')) },
        { name: 'Moved here', rows: r.moved.map(m => dev(m, `Was in ${m.from || 'no location'}`)) },
        { name: 'Not in the inventory', rows: r.unknown.map(u => ['', u, '', '', '', '', 'Scanned, not known']) },
        { name: 'Confirmed', rows: conf.map(d => dev(d, `Confirmed ${dateText(d.verified.at)}${d.verified.by ? ` by ${d.verified.by}` : ''}`)) },
      ].filter(g => g.rows.length),
    };
  }

  if (o.kind === 'lifecycle') {
    const now = iso(today), thisYear = String(today.getFullYear()), nextYear = String(today.getFullYear() + 1);
    const known = live.filter(d => day(d.purchased));
    const stateOf = by => by < now ? 'Overdue' : by.slice(0, 4) === thisYear ? `Due in ${thisYear}` : by.slice(0, 4) === nextYear ? `Due in ${nextYear}` : 'Later';
    const order = ['Overdue', `Due in ${thisYear}`, `Due in ${nextYear}`, 'Later'];
    const rows = known.map(d => {
      const by = addYears(d.purchased, o.years);
      const age = Math.max(0, Math.floor((Date.parse(now) - Date.parse(d.purchased)) / (365.25 * 864e5) * 10) / 10);
      return [stateOf(by), by, [d.code || '', d.name || '', typeLabel(d.type), d.model || '', person(d), d.loc || '', dateText(d.purchased), age, dateText(day(d.warranty)), dateText(by)]];
    }).sort((a, b) => a[1].localeCompare(b[1]));
    const groups = order.map(name => ({ name, rows: rows.filter(r => r[0] === name).map(r => r[2]) })).filter(g => g.rows.length);
    const unknown = live.length - known.length;
    return {
      title: 'Lifecycle and replacement', count: known.length,
      subtitle: `Replaced ${o.years} year${o.years === 1 ? '' : 's'} after purchase · ${known.length} devices with a purchase date${unknown ? `, ${unknown} without one (not listed)` : ''} · ${made}`,
      columns: [{ label: 'Code', w: 1 }, { label: 'Name', w: 1.6 }, { label: 'Type', w: 1.1 }, { label: 'Model', w: 1.6 }, { label: 'User', w: 1.4 }, { label: 'Location', w: 1.4 },
        { label: 'Purchased', w: 0.9 }, { label: 'Age (years)', w: 0.8, num: true }, { label: 'Warranty ends', w: 1.1 }, { label: 'Replace by', w: 0.9 }],
      groups,
    };
  }

  /* Costs in one calendar year: each contract and licence by the months it runs in it, and the devices bought in it. */
  const Y = String(o.year);
  const span = c => [dateText(day(c.start)), c.renew > 0 ? 'renews' : dateText(day(c.end))].filter(Boolean).join(' – ');
  const per = c => c.per === 'once' ? 'once' : c.per === 'month' ? 'per month' : 'per year';
  const contracts = (s.contracts || []).map(c => [c, costInYear(c, o.year)]).filter(([, n]) => n > 0).sort(([a], [b]) => byName(a.name, b.name))
    .map(([c, n]) => [c.name || '', CONTRACT_KINDS[c.kind] || c.kind || 'Contract', c.supplier || '', span(c), `${c.cost} ${per(c)}`, yearlyCost(c) || '', n]);
  const licences = (s.licences || []).map(l => [l, costInYear(l, o.year)]).filter(([, n]) => n > 0).sort(([a], [b]) => byName(a.name, b.name))
    .map(([l, n]) => [l.name || '', `Licence, ${l.seats || 0} seats`, '', span(l), `${l.cost} ${per(l)}`, yearlyCost(l) || '', n]);
  const bought = (s.objs || []).filter(d => !d.review && day(d.purchased).slice(0, 4) === Y && typeof d.price === 'number' && d.price > 0).sort((a, b) => a.purchased.localeCompare(b.purchased))
    .map(d => [[d.name, d.model].filter(Boolean).join(' · '), typeLabel(d.type), d.supplier || '', dateText(d.purchased), '', '', d.price]);
  const sum = rows => Math.round(rows.reduce((t, r) => t + (Number(r[6]) || 0), 0) * 100) / 100;
  const groups = [['Contracts', contracts], ['Licences', licences], ['Devices bought', bought]].filter(([, rows]) => rows.length).map(([name, rows]) => ({ name, rows, total: sum(rows) }));
  const total = Math.round(groups.reduce((t, g) => t + g.total, 0) * 100) / 100;
  return {
    title: `Costs in ${Y}`, count: contracts.length + licences.length + bought.length, currency,
    subtitle: `Contracts and licences by the months they run in ${Y}, devices by their purchase date · amounts in ${currency} · ${made}`,
    columns: [{ label: 'Name', w: 2 }, { label: 'Kind', w: 1.3 }, { label: 'Supplier', w: 1.3 }, { label: 'Runs / bought', w: 1.5 }, { label: 'Cost as agreed', w: 1.4 },
      { label: 'Per year', w: 1, money: true }, { label: `In ${Y}`, w: 1, money: true }],
    groups, total,
  };
}
