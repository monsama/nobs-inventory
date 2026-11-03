/* Entry sheets (admins) and reports as PDF or Excel files (everyone signed in). Split out of app.js. */
import { audit } from './db.js';
import { scopeOf, scopeState } from './scope.js';
import { loadState } from './state.js';
import { sheetPdf } from './sheet-pdf.js';
import { reportPdf, reportXlsx } from './report-files.js';
import { buildReport, reportOptions } from '../public/js/reports.js';
import { PASSWORD_DAYS, createSheet, deleteSheet, getSheet, listSheets, markChanged, purgePasswords } from './sheets.js';
import { HttpError } from './errors.js';

export function registerSheetRoutes(app, ctx) {
  const { db, requireUser, requireAdmin, SHEET_KEY } = ctx;
  /* Entry sheets: admins only. The password is in the answer that makes the sheet and in a re-download until it is
     marked as changed or PASSWORD_DAYS have passed; it is never written to the log. */
  app.get('/api/sheets', requireUser, requireAdmin, (req, res, next) => {
    try { purgePasswords(db, SHEET_KEY); res.json({ sheets: listSheets(db, String(req.query.user || '')), passwordDays: PASSWORD_DAYS }); } catch (e) { next(e); }
  });
  /* Reports (public/js/reports.js) as a PDF or an Excel workbook, for everyone signed in: what the pages show anyway. */
  /* POST: the same, for the devices the page lists filtered (their ids in the body, too many for an address). */
  const report = async (req, res, next) => {
    try {
      const opts = reportOptions({ ...req.query, ...(req.method === 'POST' ? { ids: (req.body || {}).ids } : {}), kind: req.params.kind });
      if (opts.kind !== req.params.kind) throw new HttpError(404, 'No such report.');
      const s = scopeState(loadState(db), scopeOf(req.user)), r = buildReport(s, opts);
      const day = new Date().toISOString().slice(0, 10), base = `nobs-${opts.kind}${opts.kind === 'costs' ? '-' + opts.year : ''}${opts.kind === 'handback' ? '-' + opts.id.replace(/[^\w-]/g, '_') : ''}-${day}`;
      if (opts.kind === 'stocktake' && !(s.stocktakes || []).some(t => t.id === opts.id && t.finished)) throw new HttpError(404, 'No such stocktake.');
      if (opts.kind === 'handback' && !s.users.some(u => String(u.id) === opts.id)) throw new HttpError(404, 'No such person.');
      res.set('Cache-Control', 'no-store');
      if (req.query.format === 'xlsx') {
        res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').attachment(`${base}.xlsx`).send(reportXlsx(r));
      } else {
        res.type('application/pdf').attachment(`${base}.pdf`).send(await reportPdf(r, s.company || {}));
      }
      audit(db, req.user.id, `report made: ${r.title} (${req.query.format === 'xlsx' ? 'Excel' : 'PDF'}${opts.ids ? ', filtered list' : ''})`);
    } catch (e) { next(e); }
  };
  app.get('/api/reports/:kind', requireUser, report);
  app.post('/api/reports/:kind', requireUser, report);
  app.post('/api/sheets', requireUser, requireAdmin, (req, res, next) => {
    try {
      const made = createSheet(db, SHEET_KEY, loadState(db), req.body || {}, req.user.name || req.user.login || '');
      audit(db, req.user.id, `entry sheet ${made.id} made for ${made.sheet.person.name} (${made.sheet.devices.length} devices${made.sheet.password ? '' : ', no password'})`);
      res.json(made);
    } catch (e) { next(e); }
  });
  app.get('/api/sheets/:id', requireUser, requireAdmin, (req, res, next) => {
    res.set('Cache-Control', 'no-store');   /* the answer may hold the password: no browser or proxy keeps it */
    try { purgePasswords(db, SHEET_KEY); const s = getSheet(db, SHEET_KEY, req.params.id); audit(db, req.user.id, `entry sheet ${s.id} opened`); res.json(s); } catch (e) { next(e); }
  });
  /* The sheet as a PDF, with the company's name and logo. It holds the password while the kept sheet does. */
  app.get('/api/sheets/:id/pdf', requireUser, requireAdmin, async (req, res, next) => {
    try {
      purgePasswords(db, SHEET_KEY);
      const s = getSheet(db, SHEET_KEY, req.params.id);
      const pdf = await sheetPdf(s.sheet, loadState(db).company || {});
      audit(db, req.user.id, `entry sheet ${s.id} downloaded as PDF`);
      const file = `entry-sheet-${s.sheet.person.name.normalize('NFKD').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${String(s.sheet.issued).slice(0, 10)}.pdf`;
      res.type('application/pdf').attachment(file).set('Cache-Control', 'no-store').send(pdf);
    } catch (e) { next(e); }
  });
  app.post('/api/sheets/:id/changed', requireUser, requireAdmin, (req, res, next) => {
    try { markChanged(db, SHEET_KEY, req.params.id); audit(db, req.user.id, `entry sheet ${req.params.id}: password marked as changed, removed from the sheet`); res.json({ ok: true }); } catch (e) { next(e); }
  });
  app.delete('/api/sheets/:id', requireUser, requireAdmin, (req, res, next) => {
    try { deleteSheet(db, req.params.id); audit(db, req.user.id, `entry sheet ${req.params.id} deleted`); res.json({ ok: true }); } catch (e) { next(e); }
  });
}
