/* When each sync last ran and how it went, for the Sync button: Lansweeper (its API sync or its push), the directory and
   Microsoft Graph. Kept as the setting syncRuns, written on its own (not through a full save), so a sync never touches
   what a page is saving meanwhile. Only numbers and a short error are kept: never data of a device or a person. */
const SOURCES = ['lansweeper', 'ldap', 'graph'];
const bumpRev = db => db.prepare("INSERT INTO revs (kind, id, rev) VALUES ('setting', 'syncRuns', 1) ON CONFLICT(kind, id) DO UPDATE SET rev = rev + 1").run();

/* The counts a sync answered with, numbers only (nested ones, like people, left out). */
const numbersOf = counts => Object.fromEntries(Object.entries(counts || {}).filter(([, v]) => typeof v === 'number' && Number.isFinite(v)).slice(0, 20));

export function recordSync(db, src, { ok, counts = null, error = '', how = '' }, now = new Date()) {
  if (!SOURCES.includes(src)) return;
  const r = db.prepare("SELECT data FROM docs WHERE kind = 'setting' AND id = 'syncRuns'").get();
  const runs = r ? JSON.parse(r.data) : {};
  runs[src] = { at: now.toISOString(), ok: !!ok, ...(how ? { how } : {}), ...(ok ? { counts: numbersOf(counts) } : { error: String(error || 'failed').slice(0, 300) }) };
  db.prepare("INSERT INTO docs (kind, id, data) VALUES ('setting', 'syncRuns', ?) ON CONFLICT(kind, id) DO UPDATE SET data = excluded.data").run(JSON.stringify(runs));
  bumpRev(db);
}

/* Runs a sync and records how it went; the sync's answer or error passes through unchanged. */
export async function runRecorded(db, src, fn, how = '') {
  try {
    const counts = await fn();
    recordSync(db, src, { ok: true, counts, how });
    return counts;
  } catch (e) {
    recordSync(db, src, { ok: false, error: e.message, how });
    throw e;
  }
}

/* The last Test connection of the directory and of Microsoft Graph, kept as the setting testRuns: when, whether it
   passed, and what it said (counts or the error, never a password or a key), so the source's tab still says it after a
   reload and the setup steps can tick off the permissions without waiting for a sync. */
export function recordTest(db, src, { ok, text = '' }, now = new Date()) {
  if (!SOURCES.includes(src)) return null;
  const r = db.prepare("SELECT data FROM docs WHERE kind = 'setting' AND id = 'testRuns'").get();
  const runs = r ? JSON.parse(r.data) : {};
  runs[src] = { at: now.toISOString(), ok: !!ok, text: String(text || '').slice(0, 300) };
  db.prepare("INSERT INTO docs (kind, id, data) VALUES ('setting', 'testRuns', ?) ON CONFLICT(kind, id) DO UPDATE SET data = excluded.data").run(JSON.stringify(runs));
  db.prepare("INSERT INTO revs (kind, id, rev) VALUES ('setting', 'testRuns', 1) ON CONFLICT(kind, id) DO UPDATE SET rev = rev + 1").run();
  return runs[src];
}
