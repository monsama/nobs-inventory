import fs from 'node:fs';

/* A secret comes from a file when NAME_FILE is set (Docker secrets: /run/secrets/...), else from NAME.
   Files keep the value out of "docker inspect" and the environment of the process. An empty file means unset. */
export function readSecret(env, name) {
  const file = env[name + '_FILE'];
  if (file) {
    try { return fs.readFileSync(file, 'utf8').trim(); }
    catch (e) { throw new Error(`${name}_FILE points at a file that cannot be read.`); }
  }
  return (env[name] || '').trim();
}
