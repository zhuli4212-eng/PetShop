import { GameError } from './request-store.mjs';

export function accountName(input) {
  const name = typeof input === 'string' ? input.trim().normalize('NFKC') : '';
  if (!/^[\p{L}\p{M}\p{N}._@-]{1,32}$/u.test(name)) {
    throw new GameError('账号名限 1 至 32 个字，可用中文、字母、数字及 ._@-。', 400);
  }
  return { name, key: name.toLowerCase() };
}
