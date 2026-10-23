/* Brings older data up to the current types. Phones and tablets are now three types: Android Device, IOS Device and
   Other Mobile Device. Racks used to be a list in the settings; now each rack is an object of type rack, with the same
   id, so the devices mounted in it keep their place. Running it again changes nothing. */
const TYPE_RENAMES = { iphone: 'ios', tablet: 'mobile', smartphone: 'mobile' };

/* Changes s in place and returns true when anything was changed. */
export function migrateState(s) {
  let changed = false;
  for (const o of s.objs) if (TYPE_RENAMES[o.type]) { o.type = TYPE_RENAMES[o.type]; changed = true; }
  for (const [name, type] of Object.entries(s.typeMap || {})) if (TYPE_RENAMES[type]) { s.typeMap[name] = TYPE_RENAMES[type]; changed = true; }
  for (const old of Object.keys(TYPE_RENAMES)) if (s.types && s.types[old]) { delete s.types[old]; changed = true; }
  if (s.types && s.types.android && s.types.android.label === 'Android phone') { delete s.types.android; changed = true; }
  for (const r of Array.isArray(s.racks) ? s.racks : []) {
    if (s.objs.some(o => o.id === r.id)) continue;
    s.codeN = (s.codeN || 0) + 1;
    s.objs.push({ id: r.id, code: 'INV-' + String(s.codeN).padStart(4, '0'), type: 'rack', name: r.name, status: 'active', loc: r.loc || '', units: r.units || 42, ovr: {} });
    changed = true;
  }
  if (Array.isArray(s.racks) && s.racks.length) { s.racks = []; changed = true; }
  return changed;
}
