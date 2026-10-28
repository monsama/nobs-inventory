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
