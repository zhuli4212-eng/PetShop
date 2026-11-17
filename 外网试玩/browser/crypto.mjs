import { sha256 } from '@noble/hashes/sha2.js';
import { hmac } from '@noble/hashes/hmac.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';

// The shared engine uses hex strings and 32-bit reads for its deterministic draws.
export class Buffer extends Uint8Array {
  static from(value, encoding) {
    return new Buffer(encoding === 'hex' ? hexToBytes(value) : value);
  }
  toString(encoding) {
    if (encoding !== 'hex') throw Error('Expected hex encoding');
    return bytesToHex(this);
  }
  readUInt32LE() { return new DataView(this.buffer, this.byteOffset, this.byteLength).getUint32(0, true); }
  readUInt32BE() { return new DataView(this.buffer, this.byteOffset, this.byteLength).getUint32(0); }
}

function digest(algorithm, hash) {
  if (algorithm !== 'sha256') throw Error('Expected SHA-256');
  return {
    update(value) { hash.update(typeof value === 'string' ? utf8ToBytes(value) : value); return this; },
    digest(encoding) {
      const result = new Buffer(hash.digest());
      return encoding ? result.toString(encoding) : result;
    },
  };
}
export const createHash = algorithm => digest(algorithm, sha256.create());
export const createHmac = (algorithm, key) => digest(algorithm, hmac.create(sha256, key));
export const randomUUID = () => crypto.randomUUID();
export const randomBytes = size => crypto.getRandomValues(new Buffer(size));
export function randomInt(max) {
  if (!Number.isSafeInteger(max) || max < 1 || max > 2 ** 32) throw RangeError('Invalid random bound');
  const limit = 2 ** 32 - (2 ** 32 % max);
  const value = new Uint32Array(1);
  do { crypto.getRandomValues(value); } while (value[0] >= limit);
  return value[0] % max;
}
