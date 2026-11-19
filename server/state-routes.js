/* The inventory itself: read (whole or what changed since), saved, reset, and the floor-plan images. Split out of app.js. */
import { audit } from './db.js';
import { settingDiff } from './audit-diff.js';
import { inScope, planInScope, scopeKey, scopeOf, scopeState } from './scope.js';
import { stateTag, stateSeq, changesSince, ADMIN_SETTINGS, CONNECTION_SETTINGS, SETTING_KEYS, PAGE_SETTINGS, SETTING_NAMES, settingOf, loadState, saveState, applyChanges, describeChanges, factoryReset, clearConnections, clearSyncLists } from './state.js';
import { autoBackup } from './backup.js';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { HttpError } from './errors.js';
import { licenceUse } from '../public/js/costs.js';
import { purgeOrphanImages } from './device-images.js';

/* Adds the inventory routes: GET /api/state (all of it, or what changed since, cut to what the person may see, without
   the admin-only settings and sign-in names for a viewer), PUT /api/state, POST /api/changes (the page's saves),
   factory reset, clearing the connections, and the floor-plan images. Only admins change anything. */
/* Answers that read every device (the whole inventory, the Software tab's index, the licences' use) are kept until the
   next change (the running number, stateSeq), per person's view of it (the key says whose): with many pages open,
   each asking after every change, the work is done once. Small: the last few answers only. */
const ANSWERS_BY_DB = new WeakMap(), ANSWERS_MAX = 24;
function answer(db, key, make){
  /* One store per database: a second one opened in the same process (tests, a restore check) never shares answers. */
  let ANSWERS = ANSWERS_BY_DB.get(db); if (!ANSWERS){ ANSWERS = new Map(); ANSWERS_BY_DB.set(db, ANSWERS); }
  const k = `${stateSeq(db)}|${key}`;
  if (ANSWERS.has(k)) { const v = ANSWERS.get(k); ANSWERS.delete(k); ANSWERS.set(k, v); return v; }
  const v = make();
  ANSWERS.set(k, v);
  while (ANSWERS.size > ANSWERS_MAX) ANSWERS.delete(ANSWERS.keys().next().value);
  return v;
}

