import { hashPassword } from './auth.js';
/* A stand-in hash used when the login does not exist, so a wrong login costs the same time as a wrong password. */
export const DUMMY = hashPassword('not-a-real-password-' + Math.random());
