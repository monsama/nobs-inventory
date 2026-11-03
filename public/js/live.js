/* Live updates: the server says over api/events (Server-Sent Events) when anything was saved, with the running number of
   that save and nothing else. The page then checks for changes as it always does (checkForChanges): it asks for what
   changed since its copy, which holds back while there are unsaved edits, a dialog or typing. Polling stays as the
   fallback: every 15 seconds while the stream is down, every 2 minutes while it is open. */
import { SERVER, checkForChanges } from './07-render.js';

const SLOW_POLL_MS = 120000, RETRY_MS = 60000, HELD_MS = 3000;
let source = null, retry = null, held = null, want = 0, running = false, again = false, lastPoll = 0;

export const liveOpen = () => !!source && source.readyState === 1;   /* EventSource.OPEN */

/* Catches up to the newest number heard. Held back: tried again shortly, until the page is free. */
async function catchUp(){
  clearTimeout(held); held = null;
  if (SERVER.cseq !== null && SERVER.cseq !== undefined && SERVER.cseq >= want) return;
  if (running){ again = true; return; }
  running = true;
  let ran = true;
  try { ran = await checkForChanges(); } finally { running = false; }
  if (again){ again = false; return catchUp(); }
  if (ran === false) held = setTimeout(catchUp, HELD_MS);
}

/* Opens the event stream, once and only where the browser has EventSource. Each number heard starts a catch-up;
   a stream the server closed is opened again after RETRY_MS. */
export function startLive(){
  if (source || typeof EventSource !== 'function') return;
  clearTimeout(retry); retry = null;
  source = new EventSource('api/events');
  source.onmessage = e => { const n = Number(e.data); if (Number.isInteger(n) && n >= 0){ want = Math.max(want, n); catchUp(); } };
  /* A dropped connection is tried again by the browser; a refused one (signed out, too many open) closes, and is tried
     again later while polling carries on. */
  source.onerror = () => {
    if (!source || source.readyState !== 2) return;   /* EventSource.CLOSED */
    source = null;
    retry = setTimeout(startLive, RETRY_MS);
  };
}
/* Closes the stream (tests, or a page that wants only polling). */
export function stopLive(){
  clearTimeout(retry); retry = null; clearTimeout(held); held = null;
  if (source){ source.close(); source = null; }
}
/* The timer's check: each time while the stream is down, now and then while it is open. */
export function pollForChanges(){
  if (liveOpen() && Date.now() - lastPoll < SLOW_POLL_MS) return;
  lastPoll = Date.now();
  checkForChanges();
}
