/* Whether Intune manages a device, from the management agent Microsoft Graph reports for it. Shared by the server
   (which reads Graph) and the page (which shows it). No browser code here.

   Intune's device list also holds devices it does not manage: ones only onboarded to Defender for Endpoint
   (msSense), only in Configuration Manager, only syncing mail (Exchange ActiveSync) or managed by Jamf. Those are
   not Intune-managed, and they have no compliance of Intune's. */
export const INTUNE_AGENTS = ['mdm', 'easMdm', 'intuneClient', 'easIntuneClient', 'configurationManagerClientMdm',
  'configurationManagerClientMdmEas', 'microsoft365ManagedMdm', 'intuneAosp', 'windowsManagementCloudApi'];
const OTHER_AGENTS = { msSense: 'Defender for Endpoint only', configurationManagerClient: 'Configuration Manager only',
  eas: 'Exchange ActiveSync only', jamf: 'Jamf', googleCloudDevicePolicyController: 'Google device policy' };
/* What a record's managed field says: 'Intune' for Intune; anything else names who manages it, or is empty. Older
   syncs kept the raw agent (mdm, msSense), which is read the same way. */
export const isIntune = managed => managed === 'Intune' || INTUNE_AGENTS.includes(managed);
export const managedBy = agent => INTUNE_AGENTS.includes(agent) ? 'Intune' : (OTHER_AGENTS[agent] || '');
export const otherManager = managed => isIntune(managed) ? '' : (OTHER_AGENTS[managed] || (managed && !/^unknown$/i.test(managed) ? managed : ''));
/* Which source each date of a device's Graph record belongs to, for "last seen". lastCheckIn is the check-in of the
   device's manager in Intune's list: Intune's own only when Intune manages it, else that manager's (Configuration
   Manager, Defender …). lastSignIn is Entra's sign-in. lastSync is either, depending on the record: Intune's check-in
   for a device Intune manages (with Entra's sign-in when Intune has none), Entra's sign-in for one Intune does not
   list. So a device only in Entra is never shown as seen by Intune, and one Intune manages never as seen by Entra on
   Intune's date. Returns [[source, date], ...] with only the dates there are. */
export function graphSeen(g){
  if (!g || g.gone) return [];
  const intune = isIntune(g.managed), out = [];
  const check = g.lastCheckIn || (intune && !g.lastSignIn ? g.lastSync : '');
  if (check) out.push([intune ? 'Intune' : (otherManager(g.managed) || 'MDM').replace(/ only$/, ''), check]);
  const signIn = g.lastSignIn || (!intune ? g.lastSync : '');
  if (signIn) out.push(['Entra', signIn]);
  return out;
}

/* The system Intune reports, named the way Active Directory names it. Intune gives Windows as "Windows" and its build
   (10.0.26200.9711), and Windows 11 kept the version 10.0: from build 22000 on it is Windows 11, so it reads
   "Windows 11 (10.0.26200.9711)" next to AD's "Windows 11 Pro (10.0.26200)". Other systems stay as Intune writes them
   (iOS 18.1, Android 15). */
export function graphOsName(os, version, entraOs = ''){
  const name = String(os || '').trim(), ver = String(version || '').trim();
  const build = /^windows$/i.test(name) ? /^10\.0\.(\d+)/.exec(ver) : null;
  /* A server shares its build numbers with Windows 10 and 11 (Server 2025 and Windows 11 24H2 are both 26100): it is
     named a server when Entra says so, or by a build only servers have (20348, Server 2022), never Windows 10 or 11. */
  if (build && (/server/i.test(String(entraOs || '')) || +build[1] === 20348)) return `Windows Server (${ver})`;
  if (build) return `Windows ${+build[1] >= 22000 ? '11' : '10'} (${ver})`;
  return [name, ver].filter(Boolean).join(' ');
}
