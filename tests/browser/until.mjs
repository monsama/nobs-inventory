/* Waits until a check in the page is true. The check may be async (for example it reads the server): Playwright's own
   waitForFunction does not wait for a promise, so this polls and awaits each result. */
export async function until(page, check, arg = null, opts = {}) {
  const timeout = opts.timeout ?? 10000;
  const interval = opts.polling ?? 100;
  const end = Date.now() + timeout;
  for (;;) {
    if (await page.evaluate(check, arg)) return true;
    if (Date.now() > end) throw new Error('timed out waiting for: ' + check.toString().slice(0, 140));
    await new Promise(r => setTimeout(r, interval));
  }
}

/* Waits until what the server stored passes a check. A save lands in steps (a change, then its undo, then the next
   one), so a check that throws on an in-between state (a field not there yet) counts as not yet, not as a failure; on
   timeout the last error is said. read() gives the stored state (loadState(db)). */
export async function storedBy(read, check, ms = 8000) {
  const end = Date.now() + ms;
  let last;
  for (;;) {
    last = null;
    try { if (check(read())) return true; } catch (e) { last = e; }
    if (Date.now() > end) throw new Error('not saved in time' + (last ? ': ' + last.message : ': ' + check.toString().slice(0, 140)));
    await new Promise(r => setTimeout(r, 100));
  }
}

/* The same for any check, also async (it may ask the page or the server): true in time, or the last error said. */
export async function eventually(check, ms = 8000) {
  const end = Date.now() + ms;
  let last;
  for (;;) {
    last = null;
    try { if (await check()) return true; } catch (e) { last = e; }
    if (Date.now() > end) throw new Error('not in time' + (last ? ': ' + last.message : ': ' + check.toString().slice(0, 140)));
    await new Promise(r => setTimeout(r, 100));
  }
}
