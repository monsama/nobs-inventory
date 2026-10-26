import { seedDb, tmpFile } from './seed.mjs';
import { loadState } from '../server/state.js';
for (const sw of [0, 40]) {
  const { db } = seedDb(tmpFile(), { sw });
  const s = loadState(db);
  const j = JSON.stringify(s);
  const parts = { objs: JSON.stringify(s.objs).length, rels: JSON.stringify(s.rels).length, users: JSON.stringify(s.users).length, history: JSON.stringify(s.history).length, revs: JSON.stringify(s.revs).length };
  console.log('sw', sw, 'total MB', (j.length / 1e6).toFixed(2), Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, (v / 1e6).toFixed(2)])));
}
