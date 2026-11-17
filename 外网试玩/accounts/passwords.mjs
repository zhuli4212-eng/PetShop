import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';

const format = 'scrypt-32768-8-3';
const cost = { N:32768, r:8, p:3, maxmem:64 * 1024 * 1024 };
const dummySalt = '00000000000000000000000000000000';

export function validPassword(password) {
  if (typeof password !== 'string' || password.length > 256) return false;
  const length = Array.from(password).length;
  return length >= 8 && length <= 128;
}

export function passwordRecord(password) {
  const salt = randomBytes(16).toString('hex');
  return [format, salt, scryptSync(password, Buffer.from(salt,'hex'), 32, cost).toString('hex')].join('$');
}

export function matchesPassword(password, record) {
  const [type,salt,digest] = (record || '').split('$');
  const usable = type === format && /^[a-f0-9]{32}$/.test(salt) && /^[a-f0-9]{64}$/.test(digest);
  const derived = scryptSync(password, Buffer.from(usable ? salt : dummySalt,'hex'), 32, cost);
  return usable && timingSafeEqual(derived, Buffer.from(digest,'hex'));
}
