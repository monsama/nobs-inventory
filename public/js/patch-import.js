/* A patch list from a CSV file: panel, port, outlet, room, switch and switch port per row. Which column is which, what
   each row would do and what is wrong with it, and the changes to make. Pure functions, shared by the page and the tests. */
import { normHead } from './device-import.js';
import { OUTLET_NAME_MAX, allOutlets, cordOf, cordTarget, outletOf, panelPortNo, swPortProblem, toPanelPort } from './cabling.js';

export const PATCH_FIELDS = {
  panel: { label: 'Panel', heads: ['panel', 'patchpanel', 'pp', 'panelname'] },
  port: { label: 'Panel port', heads: ['port', 'panelport', 'ppport', 'patchport', 'patchpanelport'] },
  outlet: { label: 'Outlet', heads: ['outlet', 'walloutlet', 'socket', 'datasocket', 'outletname', 'jack', 'dose'] },
  room: { label: 'Room', heads: ['room', 'location', 'loc', 'place', 'office'] },
  switch: { label: 'Switch', heads: ['switch', 'sw', 'switchname', 'device'] },
  swport: { label: 'Switch port', heads: ['switchport', 'swport', 'swportno', 'switchportno', 'portonswitch', 'interface'] },
};

/* Which field each column fills ('' for none), by its heading. Each field comes from one column. */
export function guessPatchMapping(headers) {
  const used = new Set();
  return headers.map(h => {
    const n = normHead(h);
    const f = Object.keys(PATCH_FIELDS).find(k => !used.has(k) && PATCH_FIELDS[k].heads.includes(n)) || '';
    if (f) used.add(f);
    return f;
  });
}

const low = v => String(v ?? '').trim().toLowerCase();
/* A switch port as written: 12, "1/12", "Gi1/0/12" (the switch's naming taken off), or the last number. */
export function swPortOf(sw, v) {
  const t = String(v ?? '').trim();
  if (!t) return null;
  if (/^\d+$/.test(t)) return +t;
  const pfx = sw && sw.pfx ? String(sw.pfx) : '';
  if (pfx && t.toLowerCase().startsWith(pfx.toLowerCase()) && /^\d+$/.test(t.slice(pfx.length))) return +t.slice(pfx.length);
  const m = /(\d+)\s*$/.exec(t);
  return m ? +m[1] : NaN;
}

/* What each row does: [{ line, v, errs, panel, port, sw, swPort, outlet, cord }]. ctx: { objs, rels, locs }.
   A row sets the outlet of a panel port (name and room) and its patch cord to a switch port, either or both. Rows with
   problems are left out on import. */
export function planPatchImport(rows, mapping, { objs, rels, locs = [] }) {
  const col = f => mapping.indexOf(f);
  const cell = (r, f) => col(f) >= 0 ? String(r[col(f)] ?? '').trim() : '';
  const live = objs.filter(o => o.status !== 'retired');
  const byName = (name, ok) => { const k = low(name); return live.find(o => ok(o) && low(o.name) === k) || null; };
  const roomOf = t => locs.find(l => low(l) === low(t)) || locs.find(l => low(l.split(' / ').pop()) === low(t)) || null;
  /* Outlet names already on other panel ports; and what this file uses, to find a name or a switch port twice. */
  const named = new Map(allOutlets(objs).map(x => [low(x.name), x]));
  const fileNames = new Map(), filePorts = new Map(), fileSw = new Map();
  const plan = rows.map((r, i) => {
    const v = Object.fromEntries(Object.keys(PATCH_FIELDS).map(f => [f, cell(r, f)]));
    return { line: i + 2, v, errs: [] };
  }).filter(p => Object.values(p.v).some(Boolean));
  for (const p of plan) {
    const { v, errs } = p;
    p.panel = v.panel ? byName(v.panel, o => o.type === 'patch') : null;
    if (!v.panel) errs.push('No panel');
    else if (!p.panel) errs.push(`Unknown panel ${v.panel}`);
    p.port = v.port ? toPanelPort(v.port) : '';
    const n = panelPortNo(p.port);
    if (!v.port) errs.push('No panel port');
    else if (p.panel && (!n || n > (p.panel.ports || 0))) errs.push(`${p.panel.name} has ports P01 to ${'P' + String(p.panel.ports || 0).padStart(2, '0')}`);
    if (p.panel && n) {
      const k = p.panel.id + '|' + p.port;
      if (filePorts.has(k)) errs.push(`${p.panel.name} ${p.port} is on line ${filePorts.get(k)} too`); else filePorts.set(k, p.line);
    }
    if (v.outlet) {
      const k = low(v.outlet), o = named.get(k);
      if (v.outlet.length > OUTLET_NAME_MAX) errs.push(`Outlet name longer than ${OUTLET_NAME_MAX} characters`);
      if (o && !(p.panel && o.panel.id === p.panel.id && o.port === p.port)) errs.push(`Outlet ${v.outlet} is already on ${o.panel.name} ${o.port}`);
      if (fileNames.has(k)) errs.push(`Outlet ${v.outlet} is on line ${fileNames.get(k)} too`); else fileNames.set(k, p.line);
      p.outlet = { name: v.outlet };
    }
    if (v.room) {
      const room = roomOf(v.room);
      if (!room) errs.push(`Unknown room ${v.room}`);
      else if (!v.outlet && !(p.panel && outletOf(p.panel, p.port))) errs.push('A room needs an outlet name');
      else p.outlet = { ...(p.outlet || { name: outletOf(p.panel, p.port).name }), loc: room };
    }
    if (v.switch || v.swport) {
      p.sw = v.switch ? byName(v.switch, cordTarget) : null;
      if (!v.switch) errs.push('A switch port needs its switch');
      else if (!p.sw) errs.push(`Unknown switch ${v.switch}`);
      else {
        p.swPort = swPortOf(p.sw, v.swport);
        if (p.swPort == null) errs.push('No switch port');
        else {
          const cur = p.panel && n ? cordOf(p.panel, p.port, rels) : null;
          p.same = !!(cur && cur.to === p.sw.id && cur.port === p.swPort);
          const why = p.same ? '' : swPortProblem(p.sw, p.swPort, rels, { panel: p.panel, panelPort: p.port });
          if (why) errs.push(why);
          const k = p.sw.id + '|' + p.swPort;
          if (fileSw.has(k)) errs.push(`${p.sw.name} port ${p.swPort} is on line ${fileSw.get(k)} too`); else fileSw.set(k, p.line);
        }
      }
    }
    if (!v.outlet && !v.room && !v.switch && !v.swport && !errs.length) errs.push('Nothing to set: no outlet and no switch');
  }
  return plan;
}

/* The changes of the rows without problems: outlets to set ({ panel, port, outlet }) and cords to add ({ panel, port, sw,
   swPort }, replacing the cord the panel port has). Nothing is changed here. */
export function patchChanges(plan) {
  const ok = plan.filter(p => !p.errs.length);
  return {
    outlets: ok.filter(p => p.outlet).map(p => ({ panel: p.panel, port: p.port, outlet: { ...(outletOf(p.panel, p.port) || {}), ...p.outlet } })),
    cords: ok.filter(p => p.sw && !p.same).map(p => ({ panel: p.panel, port: p.port, sw: p.sw, swPort: p.swPort })),
  };
}
