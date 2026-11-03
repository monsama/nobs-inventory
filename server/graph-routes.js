/* Microsoft Graph (Entra and Intune): settings, certificates, test and sync. Split out of app.js. */
import { audit } from './db.js';
import { loadState, saveState } from './state.js';
import { entraThumbprintOf, syncGraph, testGraph } from './graph.js';
import { dropGraphKey, graphCertPem, graphSettingsProblem, hasGraphKey, storeGraphKey } from './graph-keys.js';
import { generateGraphCert } from './cert.js';
import crypto from 'node:crypto';
import { runRecorded } from './sync-runs.js';
import { HttpError } from './errors.js';

/* Adds the Microsoft Graph routes, all for admins: the status, the settings (tenant, client id and how far each part
   goes), the certificates (make one, download its .cer, choose one, remove one), and the test and sync. It also puts
   the connection on app.locals for the nightly run. */
export function registerGraphRoutes(app, ctx) {
  const { db, requireUser, requireAdmin, cfgGraph, graphSettings, graphSource, SHEET_KEY, graphFetch } = ctx;
  const editGraph = fn => { const s = loadState(db); s.graph = fn({ ...(s.graph || {}) }); const p = graphSettingsProblem(s.graph); if (p) throw new HttpError(400, p); saveState(db, s); };

  /* The certificates made here and the one the server signs in with: public details only, never a key. Each is listed by
     its SHA-1 thumbprint, which is what Entra shows for an uploaded certificate. */
  app.get('/api/graph/status', requireUser, requireAdmin, (req, res) => {
    const g = cfgGraph(), set = graphSettings();
    let used = null;
    if (g) { const x = new crypto.X509Certificate(g.certPem); used = { expires: new Date(x.validTo).toISOString(), thumbprint: entraThumbprintOf(g.certPem) }; }
    const certs = (loadState(db).graphCerts || []).map(c => ({ ...c, inUse: !!used && c.thumbprint === used.thumbprint, chosen: c.thumbprint === set.thumbprint, onServer: hasGraphKey(db, c.thumbprint) }));
    res.json({ configured: !!g, source: graphSource(), tenant: set.tenant || '', clientId: set.clientId || '', people: set.people || 'match', defender: set.defender || 'off', autopilot: set.autopilot || 'off', secureBoot: set.secureBoot || 'off', sso: set.sso || 'off', ...(used || {}), certs });
  });
  /* The tenant and the app (client) id, from the app registration's Overview page in Entra. */
  app.post('/api/graph/settings', requireUser, requireAdmin, (req, res, next) => {
    try {
      const b = req.body || {};
      /* Each part is saved on its own: the IDs from step 1, how far people go from step 5. */
      editGraph(g => ({ ...g, ...('tenant' in b ? { tenant: String(b.tenant || '').trim(), clientId: String(b.clientId || '').trim() } : {}), ...('people' in b ? { people: String(b.people) } : {}), ...('defender' in b ? { defender: String(b.defender) } : {}), ...('autopilot' in b ? { autopilot: String(b.autopilot) } : {}), ...('secureBoot' in b ? { secureBoot: String(b.secureBoot) } : {}), ...('sso' in b ? { sso: String(b.sso) } : {}) }));
      audit(db, req.user.id, 'Microsoft Graph settings saved');
      res.json({ ok: true });
    } catch (e) { next(e); }
  });
  /* A new certificate. The server keeps it with its key, sealed; the answer holds the certificate only. The first one made
     is the one used, until another is chosen. */
  app.post('/api/graph/cert', requireUser, requireAdmin, (req, res, next) => {
    try {
      const made = generateGraphCert();
      const thumbprint = entraThumbprintOf(made.certPem);
      storeGraphKey(db, SHEET_KEY, thumbprint, made.certPem, made.keyPem);
      const s = loadState(db);
      s.graphCerts = [{ thumbprint, created: new Date().toISOString(), expires: made.expires, by: req.user.name || req.user.login || '' }, ...(s.graphCerts || [])].slice(0, 20);
      if (!(s.graph && s.graph.thumbprint && hasGraphKey(db, s.graph.thumbprint))) s.graph = { ...(s.graph || {}), thumbprint };
      saveState(db, s);
      audit(db, req.user.id, `Microsoft Graph certificate ${thumbprint} created, expires ${made.expires}`);
      res.json({ thumbprint, certPem: made.certPem, expires: made.expires });
    } catch (e) { next(e); }
  });
  /* The certificate to upload to Entra, any time. It is public; the key stays on the server. */
  app.get('/api/graph/cert/:thumbprint/cer', requireUser, requireAdmin, (req, res, next) => {
    try {
      const t = String(req.params.thumbprint).toUpperCase();
      const pem = graphCertPem(db, t);
      res.set('Content-Type', 'application/x-pem-file').set('Content-Disposition', `attachment; filename="nobs-graph-${t.slice(0, 8)}.cer"`).send(pem);
    } catch (e) { next(e); }
  });
  /* Sign in with this certificate from now on. Upload it to Entra first, or the sign-in fails. */
  app.post('/api/graph/cert/:thumbprint/use', requireUser, requireAdmin, (req, res, next) => {
    try {
      const t = String(req.params.thumbprint).toUpperCase();
      if (!hasGraphKey(db, t)) throw new HttpError(404, 'This certificate is not on the server.');
      editGraph(g => ({ ...g, thumbprint: t }));
      audit(db, req.user.id, `Microsoft Graph certificate ${t} in use`);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });
  /* Takes a certificate off the list and deletes its key here. It does not touch Entra: delete it there too. */
  app.delete('/api/graph/cert/:thumbprint', requireUser, requireAdmin, (req, res, next) => {
    try {
      const s = loadState(db), t = String(req.params.thumbprint).toUpperCase();
      const g = cfgGraph();
      /* One set in the server's environment is not the app's to remove. The one the app signs in with can go when that is
         asked for: Graph then stops until another certificate is created or chosen. */
      if (graphSource() === 'server' && g && entraThumbprintOf(g.certPem) === t) throw new HttpError(400, 'This certificate is set in the server settings (NI_GRAPH_CERT). Remove it there.');
      const inUse = s.graph && s.graph.thumbprint === t;
      if (inUse && req.query.inUse !== '1') throw new HttpError(400, 'This is the certificate the server signs in with. Use another one first, or confirm removing it.');
      if (inUse) delete s.graph.thumbprint;
      s.graphCerts = (s.graphCerts || []).filter(c => c.thumbprint !== t);
      saveState(db, s);
      dropGraphKey(db, t);
      audit(db, req.user.id, `Microsoft Graph certificate ${t} removed`);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });
  const graphMissing = () => new HttpError(400, 'Microsoft Graph is not set up yet: give the directory (tenant) ID and the application (client) ID, and create a certificate.');
  /* Signs in and reads one device of each list, so a missing upload or permission is named before a sync. */
  app.post('/api/graph/test', requireUser, requireAdmin, async (req, res, next) => {
    try {
      const g = cfgGraph();
      if (!g) throw graphMissing();
      res.json(await testGraph(g, graphFetch));
    } catch (e) { next(e); }
  });
  app.post('/api/graph/sync', requireUser, requireAdmin, async (req, res, next) => {
    try {
      /* Switched off in Settings: not run, and not recorded as a run. Sign-in with Microsoft is not affected. */
      if (loadState(db).useGraph === false) throw new HttpError(403, 'The Entra & Intune sync is turned off in Settings → Entra & Intune. Sign-in with Microsoft is not affected.');
      const g = cfgGraph();
      const counts = await runRecorded(db, 'graph', () => { if (!g) throw graphMissing(); return syncGraph(db, g, new Date(), graphFetch); });
      audit(db, null, 'Microsoft Graph sync: ' + JSON.stringify(counts));
      res.json({ counts });
    } catch (e) { audit(db, null, 'Microsoft Graph sync failed: ' + e.message); next(e); }
  });
  /* The nightly run uses the same connection as the buttons. */
  app.locals.graphConfig = cfgGraph;
}
