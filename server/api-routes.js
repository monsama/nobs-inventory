/* The read-only API for other tools: the tokens an admin makes and revokes (Settings → Users → API access), and
   /api/v1 (devices, contracts, licences, people), read with Authorization: Bearer nobs_…. Split out of app.js. */
import { apiDevice, checkApiToken, createApiToken, csvCellApi, listApiTokens, revokeApiToken, apiContract, apiLicence, apiPerson } from './api-tokens.js';
import { audit } from './db.js';
import { HttpError } from './errors.js';
import { loadState } from './state.js';

export function registerApiRoutes(app, { db, requireUser, requireAdmin, throttle }) {
  /* Read-only API tokens for other tools (server/api-tokens.js): made and revoked by an admin. */
  app.get('/api/tokens', requireUser, requireAdmin, (req, res) => res.set('Cache-Control', 'no-store').json({ tokens: listApiTokens(db) }));
  app.post('/api/tokens', requireUser, requireAdmin, (req, res, next) => {
    try {
      const made = createApiToken(db, req.body || {}, req.user.name || req.user.login);
      audit(db, req.user.id, `API token made: ${made.info.name}${made.info.people ? ' (with people)' : ''}`);
      res.set('Cache-Control', 'no-store').json(made);
    } catch (e) { next(e.status ? new HttpError(e.status, e.message) : e); }
  });
  app.delete('/api/tokens/:id', requireUser, requireAdmin, (req, res) => {
    const t = listApiTokens(db).find(x => x.id === req.params.id);
    if (revokeApiToken(db, req.params.id)) audit(db, req.user.id, `API token revoked: ${t ? t.name : req.params.id}`);
    res.json({ tokens: listApiTokens(db) });
  });
  /* The API itself: Authorization: Bearer nobs_…; wrong tokens count against the address like wrong sign-ins. */
  const apiAuth = (req, res, next) => {
    const keys = ['api:' + (req.ip || '')];
    if (throttle.blocked(keys)) return res.status(429).json({ error: 'Too many wrong tokens. Try again in 15 minutes.' });
    const t = checkApiToken(db, (/^Bearer (.+)$/.exec(req.get('authorization') || '') || [])[1]);
    if (!t) { throttle.recordFailure(keys); return res.status(401).set('WWW-Authenticate', 'Bearer').json({ error: 'A valid API token is needed (Authorization: Bearer nobs_…).' }); }
    req.apiToken = t; res.set('Cache-Control', 'no-store'); next();
  };
  /* GET /api/v1/devices[?format=csv][&status=active][&type=notebook][&q=text]: the inventory's devices, not those in To review. */
  app.get('/api/v1/devices', apiAuth, (req, res) => {
    const s = loadState(db, { history: false }), q = String(req.query.q || '').trim().toLowerCase();
    let list = s.objs.filter(o => !o.review);
    if (req.query.status) list = list.filter(o => o.status === String(req.query.status));
    if (req.query.type) list = list.filter(o => o.type === String(req.query.type));
    if (q) list = list.filter(o => [o.code, o.name, o.serial, o.model, o.ip, o.mac].some(v => v && String(v).toLowerCase().includes(q)));
    const out = list.map(o => apiDevice(o, s, { people: req.apiToken.people }));
    if (req.query.format === 'csv') {
      const cols = ['id', 'code', 'name', 'typeLabel', 'model', 'serial', 'status', 'location', 'ip', 'mac', 'os', 'purchased', 'warranty', ...(req.apiToken.people ? ['user', 'department'] : [])];
      return res.type('text/csv').send('\ufeff' + [cols.join(','), ...out.map(d => cols.map(c => csvCellApi(d[c])).join(','))].join('\r\n'));
    }
    res.json({ count: out.length, devices: out });
  });
  /* GET /api/v1/contracts, /api/v1/licences[?format=csv]; /api/v1/people only for a token made with people. */
  const apiList = (req, res, key, list, cols) => {
    if (req.query.format === 'csv') return res.type('text/csv').send('\ufeff' + [cols.join(','), ...list.map(d => cols.map(c => csvCellApi(Array.isArray(d[c]) ? d[c].join(' ') : d[c])).join(','))].join('\r\n'));
    res.json({ count: list.length, [key]: list });
  };
  app.get('/api/v1/contracts', apiAuth, (req, res) => {
    const s = loadState(db, { history: false });
    apiList(req, res, 'contracts', (s.contracts || []).map(c => apiContract(c, s)), ['id', 'name', 'kind', 'supplier', 'ref', 'start', 'end', 'renewMonths', 'noticeMonths', 'noticeBy', 'state', 'cost', 'per', 'devices']);
  });
  app.get('/api/v1/licences', apiAuth, (req, res) => {
    const s = loadState(db, { history: false });
    apiList(req, res, 'licences', (s.licences || []).map(l => apiLicence(l, s)), ['id', 'name', 'seats', 'used', 'free', 'over', 'cost', 'per', 'end']);
  });
  app.get('/api/v1/people', apiAuth, (req, res) => {
    if (!req.apiToken.people) return res.status(403).json({ error: 'This token was made without people.' });
    const s = loadState(db, { history: false });
    apiList(req, res, 'people', (s.users || []).filter(u => u.source !== 'manual' || u.login !== 'admin').map(u => apiPerson(u, s)), ['id', 'name', 'department', 'active', 'left', 'devices']);
  });
  /* GET /api/v1/devices/INV-0001: one device by inventory number, id or serial number. */
  app.get('/api/v1/devices/:code', apiAuth, (req, res) => {
    const s = loadState(db, { history: false }), k = String(req.params.code);
    const o = s.objs.find(x => !x.review && (x.code === k || x.id === k)) || s.objs.find(x => !x.review && x.serial && x.serial === k);
    if (!o) return res.status(404).json({ error: 'No such device.' });
    res.json(apiDevice(o, s, { people: req.apiToken.people }));
  });
}
