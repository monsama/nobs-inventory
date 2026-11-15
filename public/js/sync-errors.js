/* What a failed sync's error means, in one sentence that says what to do: the directory refusing the service password,
   Microsoft refusing the app's certificate, an ID that names nothing, a permission not granted, a server that cannot be
   reached or a certificate not trusted. The raw error stays beside it. Shared by Health, the weekly e-mail, the notices
   and the source's tab; no browser code here. src: 'lansweeper', 'ldap' or 'graph'. */
/** @type {[string, RegExp, string][]} */
const RULES = [
  ['ldap', /invalid ?credentials|\b52e\b|code:? ?49\b/i, 'The directory refused the service account or its password: check both in Settings → Active Directory (Service password: Replace), then Test connection.'],
  ['ldap', /\b775\b|account.*locked/i, 'The service account is locked in Active Directory: unlock it there, then Test connection.'],
  ['ldap', /\b533\b|account.*disabled/i, 'The service account is disabled in Active Directory: enable it there, then Test connection.'],
  ['ldap', /\b532\b|\b773\b|password.*(expired|must change)/i, 'The service account\'s password has expired in Active Directory: set a new one there and save it in Settings → Active Directory.'],
  ['graph', /AADSTS700027|AADSTS700024|invalid signature|certificate.*(not|n't).*(found|registered)/i, 'Microsoft did not accept the app\'s certificate: upload the .cer from Settings → Entra & Intune to the app registration in Entra (Certificates & secrets), or make a new one if it has expired.'],
  ['graph', /AADSTS700016|application.*not found/i, 'The application (client) ID names no app in this tenant: copy it again from the app\'s Overview page in Entra into Settings → Entra & Intune.'],
  ['graph', /AADSTS90002|AADSTS900023|tenant.*not found/i, 'The directory (tenant) ID names no tenant: copy it again from the app\'s Overview page in Entra into Settings → Entra & Intune.'],
  ['graph', /AADSTS7000112|disabled/i, 'The app registration is disabled in Entra: enable it there, then Test connection.'],
  ['graph', /Authorization_RequestDenied|\b403\b|Forbidden|insufficient privileges/i, 'A permission is missing or not consented: Test connection in Settings → Entra & Intune names it; grant it under API permissions with Grant admin consent.'],
  ['', /certificate|self.signed|unable to verify|UNABLE_TO_GET_ISSUER|CERT_|key too weak/i, 'The server\'s certificate is not trusted: Test connection says what it presented; add the company CA certificate where the source is set up.'],
  ['', /ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|EHOSTUNREACH|ECONNRESET|cannot be reached|timed? ?out/i, 'The server could not be reached: check its address, the port and the firewall between the inventory and it.'],
];
export function syncFix(src, error){
  const e = String(error || '');
  if (!e) return '';
  const hit = RULES.find(([s, re]) => (!s || s === src) && re.test(e));
  return hit ? hit[2] : '';
}
