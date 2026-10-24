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
  /* Relation kinds: patched is a connection to a patch panel, docked is attached, and a downlink is the uplink seen from its
     other end, so it is stored as that uplink. A downlink whose uplink is already there is dropped. Its port is not kept. */
  if (Array.isArray(s.rels)) {
    const kinds = { patched: 'connected', docked: 'attached' };
    for (const r of s.rels) if (kinds[r.kind]) { r.kind = kinds[r.kind]; changed = true; }
    const uplinks = new Set(s.rels.filter(r => r.kind === 'uplink').map(r => r.from + '|' + r.to));
    s.rels = s.rels.flatMap(r => {
      if (r.kind !== 'downlink') return [r];
      changed = true;
      if (uplinks.has(r.to + '|' + r.from)) return [];
      uplinks.add(r.to + '|' + r.from);
      return [{ ...r, from: r.to, to: r.from, kind: 'uplink', port: null }];
    });
  }
  /* Notes were one text box; now they are entries (a title, a text and an optional link). An old note becomes the first entry. */
  for (const o of s.objs) if (typeof o.notes === 'string') {
    if (o.notes.trim()) o.entries = [{ title: 'Note', text: o.notes.slice(0, 2000) }, ...(Array.isArray(o.entries) ? o.entries : [])];
    delete o.notes; changed = true;
  }
  /* The attachments of a PC were one text; each line (or comma) is now an accessory. */
  for (const o of s.objs) if (typeof o.attach === 'string') {
    const names = o.attach.split(/[\n,]/).map(x => x.trim().slice(0, 120)).filter(Boolean);
    if (names.length) o.accessories = [...names.map(name => ({ name })), ...(Array.isArray(o.accessories) ? o.accessories : [])];
    delete o.attach; changed = true;
  }
  /* A connection's VLAN id saved as text ("8") becomes a number. A value that is not a VLAN id (a whole number from 1 to 4094)
     is cleared, so an old bad value cannot stop the server from starting. */
  for (const r of Array.isArray(s.rels) ? s.rels : []) if (r.vlan != null) {
    const id = typeof r.vlan === 'string' && /^\s*\d+\s*$/.test(r.vlan) ? Number(r.vlan) : r.vlan;
    const valid = Number.isInteger(id) && id >= 1 && id <= 4094;
    if (id !== r.vlan || !valid) { r.vlan = valid ? id : null; changed = true; }
  }
  /* A connection can name a VLAN the list does not have yet (entered before the list existed): it is added to the list. */
  for (const r of Array.isArray(s.rels) ? s.rels : []) if (Number.isInteger(r.vlan) && !(s.vlans || []).some(v => v.vid === r.vlan)) {
    s.vlans = [...(s.vlans || []), { vid: r.vlan, name: 'VLAN ' + r.vlan }]; changed = true;
  }
  /* Lansweeper's update text (a KB number) was stored in the field that is now the commissioning date. It is cleared on synced devices. */
  for (const o of s.objs) if (o.feed && typeof o.patch === 'string' && /^KB\d+/i.test(o.patch.trim())) { delete o.patch; changed = true; }
  return changed;
}
