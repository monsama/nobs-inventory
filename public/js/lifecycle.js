/* Replacement planning: when each device is due for replacement, and what that costs per year. A device is due its
   type's lifetime after it was bought; without a purchase date, when its warranty ends. Lifetimes and prices per type
   are set on the Overview (setting lifecycle: { type: { years, price } }); the defaults are common lifetimes, without
   prices. Types without a lifetime (virtual machines, patch panels, racks) are not planned. Shared by the page and the
   server's checks. No DOM. */
export const LIFE_DEFAULT = { pc: 5, notebook: 4, server: 6, accesspoint: 6, sip: 7, pbx: 8, monitor: 7, switch: 8, printer: 6, router: 7, firewall: 6,
  modem: 6, storage: 6, android: 3, ios: 3, mobile: 3, plc: 12, camera: 7, bmc: 0, vm: 0, patch: 0, rack: 0, other: 0 };
export const lifeOf = (life, type) => {
  const set = life && life[type];
  const years = set && Number.isInteger(set.years) ? set.years : LIFE_DEFAULT[type] || 0;
  return { years, price: set && typeof set.price === 'number' ? set.price : 0 };
};
const yearOf = v => { const m = /^(\d{4})(-\d{2}(-\d{2})?)?$/.exec(String(v || '')); return m ? Number(m[1]) : null; };
/* The year a device is due: { year, from: 'purchase' | 'warranty' }, or null (no lifetime, or no date to go by). */
export function dueOf(o, life) {
  const { years } = lifeOf(life, o.type);
  if (!years) return null;
  const bought = yearOf(o.purchased);
  if (bought) return { year: bought + years, from: 'purchase' };
  const w = yearOf(o.warranty);
  return w ? { year: w, from: 'warranty' } : null;
}
/* The plan from thisYear on: overdue (before thisYear), each of the next span years, and how many could not be planned. */
export function replacementPlan(objs, life, thisYear, span = 5) {
  const live = (objs || []).filter(o => !o.review && o.status !== 'retired');
  const rows = [{ key: 'overdue', label: 'Overdue', ids: [], cost: 0, sites: {} },
    ...Array.from({ length: span }, (_, i) => ({ key: String(thisYear + i), label: String(thisYear + i), ids: [], cost: 0, sites: {} }))];
  let unknown = 0, planned = 0;
  for (const o of live) {
    if (!lifeOf(life, o.type).years) continue;
    const d = dueOf(o, life);
    if (!d) { unknown++; continue; }
    planned++;
    const row = d.year < thisYear ? rows[0] : rows[d.year - thisYear + 1];
    if (!row) continue;
    row.ids.push(o.id); row.cost += lifeOf(life, o.type).price;
    const site = String(o.loc || '').split(' / ')[0] || 'No location';
    row.sites[site] = (row.sites[site] || 0) + 1;
  }
  return { rows, unknown, planned, priced: Object.values(life || {}).some(x => x && x.price > 0) };
}
export function lifecycleProblem(v) {
  if (v === undefined || v === null) return '';
  if (typeof v !== 'object' || Array.isArray(v) || Object.keys(v).length > 100) return 'Lifetimes are set per device type.';
  for (const [k, x] of Object.entries(v)) {
    if (k.length > 40 || !x || typeof x !== 'object') return 'Lifetimes are set per device type.';
    if (x.years !== undefined && !(Number.isInteger(x.years) && x.years >= 0 && x.years <= 40)) return 'A lifetime is a number of years, up to 40.';
    if (x.price !== undefined && !(typeof x.price === 'number' && x.price >= 0 && x.price < 1e9)) return 'A replacement price is a number.';
  }
  return '';
}
