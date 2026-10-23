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
