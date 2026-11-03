/* Structured cabling: wall outlets on patch panel ports (panel.outlets), patch cords from a panel port to a switch port
   (relations of kind patched), and the way from a device through its outlet and panel to the switch. Pure functions
   over objects and relations: the page, the server and the tests share them. No DOM. */

/* A panel port is P01, P02 …; the number behind it. */
export const PANEL_PORT_RE = /^P(\d{2,4})$/;
export const panelPortNo = p => { const m = PANEL_PORT_RE.exec(String(p ?? '')); return m ? +m[1] : 0; };
export const panelPort = n => 'P' + String(n).padStart(2, '0');
/* "4", "p4", "P04" → "P04"; anything else as typed, in capitals. Same as patchPort in 01-core.js. */
export const toPanelPort = v => { const t = String(v ?? '').trim(); const m = /^p?(\d+)$/i.exec(t); return m ? panelPort(+m[1]) : t.toUpperCase(); };
export const OUTLET_NAME_MAX = 60;
export const OUTLET_LOC_MAX = 500;

/* A device a patch cord can go to: one with numbered ports (as hasPorts in 01-core.js), never another panel. */
const PORTED = ['switch', 'router', 'firewall', 'server'];
export const cordTarget = o => !!o && o.type !== 'patch' && (PORTED.includes(o.type) || o.ports > 0);

export const outletOf = (panel, port) => (panel && panel.outlets && panel.outlets[port]) || null;
/* The panel's one link to a switch from before per-port cords: used for every port without a cord of its own. */
export const trunkOf = (panel, rels) => rels.find(r => r.from === panel.id && r.kind === 'connected') || null;
export const cordOf = (panel, port, rels) => rels.find(r => r.kind === 'patched' && r.from === panel.id && r.fromPort === port) || null;
/* The cord in a switch port, if any. */
export const cordAt = (sw, port, rels) => rels.find(r => r.kind === 'patched' && r.to === sw.id && String(r.port) === String(port)) || null;
/* The device plugged into the outlet behind a panel port (a connected relation to that port). */
export const plugAt = (panel, port, rels) => rels.find(r => r.to === panel.id && r.port === port && r.kind !== 'patched') || null;

/* Every outlet of every panel: [{ panel, port, name, loc }], by name. */
export function allOutlets(objs) {
  const out = [];
  for (const o of objs) if (o.type === 'patch' && o.outlets) for (const [port, x] of Object.entries(o.outlets)) if (x && x.name) out.push({ panel: o, port, name: x.name, loc: x.loc || '' });
  return out.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}
export const findOutlet = (objs, name) => { const k = String(name ?? '').trim().toLowerCase(); return k ? allOutlets(objs).find(x => x.name.toLowerCase() === k) || null : null; };
/* "Outlet 2.OG-R12-04 (PP-01 P04)" */
export const outletLabel = x => `Outlet ${x.name} (${x.panel.name} ${x.port})`;

