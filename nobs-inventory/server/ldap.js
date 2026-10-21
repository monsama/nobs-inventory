import ldap from 'ldapjs';

/* Checks a login against the directory: binds as the user with the password, then reads the name, department
   and groups. Nothing is stored about the password. An empty password is refused, because some servers
   accept it as an anonymous bind. */
export function ldapEnabled(config) {
  return !!config?.url;
}

const escapeFilter = v => String(v).replace(/[\\*()\0]/g, c => '\\' + c.charCodeAt(0).toString(16).padStart(2, '0'));

export function ldapLogin(config, login, password) {
  return new Promise((resolve, reject) => {
    if (!password) return resolve(null);
    const dn = config.bindTemplate.replace('{login}', login);
    const client = ldap.createClient({ url: config.url, timeout: 5000, connectTimeout: 5000 });
    client.on('error', reject);
    client.bind(dn, password, err => {
      if (err) { client.unbind(() => {}); return resolve(null); }
      const entries = [];
      client.search(config.searchBase, {
        scope: 'sub',
        filter: `(${config.loginAttr}=${escapeFilter(login)})`,
        attributes: ['displayname', 'department', 'memberof', 'mail']
      }, (err2, res) => {
        if (err2) { client.unbind(() => {}); return reject(err2); }
        res.on('searchEntry', e => entries.push(e.pojo ? e.pojo : e));
        res.on('error', e => { client.unbind(() => {}); reject(e); });
        res.on('end', () => {
          client.unbind(() => {});
          const e = entries[0];
          const find = name => (e?.attributes ?? []).find(x => x.type.toLowerCase() === name.toLowerCase());
          const attr = name => { const a = find(name); return a ? [].concat(a.values)[0] : ''; };
          const groups = find('memberOf')?.values ?? [];
          resolve({
            login,
            name: attr('displayName') || login,
            dept: attr('department'),
            groups: [].concat(groups)
          });
        });
      });
    });
  });
}
