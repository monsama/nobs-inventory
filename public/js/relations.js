/* Which device may be related to which, and how. One rule for New device, Link device, the Relations panel, a type
   change and the server, so they never disagree. No DOM: the server uses it too.
   - attached: a monitor or accessory on a computer, server or phone ("attached to")
   - hosted: a virtual machine on a physical server ("runs on")
   - connected: a device plugged into a port of a switch, router, firewall, patch panel, phone or computer ("plugged into")
   - uplink: a switch, router or firewall (or a panel's trunk) to the one above it
   - patched: a patch cord from a panel port to a switch port (cabling.js checks it) */
export const NET_GEAR = ['switch', 'router', 'firewall'];
export const HOST_KINDS = ['attached', 'hosted'];
export const isVm = o => !!o && (o.type === 'vm' || (o.type === 'server' && o.kind === 'vm'));
const ported = o => !!o && o.type !== 'patch' && (['switch', 'router', 'firewall', 'server'].includes(o.type) || o.ports > 0);
/* Other too: a docking station is kept as Other, and its monitors are attached to it. */
const ATTACH_TO = ['pc', 'notebook', 'server', 'android', 'ios', 'mobile', 'other'];
const NOT_ATTACHED = ['rack', 'patch', 'server', 'vm', ...NET_GEAR];
const PLUG_INTO = ['sip', 'pc', 'notebook', 'patch', 'pbx'];

/* Whether a relation of this kind fits these two types: '' when it does, else why not, in words for the user. */
export function kindProblem(kind, from, to){
  const a = from.name || 'This device', b = to.name || 'that device';
  if (kind === 'attached') return !NOT_ATTACHED.includes(from.type) && ATTACH_TO.includes(to.type) && !isVm(to) ? ''
    : `${a} cannot be attached to ${b}: a monitor or accessory is attached to a computer, a physical server, a phone or a docking station (Other).`;
  if (kind === 'hosted') return isVm(from) && to.type === 'server' && !isVm(to) ? '' : `${a} cannot run on ${b}: a virtual machine runs on a physical server.`;
  if (kind === 'connected') return !isVm(from) && from.type !== 'rack' && (ported(to) || PLUG_INTO.includes(to.type)) ? ''
    : `${a} cannot be plugged into ${b}: a device is plugged into a switch, router, firewall, patch panel, phone or computer.`;
  if (kind === 'uplink') return [...NET_GEAR, 'patch', 'accesspoint'].includes(from.type) && NET_GEAR.includes(to.type) ? ''
    : `${a} cannot have an uplink to ${b}: an uplink joins a switch, router or firewall to the one above it.`;
  if (kind === 'patched') return '';
  return `A relation has an unknown kind: ${kind}.`;
}
/* A device has one host (attached to, or runs on), and a host is not itself attached or hosted: no chains, no loops,
   no monitor on two computers. rels are all relations; skip is the one being changed (left out of the count). */
export function hostProblem(kind, from, to, rels, skip = null){
  if (!HOST_KINDS.includes(kind)) return '';
  const others = rels.filter(r => r !== skip && HOST_KINDS.includes(r.kind) && !(skip && r.id === skip.id));
  if (others.some(r => r.from === from.id)) return `${from.name} is already attached to or running on another device.`;
  if (others.some(r => r.from === to.id)) return `${to.name} is itself attached to or running on another device.`;
  if (others.some(r => r.to === from.id)) return `Devices are attached to or run on ${from.name}, so it is not attached to anything itself.`;
  return '';
}
/* Everything about one relation: '' when it may be made (or kept, for skip). */
export function relationProblem(kind, from, to, rels = [], skip = null){
  if (!from || !to) return 'A relation points at a device that is not in the inventory.';
  if (from.id === to.id) return 'A device cannot be related to itself.';
  return kindProblem(kind, from, to) || hostProblem(kind, from, to, rels, skip);
}
/* The kind a new device of this type gets to the device it is put on: network gear on network gear is an uplink. */
export const linkKind = (from, to) => isVm(from) ? 'hosted' : from.type === 'monitor' ? 'attached'
  : NET_GEAR.includes(from.type) && to && NET_GEAR.includes(to.type) ? 'uplink' : 'connected';
/* A relation that carries a port: the port box is shown and checked only for these. */
export const PORT_KINDS = ['connected', 'uplink'];
