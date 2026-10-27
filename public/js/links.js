/* Links on a device: its web interface, a share with its files, a remote console, documentation it hosts. Each is a
   label and an address (o.urls). Shared by the page and the server, which checks them with linksProblem. */
/* The kinds of address a link may be: web pages, remote access and file transfer. Anything else (javascript:, data:)
   could run in the page, so it is refused. A Windows share is written as \\server\share. */
export const LINK_SCHEMES = ['https:', 'http:', 'ssh:', 'rdp:', 'vnc:', 'smb:', 'ftp:', 'sftp:', 'telnet:'];
export const LINK_MAX = 20;
const UNC = /^\\\\[^\\/\s]+(\\[^\\]*)*$/;
export const isShare = url => UNC.test(String(url || ''));

export function linkProblem(l) {
  if (!l || typeof l !== 'object' || Array.isArray(l)) return 'A link is a record.';
  if (l.label !== undefined && (typeof l.label !== 'string' || l.label.length > 60)) return 'A link\'s label is text of up to 60 characters.';
  const url = typeof l.url === 'string' ? l.url.trim() : '';
  if (!url || url.length > 500) return 'A link needs an address of up to 500 characters.';
  if (isShare(url)) return null;
  let u;
  try { u = new URL(url); } catch { return `${url} is not an address. Write it with its beginning, such as https://10.0.0.5 or \\\\server\\share.`; }
  if (!LINK_SCHEMES.includes(u.protocol)) return `${u.protocol} links are not allowed: use ${LINK_SCHEMES.map(s => s.slice(0, -1)).join(', ')} or a share (\\\\server\\share).`;
  return null;
}
export function linksProblem(list) {
  if (!Array.isArray(list)) return 'The links are a list.';
  if (list.length > LINK_MAX) return `At most ${LINK_MAX} links on a device.`;
  for (const l of list) { const p = linkProblem(l); if (p) return p; }
  return null;
}
/* What a link is, for its mark: Web, SSH, RDP, VNC, Share, FTP. */
export function linkKind(url) {
  if (isShare(url)) return 'Share';
  const p = (/^([a-z]+):/i.exec(url) || [])[1]?.toLowerCase();
  return { https: 'Web', http: 'Web', ssh: 'SSH', rdp: 'RDP', vnc: 'VNC', smb: 'Share', ftp: 'FTP', sftp: 'SFTP', telnet: 'Telnet' }[p] || 'Link';
}
/* The address a click opens: a share as file:// (browsers may only allow copying it), anything else as written. */
export const linkHref = url => isShare(url) ? 'file://' + url.slice(2).replace(/\\/g, '/') : url;