/* What is wrong with a panel's outlets, or '': an object of its ports, each with a name and an optional room. */
export function outletsProblem(o) {
  if (o.outlets === undefined) return '';
  if (!o.outlets || typeof o.outlets !== 'object' || Array.isArray(o.outlets)) return 'the outlets must be an object of its ports.';
  if (o.type !== 'patch') return 'only a patch panel has outlets.';
  const list = Object.entries(o.outlets);
  if (list.length > (o.ports || 0)) return `it has ${list.length} outlets but ${o.ports || 0} ports.`;
  const seen = new Set();
  for (const [port, x] of list) {
    const n = panelPortNo(port);
    if (!n || n > (o.ports || 0)) return `${port} is not one of its ports.`;
    if (!x || typeof x !== 'object' || Array.isArray(x) || Object.keys(x).some(k => !['name', 'loc'].includes(k))) return `the outlet on ${port} has a name and a room only.`;
    if (typeof x.name !== 'string' || !x.name.trim() || x.name.length > OUTLET_NAME_MAX) return `the outlet on ${port} needs a name of up to ${OUTLET_NAME_MAX} characters.`;
    if (x.loc !== undefined && (typeof x.loc !== 'string' || x.loc.length > OUTLET_LOC_MAX)) return `the room of the outlet on ${port} is text of up to ${OUTLET_LOC_MAX} characters.`;
    const k = x.name.trim().toLowerCase();
    if (seen.has(k)) return `two of its outlets are named ${x.name}.`;
    seen.add(k);
  }
  return '';
}
/* An outlet name used on two panels, or ''. */
export function outletClash(objs) {
  const at = new Map();
  for (const x of allOutlets(objs)) {
    const k = x.name.trim().toLowerCase(), was = at.get(k);
    if (was && was.panel !== x.panel) return `The outlet ${x.name} is on ${was.panel.name} and on ${x.panel.name}.`;
    at.set(k, x);
  }
  return '';
}
/* What is wrong with a patch cord, or '': from a panel port to a numbered port of a device with ports. byId finds objects. */
export function cordProblem(r, byId) {
  const p = byId(r.from), t = byId(r.to);
  if (!p || p.type !== 'patch') return 'A patch cord starts on a patch panel.';
  const n = panelPortNo(r.fromPort);
  if (!n || n > (p.ports || 0)) return `${r.fromPort} is not a port of ${p.name}.`;
  if (!cordTarget(t)) return `A patch cord from ${p.name} goes to a switch, router or firewall port.`;
  if (!Number.isInteger(r.port) || r.port < 1) return `A patch cord from ${p.name} ${r.fromPort} needs a port number on ${t.name}.`;
  if (r.lag != null || r.fromLag != null) return 'A patch cord uses single ports, not a LAG.';
  return '';
}

/* The way up from a device: [{ o }, { o, via, outlet? }, …]. Through a patch panel reached on a port, the cord of that
   port leads on; without one, the panel's trunk (or any other link it has), as before cords existed. A panel port with
   an outlet gives that hop its outlet ({ name, loc, port }). */
export function netChain(o, rels, byId, max = 8) {
  const chain = [{ o }], seen = new Set([o.id]);
  let cur = o, inPort = null;
  for (let i = 0; i < max; i++) {
    const cord = cur.type === 'patch' && inPort != null ? cordOf(cur, inPort, rels) : null;
    const r = cord && !seen.has(cord.to) ? cord : rels.find(x => x.from === cur.id && x.kind !== 'patched' && !seen.has(x.to));
    if (!r) break;
    const nx = byId(r.to);
    if (!nx) break;
    const step = { o: nx, via: r };
    const out = nx.type === 'patch' && r.port != null ? outletOf(nx, r.port) : null;
    if (out) step.outlet = { name: out.name, loc: out.loc || '', port: r.port };
    chain.push(step); seen.add(nx.id);
    cur = nx; inPort = nx.type === 'patch' ? r.port : null;
  }
  return chain;
}

/* What a switch port leads to through a cord: { cord, panel, port, outlet, plug, device } or null. */
export function viaOf(sw, port, rels, byId) {
  const cord = cordAt(sw, port, rels);
  if (!cord) return null;
  const panel = byId(cord.from), plug = panel ? plugAt(panel, cord.fromPort, rels) : null;
  return { cord, panel, port: cord.fromPort, outlet: outletOf(panel, cord.fromPort), plug, device: plug ? byId(plug.from) : null };
}

/* The state of one panel port, for its row: ok (green: a device with its way to the switch), warn (amber: a device with
   no cord and no trunk, or a cord to no outlet), off (grey ring: nothing on it). */
export function portState(panel, port, rels) {
  const cord = cordOf(panel, port, rels), trunk = trunkOf(panel, rels), plug = plugAt(panel, port, rels), out = outletOf(panel, port);
  if (plug && !cord && !trunk) return { state: 'warn', why: 'A device is on it, but it has no patch cord and the panel no trunk' };
  if (cord && !out) return { state: 'warn', why: 'Patched, but no outlet is named for it' };
  if (plug) return { state: 'ok', why: cord ? 'Outlet, patch cord and device' : 'Device, through the panel trunk' };
  return { state: 'off', why: cord || out ? 'No device on it' : 'Not in use' };
}

/* Devices on a panel port with no way on: no cord on that port and no trunk on the panel. */
export function patchGaps(objs, rels) {
  const byId = new Map(objs.map(o => [o.id, o])), out = [];
  for (const r of rels) {
    if (r.kind !== 'connected' || r.port == null) continue;
    const p = byId.get(r.to), d = byId.get(r.from);
    if (!p || !d || p.type !== 'patch' || d.status === 'retired') continue;
    if (!cordOf(p, r.port, rels) && !trunkOf(p, rels)) out.push(d);
  }
  return out;
}

