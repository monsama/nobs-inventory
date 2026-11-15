/* Keeps the server from hanging unnoticed. Docker restarts the container only when the process ends, not when its health
   check fails, so the server ends itself when it is stuck and the restart policy brings it back:
   - a worker thread watches a heartbeat the main thread writes every second; when it stops for longer than
     NI_WATCHDOG_SECONDS (120, 0 turns it off), the work never came back to it (a loop, a lock), and the worker ends the
     process;
   - the health check (/api/health) asks the database too; after HEALTH_FAILS failed checks in a row the process ends.
   Compose runs the app with an init process (init: true), so the end of the server ends the container. */
import { Worker } from 'node:worker_threads';

export const HEALTH_FAILS = 3;
const BEAT_MS = 1000;

/* The worker: reads the heartbeat every second, ends the whole process (not only itself) when it is too old. */
const WORKER = `
const { workerData } = require('node:worker_threads');
const fs = require('node:fs');
const beat = new Int32Array(workerData.buf);
setInterval(() => {
  const age = Math.floor(Date.now() / 1000) - Atomics.load(beat, 0);
  if (age > workerData.limit) {
    try { fs.writeSync(2, new Date().toISOString() + ' watchdog: the server did not answer for ' + age + ' s; it is ended, so it is started again\\n'); } catch {}
    process.kill(process.pid, 'SIGKILL');
  }
}, 1000);
`;

/* Starts the watchdog; returns a function that stops it (for tests and a clean close). */
export function startWatchdog(env = process.env) {
  const limit = env.NI_WATCHDOG_SECONDS === undefined ? 120 : Number(env.NI_WATCHDOG_SECONDS);
  if (!(limit > 0)) return () => {};
  const buf = new SharedArrayBuffer(4), beat = new Int32Array(buf);
  const tick = () => Atomics.store(beat, 0, Math.floor(Date.now() / 1000));
  tick();
  const timer = setInterval(tick, BEAT_MS); timer.unref();
  const worker = new Worker(WORKER, { eval: true, execArgv: [], workerData: { buf, limit: Math.max(limit, 2) } });
  worker.unref();
  worker.on('error', e => console.log('watchdog stopped:', e.message));
  return () => { clearInterval(timer); worker.terminate(); };
}

/* The health check's answer: the database answers a query, else a failure is counted; HEALTH_FAILS in a row end the
   process (exit is given, for tests). */
export function healthCheck(db, { exit = code => process.exit(code), log = console.log } = {}) {
  let fails = 0;
  return () => {
    try { db.prepare('SELECT 1').get(); fails = 0; return true; }
    catch (e) {
      fails++;
      log(`health check: the database did not answer (${fails} of ${HEALTH_FAILS}): ${e.message}`);
      if (fails >= HEALTH_FAILS) { log('health check: ended, so the server is started again'); exit(1); }
      return false;
    }
  };
}
