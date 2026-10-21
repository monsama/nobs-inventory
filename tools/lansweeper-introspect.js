import { graphql, DEFAULT_ENDPOINT } from '../server/lansweeper.js';

/* Lists the query fields of the Lansweeper schema, or the fields of one type, using your token.
   Usage: NI_LS_TOKEN=... npm run lansweeper:introspect -- [TypeName] */
const cfg = { endpoint: process.env.NI_LS_URL || DEFAULT_ENDPOINT, token: process.env.NI_LS_TOKEN, authScheme: process.env.NI_LS_AUTH_SCHEME || 'Token' };
if (!cfg.token) { console.error('Set NI_LS_TOKEN first.'); process.exit(1); }
const type = process.argv[2];
const query = type
  ? `query T($n: String!) { __type(name: $n) { name fields { name type { name kind ofType { name kind } } args { name type { name kind ofType { name } } } } } }`
  : '{ __schema { queryType { fields { name args { name } } } } }';
const data = await graphql(cfg, query, type ? { n: type } : {});
console.log(JSON.stringify(data, null, 2));