/* Outlet names from a pattern over a range of ports: {n} is the number with two digits (04), {#} as it is (4).
   A pattern without either gets the two digits at its end. */
export function outletNames(pattern, from, to) {
  const t = String(pattern ?? '').trim();
  if (!t || !Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from) return [];
  const has = /\{n\}|\{#\}/.test(t);
  const out = [];
  for (let n = from; n <= to; n++) {
    const two = String(n).padStart(2, '0');
    out.push({ port: panelPort(n), name: has ? t.replace(/\{n\}/g, two).replace(/\{#\}/g, String(n)) : t + two });
  }
  return out;
}
/* What naming these outlets would do: [{ port, name, was, err }]. A name used on another panel, or twice here, or too
   long, is an error; ports beyond the panel's are too. */
export function outletPlan(panel, names, objs) {
  const elsewhere = new Map(allOutlets(objs).filter(x => x.panel.id !== panel.id).map(x => [x.name.toLowerCase(), x]));
  const renamed = new Set(names.map(x => x.port));
  /* Names on this panel's other ports, which stay. */
  const staying = new Map(Object.entries(panel.outlets || {}).filter(([p, x]) => !renamed.has(p) && x && x.name).map(([p, x]) => [x.name.toLowerCase(), p]));
  const count = new Map();
  for (const x of names) count.set(x.name.toLowerCase(), (count.get(x.name.toLowerCase()) || 0) + 1);
  return names.map(x => {
    const k = x.name.toLowerCase(), o = elsewhere.get(k), was = outletOf(panel, x.port);
    const err = panelPortNo(x.port) > (panel.ports || 0) ? `${panel.name} has no port ${x.port}`
      : !x.name.trim() ? 'No name' : x.name.length > OUTLET_NAME_MAX ? `Longer than ${OUTLET_NAME_MAX} characters`
      : o ? `Already used on ${o.panel.name} ${o.port}`
      : staying.has(k) ? `Already used on ${staying.get(k)}`
      : count.get(k) > 1 ? 'Twice in this list' : '';
    return { port: x.port, name: x.name, was: was ? was.name : '', err };
  });
}
/* Why a switch port cannot take a cord from this panel port, or '': out of range, part of a LAG, or taken by anything
   but this same cord. */
export function swPortProblem(sw, port, rels, { panel = null, panelPort: pp = null } = {}) {
  const n = (sw.ports || 0) + (sw.sfp || 0);
  if (!n) return `${sw.name} has no ports yet`;
  if (!Number.isInteger(port) || port < 1 || port > n) return `${sw.name} has ports 1 to ${n}`;
  const lag = (sw.portGroups || []).find(g => g.lag && port >= g.from && port <= g.to);
  if (lag) return `Port ${port} on ${sw.name} is part of the LAG ${lag.name}`;
  const on = rels.find(r => r.to === sw.id && String(r.port) === String(port) && !(r.kind === 'patched' && panel && r.from === panel.id && r.fromPort === pp));
  if (on) return `Port ${port} on ${sw.name} is taken${on.kind === 'patched' ? ` by a cord from ${on.fromPort}` : ''}`;
  return '';
}
/* What patching a range of panel ports to a range of switch ports would do: [{ port, swPort, was, err }]. was: the
   cord the panel port has now, which the new one replaces. */
export function patchPlan(panel, from, to, sw, swFrom, rels, byId) {
  if (!Number.isInteger(from) || !Number.isInteger(to) || to < from || !Number.isInteger(swFrom)) return [];
  const out = [];
  for (let n = from; n <= to; n++) {
    const port = panelPort(n), swPort = swFrom + (n - from), cur = cordOf(panel, port, rels);
    const same = cur && cur.to === sw.id && cur.port === swPort;
    const wasT = cur && byId(cur.to);
    const err = n > (panel.ports || 0) ? `${panel.name} has no port ${port}` : same ? '' : swPortProblem(sw, swPort, rels, { panel, panelPort: port });
    out.push({ port, swPort, was: cur && !same ? `${wasT ? wasT.name : '?'} port ${cur.port}` : '', same: !!same, err });
  }
  return out;
}
