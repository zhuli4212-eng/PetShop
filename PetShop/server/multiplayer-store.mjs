import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { GameError, RequestGameStore } from './request-store.mjs';

const sessionLifetime = 30 * 24 * 60 * 60 * 1000;

function accountName(input) {
  const name = typeof input === 'string' ? input.trim().normalize('NFKC') : '';
  if (!/^[\p{L}\p{M}\p{N}._@-]{1,32}$/u.test(name)) {
    throw new GameError('账号名限 1 至 32 个字，可用中文、字母、数字及 ._@-。', 400);
  }
  return { name, key: name.toLowerCase() };
}

function tokenDigest(token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  return createHash('sha256').update(token).digest('hex');
}

export class MultiplayerStore {
  #db;
  #clock;
  #sql;

  constructor(databasePath, { wall = Date.now, monotonic = () => performance.now() } = {}) {
    if (databasePath !== ':memory:') mkdirSync(dirname(databasePath), { recursive: true });
    this.#clock = { wall, monotonic };
    this.#db = new DatabaseSync(databasePath);
    try {
      this.#db.exec(`
        PRAGMA busy_timeout = 5000;
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = FULL;
        PRAGMA foreign_keys = ON;
        CREATE TABLE IF NOT EXISTS accounts (
          id TEXT PRIMARY KEY NOT NULL, username TEXT NOT NULL, username_key TEXT UNIQUE NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sessions (
          token_hash TEXT PRIMARY KEY NOT NULL, account_id TEXT NOT NULL REFERENCES accounts(id),
          expires_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
        CREATE TABLE IF NOT EXISTS shops (
          account_id TEXT PRIMARY KEY NOT NULL REFERENCES accounts(id), snapshot TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS auth_windows (
          key TEXT PRIMARY KEY NOT NULL, attempts INTEGER NOT NULL, expires_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS auth_windows_expiry ON auth_windows(expires_at);
      `);
      const prepare = sql => this.#db.prepare(sql);
      this.#sql = {
        createAccount: prepare('INSERT INTO accounts(id, username, username_key) VALUES (?, ?, ?) ON CONFLICT(username_key) DO NOTHING'),
        findAccount: prepare('SELECT id, username FROM accounts WHERE username_key = ?'),
        addShop: prepare('INSERT INTO shops(account_id, snapshot) VALUES (?, ?)'),
        getShop: prepare('SELECT snapshot FROM shops WHERE account_id = ?'),
        saveShop: prepare('UPDATE shops SET snapshot = ? WHERE account_id = ?'),
        pruneSessions: prepare('DELETE FROM sessions WHERE expires_at <= ?'),
        addSession: prepare('INSERT INTO sessions(token_hash, account_id, expires_at) VALUES (?, ?, ?)'),
        getSession: prepare(`SELECT a.id, a.username, s.expires_at FROM sessions s
          JOIN accounts a ON a.id = s.account_id WHERE s.token_hash = ? AND s.expires_at > ?`),
        dropSession: prepare('DELETE FROM sessions WHERE token_hash = ?'),
        pruneWindows: prepare('DELETE FROM auth_windows WHERE expires_at <= ?'),
        getWindow: prepare('SELECT attempts, expires_at FROM auth_windows WHERE key = ?'),
        startWindow: prepare('INSERT INTO auth_windows(key, attempts, expires_at) VALUES (?, 1, ?)'),
        countAttempt: prepare('UPDATE auth_windows SET attempts = attempts + 1 WHERE key = ?')
      };
    } catch (error) {
      this.#db.close();
      throw error;
    }
  }

  #transaction(run) {
    this.#db.exec('BEGIN IMMEDIATE');
    try {
      const result = run();
      this.#db.exec('COMMIT');
      return result;
    } catch (error) {
      this.#db.exec('ROLLBACK');
      throw error;
    }
  }

  #issueSession(account) {
    const now = this.#clock.wall();
    const token = randomBytes(32).toString('base64url');
    const expiresAt = now + sessionLifetime;
    this.#sql.pruneSessions.run(now);
    this.#sql.addSession.run(tokenDigest(token), account.id, expiresAt);
    return { account: { id: account.id, username: account.username }, token, expiresAt };
  }

  async register(username) {
    const { name, key } = accountName(username);
    return this.#transaction(() => {
      const id = randomUUID();
      if (!this.#sql.createAccount.run(id, name, key).changes) throw new GameError('这个账号名已注册。', 409);
      const shop = new RequestGameStore(null, this.#clock);
      this.#sql.addShop.run(id, JSON.stringify(shop.snapshot()));
      return this.#issueSession({ id, username: name });
    });
  }

  async login(username) {
    const { key } = accountName(username);
    return this.#transaction(() => {
      const account = this.#sql.findAccount.get(key);
      if (!account) throw new GameError('这个账号名尚未注册。', 404);
      return this.#issueSession(account);
    });
  }

  session(token) {
    const digest = tokenDigest(token);
    if (!digest) return null;
    const found = this.#sql.getSession.get(digest, this.#clock.wall());
    if (!found) return null;
    return { account: { id: found.id, username: found.username }, expiresAt: found.expires_at };
  }

  logout(token) {
    const digest = tokenDigest(token);
    return digest !== null && this.#sql.dropSession.run(digest).changes > 0;
  }

  withGame(token, run) {
    const outcome = this.#transaction(() => {
      const auth = this.session(token);
      if (!auth) throw new GameError('请先登录店主账号。', 401);
      const row = this.#sql.getShop.get(auth.account.id);
      if (!row) throw new GameError('未找到这个账号的经营档。', 503);
      const game = new RequestGameStore(JSON.parse(row.snapshot), this.#clock);
      let result;
      try {
        result = { value: run(game) };
      } catch (error) {
        // A rejected command can still have settled a due litter or another timed event.
        result = { error };
      }
      if (typeof result.value?.then === 'function') throw new TypeError('店铺事务需要同步回调。');
      if (game.dirty) this.#sql.saveShop.run(JSON.stringify(game.snapshot()), auth.account.id);
      return result;
    });
    if (Object.hasOwn(outcome, 'error')) throw outcome.error;
    return outcome.value;
  }

  takeAuthAttempt(key, limit, windowMs) {
    if (typeof key !== 'string' || !key || key.length > 256 ||
        !Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(windowMs) || windowMs < 1) {
      throw new TypeError('无效的登录限速参数。');
    }
    return this.#transaction(() => {
      const now = this.#clock.wall();
      this.#sql.pruneWindows.run(now);
      const entry = this.#sql.getWindow.get(key);
      if (!entry) this.#sql.startWindow.run(key, now + windowMs);
      else if (entry.attempts < limit) this.#sql.countAttempt.run(key);
      else return Math.ceil((entry.expires_at - now) / 1000);
      return 0;
    });
  }

  close() {
    if (this.#db.isOpen) this.#db.close();
  }
}
