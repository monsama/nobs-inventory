/* The names of the built-in device types, for what the server writes (reports, entry sheets) and the page alike; a type
   renamed in Settings → Device types (s.types) wins. No DOM here. */
export const TYPE_LABELS = { pc: 'PC', notebook: 'Notebook', camera: 'Camera / Recorder', bmc: 'iLO / iDRAC', server: 'Server', vm: 'Server (virtual)', accesspoint: 'Access point', sip: 'VoIP phone', pbx: 'Telephone system',
  monitor: 'Monitor', switch: 'Switch', printer: 'Printer', patch: 'Patch panel', router: 'Router', firewall: 'Firewall', modem: 'Modem', storage: 'Storage',
  android: 'Android device', ios: 'iOS device', mobile: 'Other mobile device', plc: 'PLC / Controller', rack: 'Rack', other: 'Other' };
/* A device's type as text: its type's name, "(virtual)" after it for a virtual machine (Kind) on a server or a PC. */
export function typeLabelOf(d, types = {}) {
  const t = d && d.type, l = (types && types[t] && types[t].label) || TYPE_LABELS[t] || t || '';
  return d && d.kind === 'vm' && (t === 'server' || t === 'pc') ? `${l} (virtual)` : l;
}
