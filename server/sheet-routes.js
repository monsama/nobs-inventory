/* Entry sheets (admins) and reports as PDF or Excel files (everyone signed in). Split out of app.js. */
import { audit } from './db.js';
import { scopeOf, scopeState } from './scope.js';
import { loadState, settingOf } from './state.js';
import { sheetPdf } from './sheet-pdf.js';
import { reportPdf, reportXlsx } from './report-files.js';
import { buildReport, reportOptions } from '../public/js/reports.js';
import { PASSWORD_DAYS, createSheet, deleteSheet, getSheet, listSheets, markChanged, purgePasswords } from './sheets.js';
import { HttpError } from './errors.js';

/* Adds the entry sheets for admins (/api/sheets: list, make, open, PDF, password marked as changed, delete) and the
   report files for everyone signed in (GET or POST /api/reports/:kind, a PDF or ?format=xlsx, cut to what the person
   may see). Passwords past their days are removed before a sheet is read. */
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
  /* A list the page shows (the IP addresses, the devices of the Table with its columns), as a PDF (A4 landscape) or an
     Excel workbook: the page sends its columns and rows, cut to what that person sees there, and gets the file back.
     Only known lists, with their own title and limits; plain text, cells of up to 120 characters (60 in a PDF, 500 in
     the device list, whose notes and descriptions run longer); nothing is kept. A PDF is laid out at once on the server,
     so it holds at most 1000 rows (about a second's work), one at a time for each person and two at a time in all. The
     device list is Excel only (the Table prints itself), with as many columns as the Table has. Excel cells are inline
     text: a cell starting with = is never a formula. */
  const LISTS = { ips: { title: 'IP addresses', cols: 12, cell: 120, pdf: true }, devices: { title: 'Devices', cols: 80, cell: 500, pdf: false } }, making = new Set();
  app.post('/api/reports/list', requireUser, async (req, res, next) => {
    const pdf = req.query.format !== 'xlsx', who = String(req.user.id);
    try {
      const b = req.body || {}, clean = v => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '').replace(/[\s\S]/g, ch => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 ? ' ' : ch);
      const L = Object.hasOwn(LISTS, b.list) ? LISTS[b.list] : null;
      if (!L) throw new HttpError(404, 'No such list.');
      const title = L.title;
      if (pdf && !L.pdf) throw new HttpError(400, 'This list is made as an Excel file only.');
      if (!Array.isArray(b.columns) || !b.columns.length || b.columns.length > L.cols) throw new HttpError(400, `A list has 1 to ${L.cols} columns.`);
      const maxRows = pdf ? 1000 : 20000;
      if (!Array.isArray(b.rows) || b.rows.length > maxRows) throw new HttpError(400, `A list ${pdf ? 'as a PDF ' : ''}has up to ${maxRows} rows${pdf ? ': take Excel for more' : ''}.`);
      /* The workbook is written in one go: at most 400 000 cells (10 000 devices with 40 columns), so one file does not
         hold up the server for the others. */
      if (b.rows.length * b.columns.length > 400000) throw new HttpError(400, `That is ${b.rows.length} rows of ${b.columns.length} columns: show fewer columns or filter the list, up to 400 000 cells.`);
      /* The text of a list is bounded as a whole as well (an IP list is far below), before any work is done on it. */
      let chars = 0;
      for (const r of b.rows) if (Array.isArray(r)) for (const v of r.slice(0, L.cols)) chars += typeof v === 'string' ? Math.min(v.length, L.cell) : 8;
      if (chars > 2e7) throw new HttpError(413, 'The list is too large to export.');
      /* One file at a time for each person and two at a time in all, PDF or Excel. */
      if (making.has(who) || making.size >= 2) throw new HttpError(429, 'A file is being made already. Try again in a moment.');
      const columns = b.columns.map(c => ({ label: clean(c && c.label).slice(0, 60) || '-', w: Math.min(4, Math.max(0.3, Number(c && c.w) || 1)) }));
      const rows = b.rows.map(r => columns.map((_, i) => clean(Array.isArray(r) ? r[i] : '').slice(0, pdf ? 60 : L.cell)));
      const name = String(b.name || b.list).replace(/[^\w-]/g, '').slice(0, 40) || b.list;
      const r = { title, subtitle: clean(b.subtitle).slice(0, 300), columns, groups: [{ name: '', rows }] };
      const base = `nobs-${name}-${new Date().toISOString().slice(0, 10)}`;
      res.set('Cache-Control', 'no-store');
      making.add(who);
      try {
        if (!pdf) res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').attachment(`${base}.xlsx`).send(reportXlsx(r));
        else res.type('application/pdf').attachment(`${base}.pdf`).send(await reportPdf(r, settingOf(db, 'company') || {}));
      } finally { making.delete(who); }
      audit(db, req.user.id, `report made: ${title} (${pdf ? 'PDF' : 'Excel'}, ${rows.length} rows)`);
    } catch (e) { next(e); }
  });
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