export function registerStateRoutes(app, ctx) {
  const { db, requireUser, requireAdmin } = ctx;
  /* What a page that is not an admin's does not get: the connections' settings, sign-in names (the login, the UPN, and
     the other sign-in names kept as aliases by the directory sync and by merging people). */
  const redactObj = o => (o.graph && o.graph.owner ? { ...o, graph: { ...o.graph, owner: '' } } : o);
  /* Who a saved view is mailed to is for admins too. */
  const redactViews = list => Array.isArray(list) ? list.map(v => { if (!v || !v.mail) return v; const c = { ...v }; delete c.mail; return c; }) : list;
  const redactUser = ({ login, aliases, groups, groupDns, entraGroups, entraGroupsAt, entra, ...u }) => (entra ? { ...u, entra: { enabled: entra.enabled, synced: entra.synced, ...(entra.gone ? { gone: entra.gone } : {}) } } : u);
  app.get('/api/state', requireUser, (req, res, next) => {
    /* Only what changed since the page's copy (since: the running number it got with it): the records written since,
       with their revisions, and the ones deleted. A page that sees part of the inventory (sites, own devices) and a
       long gap get everything, as without since. */
    const since = req.query.since !== undefined ? Number(req.query.since) : NaN;
    const sc = scopeOf(req.user), admin = req.user.role === 'admin';
    if (Number.isInteger(since) && since >= 0 && !(sc && sc.own)) {
      try {
        const cseq = stateSeq(db);
        let rows = since > cseq ? null : changesSince(db, since);
        /* Someone limited to sites: what changed, as they see it (scope.js). A device that moved out of their sites is
           named as deleted, with its connections and history; one that moved in comes with them. A change to their own
           account (their sites) gets everything again. */
        if (rows && rows.some(r => r.kind === 'user' && r.id === String(req.user.id))) rows = null;
        if (rows) {
          res.set('Cache-Control', 'no-store');
          const puts = [], dels = [], revs = {}, seen = new Set();
          const rev = db.prepare('SELECT rev FROM revs WHERE kind = ? AND id = ?'), doc = db.prepare('SELECT data FROM docs WHERE kind = ? AND id = ?');
          const objOf = id => { const d = doc.get('object', String(id)); return d ? JSON.parse(d.data) : null; };
          let allRels = null;
          const relsOf = id => { allRels ||= db.prepare("SELECT data FROM docs WHERE kind = 'rel'").all().map(x => JSON.parse(x.data)); return allRels.filter(x => x.from === id || x.to === id); };
          const send = (kind, id, data) => {
            const key = kind + '|' + id; if (seen.has(key)) return; seen.add(key);
            const r = rev.get(kind, id); if (r) revs[key] = r.rev;
            if (data === null) dels.push([kind, id]); else puts.push([kind, id, admin ? data : kind === 'object' ? redactObj(data) : kind === 'user' ? redactUser(data) : kind === 'setting' && id === 'savedViews' ? redactViews(data) : data]);
          };
          for (const r of rows) {
            if (!admin && r.kind === 'setting' && ((CONNECTION_SETTINGS.includes(r.id) && r.id !== 'graphAmbiguous') || ADMIN_SETTINGS.includes(r.id))) continue;
            if (!sc) { send(r.kind, r.id, r.data); continue; }
            if (r.kind === 'object') {
              if (r.data && inScope(r.data, sc)) {
                send('object', r.id, r.data);
                const h = doc.get('history', r.id); send('history', r.id, h ? JSON.parse(h.data) : null);
                for (const x of relsOf(r.id)) if (inScope(objOf(x.from), sc) && inScope(objOf(x.to), sc)) send('rel', String(x.id), x);
              } else {
                send('object', r.id, null); send('history', r.id, null);
                for (const x of relsOf(r.id)) send('rel', String(x.id), null);
              }
            } else if (r.kind === 'rel') {
              send('rel', r.id, r.data && inScope(objOf(r.data.from), sc) && inScope(objOf(r.data.to), sc) ? r.data : null);
            } else if (r.kind === 'history') {
              if (inScope(objOf(r.id), sc)) send('history', r.id, r.data);
            } else if (r.kind === 'setting' && ['lsPresence', 'adShort'].includes(r.id) && r.data) {
              /* Counts of the whole inventory, cut without the device list (scope.js). */
              send('setting', r.id, scopeState({ objs: [], [r.id]: r.data }, sc)[r.id]);
            } else if (r.kind === 'setting' && ['stocktakes', 'graphAmbiguous', 'syncChanges', 'plans'].includes(r.id) && r.data) {
              /* Only what is about the devices they see: the device list is read for it. */
              const seen = scopeState({ objs: db.prepare("SELECT data FROM docs WHERE kind = 'object'").all().map(x => JSON.parse(x.data)), [r.id]: r.data }, sc);
              send('setting', r.id, seen[r.id]);
            } else send(r.kind, r.id, r.data);
          }
          return sendPacked(req, res, { delta: true, cseq, puts, dels, revs }, next);
        }
      } catch (e) { return next(e); }
    }
    /* Nothing changed since the page's copy (same revisions, same person and role): 304, without loading anything. The
       page polls every 15 seconds, so this spares loading and sending the whole inventory each time. */
    /* history=0: without the devices' history, the bulk of a large inventory. The page reads a device's history when its
       page opens (GET /api/history/:id) and gets the history that changes later with what changed (since=). */
    const lean = req.query.history === '0', noSw = req.query.software === '0';
    const tag = `W/"${stateTag(db)}.${req.user.id}.${req.user.role}.${crypto.createHash('sha1').update(scopeKey(scopeOf(req.user))).digest('hex').slice(0, 8)}${lean ? '.h0' : ''}${noSw ? '.s0' : ''}"`;
    res.set('Cache-Control', 'private, no-cache').set('ETag', tag);
    if (req.get('if-none-match') === tag) return res.status(304).end();
    const text = answer(db, 'state|' + tag, () => {
      const cseq = stateSeq(db);
      const s = scopeState(loadState(db, { history: !lean }), sc); delete s.empty;
      if (!admin) {   /* the connections' settings and sign-in names are for admins, as in Settings */
        for (const k of CONNECTION_SETTINGS) if (k !== 'graphAmbiguous') delete s[k];   /* the ambiguous devices are a device filter */
        for (const k of ADMIN_SETTINGS) delete s[k];
        /* Whether someone is in Entra stays; their sign-in name there (UPN) and Entra's id go, like the login. */
        s.objs = s.objs.map(redactObj);
        s.savedViews = redactViews(s.savedViews);
        s.users = s.users.map(redactUser);
      }
      /* software=0: without the devices' installed software, read next (GET /api/software). */
      if (noSw) s.objs = s.objs.map(o => { if (!o || !Object.hasOwn(o, 'software')) return o; const rest = { ...o }; delete rest.software; return rest; });
      s.cseq = cseq;
      return { text: JSON.stringify(s) };
    });
    sendPacked(req, res, text, next);
  });

  /* The installed software of every device the person may see, by device id, for a page that loaded the inventory
     without it (software=0). Devices with none are left out. */
  app.get('/api/software', requireUser, (req, res, next) => {
    try {
      const sc = scopeOf(req.user), software = {};
      for (const r of db.prepare("SELECT id, data FROM docs WHERE kind = 'object'").all()){
        const o = JSON.parse(r.data);
        if (Array.isArray(o.software) && o.software.length && inScope(o, sc)) software[r.id] = o.software;
      }
      res.set('Cache-Control', 'no-store');
      sendPacked(req, res, { software }, next);
    } catch (e) { next(e); }
  });

  /* The Software tab's index: each package with its versions and the ids of the devices that have each, counted here
     so the page never reads every device's software (it knows the devices themselves). Only devices the person may
     see; pending devices are left out, as on the tab. */
  app.get('/api/software/packages', requireUser, (req, res, next) => {
    try {
      const sc = scopeOf(req.user);
      const text = answer(db, 'pkgs|' + scopeKey(sc), () => {
      const map = new Map();
      for (const r of db.prepare("SELECT data FROM docs WHERE kind = 'object'").all()){
        const o = JSON.parse(r.data);
        if (o.review || !Array.isArray(o.software) || !o.software.length || !inScope(o, sc)) continue;
        for (const p of o.software){
          if (!p || !p.name) continue;
          const pkg = map.get(p.name) || new Map(); map.set(p.name, pkg);
          const v = p.version || '-', ids = pkg.get(v) || new Set(); pkg.set(v, ids);
          ids.add(o.id);
        }
      }
      return { text: JSON.stringify({ packages: [...map].map(([name, vs]) => ({ name, versions: [...vs].map(([v, ids]) => [v, [...ids]]) })) }) };
      });
      res.set('Cache-Control', 'no-store');
      sendPacked(req, res, text, next);
    } catch (e) { next(e); }
  });
  /* One device's software, for its page (a page that loaded the inventory without software reads it only here). */
  app.get('/api/software/:id', requireUser, (req, res, next) => {
    try {
      const id = String(req.params.id);
      const o = db.prepare("SELECT data FROM docs WHERE kind = 'object' AND id = ?").get(id);
      const d = o ? JSON.parse(o.data) : null;
      if (!d || !inScope(d, scopeOf(req.user))) throw new HttpError(404, 'No such device.');
      res.set('Cache-Control', 'no-store').json({ id, software: Array.isArray(d.software) ? d.software : [] });
    } catch (e) { next(e); }
  });
  /* How many devices use each licence, counted here, so the Overview can say which are over-used without the page
     reading every device's software. Only the devices the person may see. */
  app.get('/api/licence-use', requireUser, (req, res, next) => {
    try {
      const sc = scopeOf(req.user);
      const use = answer(db, 'lic|' + scopeKey(sc), () => {
        const objs = db.prepare("SELECT data FROM docs WHERE kind = 'object'").all().map(r => JSON.parse(r.data)).filter(o => !o.review && inScope(o, sc));
        const lic = settingOf(db, 'licences'), u = {};
        if (!(sc && sc.own)) for (const l of Array.isArray(lic) ? lic : []) if (l && l.id) u[l.id] = licenceUse(l, objs).used;
        return u;
      });
      res.set('Cache-Control', 'no-store').json({ use });
    } catch (e) { next(e); }
  });

  /* One device's history, newest first, for a page that loaded the inventory without it (history=0). Only for a device
     the person may see. */
  app.get('/api/history/:id', requireUser, (req, res, next) => {
    try {
      const id = String(req.params.id);
      const o = db.prepare("SELECT data FROM docs WHERE kind = 'object' AND id = ?").get(id);
      if (!o || !inScope(JSON.parse(o.data), scopeOf(req.user))) throw new HttpError(404, 'No such device.');
      const h = db.prepare("SELECT data FROM docs WHERE kind = 'history' AND id = ?").get(id);
      res.set('Cache-Control', 'no-store').json({ id, history: h ? JSON.parse(h.data) : [] });
    } catch (e) { next(e); }
  });

  /* The whole inventory replaced in one save (the page itself saves only its changes, below). It must keep the admin
     asking and at least one active admin. */
  app.put('/api/state', requireUser, requireAdmin, (req, res, next) => {
    try {
      const incoming = req.body;
      if (!incoming || typeof incoming !== 'object') throw new HttpError(400, 'Send the inventory as JSON.');
      const users = Array.isArray(incoming.users) ? incoming.users.filter(u => u && typeof u === 'object') : [];
      if (!users.some(u => u.id === req.user.id)) throw new HttpError(400, 'Keep your own user in the list.');
      if (!users.some(u => u.role === 'admin' && u.active !== false)) throw new HttpError(400, 'At least one active admin is needed.');
      /* Settings only the server writes (connections, sync results, certificates) are kept as they are, whatever is sent,
         as with every other save. The counters only go up anyway. */
      const cur = loadState(db), next = { ...incoming };
      for (const k of SETTING_KEYS) {
        if (PAGE_SETTINGS.includes(k) || ['seq', 'codeN', 'rseq'].includes(k)) continue;
        if (cur[k] !== undefined) next[k] = cur[k]; else delete next[k];
      }
      saveState(db, next);
      audit(db, req.user.id, 'save inventory');
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  /* Factory reset: the whole inventory, and every account but the one asking, is removed. Needs the typed word. */
  app.post('/api/factory-reset', requireUser, requireAdmin, (req, res, next) => {
    try {
      if (!req.body || req.body.confirm !== 'FACTORY RESET') throw new HttpError(400, 'Type FACTORY RESET to confirm.');
      const backups = req.body.backups === true;
      /* Only the account asking stays, and the directory settings go: an account that signs in through the directory
         (no password in this app) could not sign in afterwards, and nobody else could either. */
      if (!db.prepare('SELECT 1 FROM credentials WHERE user_id = ?').get(String(req.user.id))) throw new HttpError(400, 'Sign in with a local admin account (one with a password in this app) to reset: a directory account could not sign in afterwards.');
      factoryReset(db, req.user.id, { backups });
      audit(db, req.user.id, 'factory reset' + (backups ? ', backups deleted' : ''));
      res.json({ ok: true });
    } catch (e) { next(e); }
  });
  /* The connections to other systems are removed: LDAP and Microsoft Graph settings, Graph's certificates and keys,
     the Lansweeper API settings and push token. The inventory itself stays. */
  app.post('/api/sync-lists/clear', requireUser, requireAdmin, (req, res, next) => {
    try { clearSyncLists(db); audit(db, req.user.id, 'sync lists emptied after clearing the inventory'); res.json({ ok: true }); } catch (e) { next(e); }
  });
  app.post('/api/connections/clear', requireUser, requireAdmin, (req, res, next) => {
    try {
      clearConnections(db);
      audit(db, req.user.id, 'connections removed: LDAP, Microsoft Graph with its certificates, Lansweeper API and push token');
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  /* The page saves only what changed. See applyChanges for how a conflict is handled. */
  app.post('/api/changes', requireUser, requireAdmin, (req, res, next) => {
    try {
      const guard = s => {
        if (!s.users.some(u => u.id === req.user.id)) throw new HttpError(400, 'Keep your own user in the list.');
        if (!s.users.some(u => u.role === 'admin' && u.active !== false)) throw new HttpError(400, 'At least one active admin is needed.');
      };
      /* The names of objects and users being removed are read before they are gone. */
      const removes = Array.isArray(req.body?.dels) && req.body.dels.some(c => c && (c.kind === 'object' || c.kind === 'user'));
      /* Settings are logged one by one with what changed (before → after); the map layout is a preference, not logged. */
      const all = [...(Array.isArray(req.body?.puts) ? req.body.puts : []), ...(Array.isArray(req.body?.dels) ? req.body.dels : [])].filter(c => c && typeof c === 'object');
      const settingIds = [...new Set(all.filter(c => c.kind === 'setting' && c.id !== 'mapPos').map(c => String(c.id)))];
      const before = removes || settingIds.length ? loadState(db, { history: false }) : null;
      /* Once a day, before the first change made on the page: an inventory kept by hand, without syncs, is backed up too
         (parts that did not change take no room again). */
      autoBackup(db, 'daily, before the first change', { daily: true });
      const result = applyChanges(db, req.body, guard);
      if (result && result.keptSoftware) audit(db, req.user.id, `software kept: ${result.keptSoftware.map(k => `${k.name} (${k.n} packages a save would have removed)`).join(', ')}`);
      /* A device deleted for good takes its photos with it. */
      if (removes) purgeOrphanImages(db);
      const conflicts = new Set(result && Array.isArray(result.conflicts) ? result.conflicts : []);
      const skipped = conflicts.size ? ` (${conflicts.size} not saved: changed by someone else first)` : '';
      const rest = { puts: (req.body.puts || []).filter(c => c && c.kind !== 'setting'), dels: (req.body.dels || []).filter(c => c && c.kind !== 'setting') };
      if (rest.puts.length || rest.dels.length || !settingIds.length) audit(db, req.user.id, describeChanges(settingIds.length ? rest : req.body, before) + skipped);
      for (const id of settingIds) {
        if (conflicts.has(`setting|${id}`)) continue;
        const put = (req.body.puts || []).find(c => c && c.kind === 'setting' && String(c.id) === id);
        const changes = settingDiff(before[id], put ? put.value : undefined);
        if (changes.length) audit(db, req.user.id, `setting changed: ${SETTING_NAMES[id] || id}`, { setting: id, changes });
      }
      res.json(result);
    } catch (e) { next(e); }
  });

  /* Floor-plan images are kept apart from the inventory, so they do not count against its size. */
  const planId = req => { if (!/^[A-Za-z0-9_-]{1,64}$/.test(req.params.id)) throw new HttpError(400, 'No such plan.'); return req.params.id; };
  app.put('/api/plans/:id/image', requireUser, requireAdmin, (req, res, next) => {
    try {
      const id = planId(req);
      const data = typeof req.body === 'string' ? req.body : '';
      if (!/^data:image\/(jpeg|png|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(data)) throw new HttpError(400, 'Send a PNG, JPEG, GIF or WebP image.');
      if (data.length > 2000000) throw new HttpError(413, 'The image is too large.');
      db.prepare('INSERT INTO plan_images (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data').run(id, data);
      audit(db, req.user.id, 'plan image saved');
      res.json({ ok: true });
    } catch (e) { next(e); }
  });
  app.get('/api/plans/:id/image', requireUser, (req, res, next) => {
    try {
      /* Only a plan of a site the viewer sees (scope.js): a site-limited viewer does not get other buildings. */
      const sc = scopeOf(req.user);
      if (sc && !planInScope(((settingOf(db, 'plans') || []).find(p => p && p.id === planId(req))), sc)) throw new HttpError(404, 'No image for this plan.');
      const row = db.prepare('SELECT data FROM plan_images WHERE id = ?').get(planId(req));
      if (!row) throw new HttpError(404, 'No image for this plan.');
      const m = /^data:(image\/[a-z]+);base64,(.*)$/.exec(row.data);
      res.type(m[1]).set('Cache-Control', 'private, max-age=3600').send(Buffer.from(m[2], 'base64'));
    } catch (e) { next(e); }
  });
  app.delete('/api/plans/:id/image', requireUser, requireAdmin, (req, res, next) => {
    try { db.prepare('DELETE FROM plan_images WHERE id = ?').run(planId(req)); audit(db, req.user.id, 'plan image removed'); res.json({ ok: true }); }
    catch (e) { next(e); }
  });
}

/* A large answer (the whole inventory) packed with gzip when the browser takes it: several times smaller, so a large
   inventory loads faster where no proxy packs it (behind the bundled proxy it is sent packed as it is). Small answers
   go as they are. Packed off the main thread, so other requests are not held up. */
/* body: what to send, or a kept answer ({ text }) that also keeps its packed copy for the next time. */
function sendPacked(req, res, body, next){
  const kept = body && typeof body.text === 'string' ? body : null;
  const text = kept ? kept.text : JSON.stringify(body);
  res.vary('Accept-Encoding');
  if (text.length < 32768 || !/\bgzip\b/.test(String(req.get('accept-encoding') || ''))) { res.type('json').send(text); return; }
  if (kept && kept.gz) { res.set('Content-Encoding', 'gzip').type('json').send(kept.gz); return; }
  zlib.gzip(text, { level: 5 }, (err, buf) => {
    if (err) { next(err); return; }
    if (kept) kept.gz = buf;
    res.set('Content-Encoding', 'gzip').type('json').send(buf);
  });
}
