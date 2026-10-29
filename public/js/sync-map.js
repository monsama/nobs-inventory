/* What each source brings into the inventory, in one place. The syncs on the server read their field lists from here
   (feed.js, graph.js, ldap-sync.js), and Settings → Data sources draws its page from it, so the page always says what the
   code does. A field added to a sync is added here, and shows on the page with it. No DOM: the server imports it too. */

export const SOURCE_LABEL = { ls: 'Lansweeper', graph: 'Entra & Intune', ad: 'Active Directory', defender: 'Microsoft Defender', autopilot: 'Windows Autopilot' };

/* Device fields Lansweeper writes, each while Settings → Lansweeper → "Feed may overwrite" allows it, or a person picked
   Lansweeper for it on the device. Otherwise its value is only shown beside the field, to pick from. */
export const LS_FIELDS = ['ip', 'ip6', 'patch', 'mac', 'os', 'model', 'cpu', 'ram', 'fw', 'boot', 'disk', 'av', 'domain', 'mask', 'gateway', 'dns', 'dhcp', 'purchased', 'warranty'];

/* Purchase data Lansweeper fills in while the field is empty (what a person typed always stays): its order number, and
   the price and supplier when the push script is told which of Lansweeper's custom fields hold them. */
export const LS_FILL = { price: 'Price', supplier: 'Supplier', invoice: 'Order / invoice no.' };

/* Device fields Intune fills in while they are empty, or replaces where AD filled them (Settings → Entra & Intune →
   "Fill in empty fields"). A device Intune brought in is kept up to date in full. */
export const GRAPH_FILL = { os: 'Operating system', model: 'Model', mac: 'MAC address', ram: 'Memory', disk: 'Disks' };

/* Device fields the AD computer account fills in while they are empty (Settings → Active Directory → "Fill in empty
   fields"). The location when it names a room here, or a room its text is mapped to in Settings → Locations; with
   "Use the office of the device's user" on there, a device without a location takes its user's office the same way. */
export const AD_FILL = { os: 'Operating system', domain: 'Domain', purpose: 'Description', loc: 'Location' };

/* The names of the fields above, for the server and the page alike. */
export const SYNC_FIELD_LABEL = { ip: 'IP address', ip6: 'IPv6 address', patch: 'Last Windows update', mac: 'MAC address', os: 'Operating system',
  model: 'Model', cpu: 'CPU', ram: 'Memory', fw: 'Firmware', boot: 'Last power event', disk: 'Disks', av: 'Antivirus', domain: 'Domain',
  mask: 'Subnet mask', gateway: 'Gateway', dns: 'DNS servers', dhcp: 'Address from', purchased: 'Purchased', warranty: 'Warranty ends',
  purpose: 'Description', loc: 'Location', price: 'Price', supplier: 'Supplier', invoice: 'Order / invoice no.' };

/* What else each source keeps on a device or brings in, beyond the fields: [what, how]. */
export const SOURCE_EXTRAS = {
  ls: [
    ['New devices', 'Every asset it scans that the inventory does not have: waiting in To review, or added straight away (Settings)'],
    ['Type', 'By the type rules, from its Lansweeper type, model, chassis and Windows role; a type set by hand stays'],
    ['Location', 'Its building and location, as a room here or mapped to one in Settings → Locations; else the room its IP address is in (IP locations), when the device has none'],
    ['Purchase data', 'Order number, and price and supplier from the custom fields the push script is told about; fills empty fields only'],
    ['User', 'The last user, on a device that has nobody assigned yet'],
    ['Network adapters', 'Its further adapters (Wi-Fi, a second network), while Lansweeper writes the IP address'],
    ['Installed software', 'Replaces what it found before; software added by hand stays'],
    ['Attached monitors', 'Monitors it finds on a PC, by their serial numbers'],
    ['Scan status', 'Last scan, last attempt and first seen: "Check by hand" after 3 months without a scan'],
    ['Docking stations', 'With "Merge docking-station records" on: a dock\'s DNS-named record becomes an attachment of its device, by its MAC address'],
  ],
  ad: [
    ['New devices', 'Computer accounts the inventory does not have (disabled ones never): waiting in To review, or added straight away'],
    ['Computer account', 'Last logon, created on, managed by, location and description, services from its SPNs'],
    ['Groups', 'The AD groups of the computer account, to filter by'],
    ['In AD', 'Whether the device has a computer account, shown on the card'],
    ['Locations', 'Its location texts are listed in Settings → Locations, to use as a room (existing or new); free text never becomes a location on its own'],
    ['Responsible', '"Managed by" sets the internal responsible, when a contact here has that name and the device has none yet'],
    ['User office', 'With "Use the office of the device\'s user" on (Settings → Locations): a device without a location takes the room its user\'s office names'],
  ],
  graph: [
    ['New devices', 'Devices in Entra or Intune the inventory does not have: waiting in To review, or added straight away'],
    ['Join state', 'Entra joined, hybrid joined or registered'],
    ['Intune', 'Managed or not, compliance, encryption, last check-in and last sign-in'],
    ['Phones and tablets', 'IMEI, phone number, ownership and free storage'],
    ['Primary user', 'On a device that has nobody assigned yet'],
    ['Serial number', 'When the device has none'],
    ['IDs', 'Entra device ID, object ID and Intune ID, searchable'],
  ],
  defender: [['Security state', 'Health, onboarding, risk score, exposure level, antivirus state and last seen, matched by Entra device ID or name']],
  autopilot: [['Autopilot', 'Group tag, order number, enrollment state and last contact; a device registered but not set up yet is added by its serial number']],
};

/* People: who comes from where. */
export const PEOPLE_SOURCES = [
  ['Active Directory', 'People with their login, name and department, and their card: title, phones, office, manager and e-mail'],
  ['Entra', 'People and their departments, as a reference beside AD (Settings → Entra & Intune)'],
  ['Lansweeper', 'The departments of the people it sees as users, unless "Feed may overwrite" turns that off'],
];

/* Who wins when several sources know a field. */
export const PRECEDENCE = ['A value set by hand, or the source picked for the field on the device', 'Lansweeper (where "Feed may overwrite" allows it)', 'Intune', 'Active Directory'];

/* What is never read, and never written. */
export const NEVER = ['LAPS passwords and BitLocker recovery keys are never read from Active Directory.', 'Nothing is written back: every source is read only.', 'Passwords, tokens and keys stay on the server: never on the page, in backups or in the log.'];
