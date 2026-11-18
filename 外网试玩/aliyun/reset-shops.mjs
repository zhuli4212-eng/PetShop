import { chmodSync, existsSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { newTrialSnapshot } from './account-service.mjs';

const [database, backup] = process.argv.slice(2);
if (process.argv.length !== 4 || !isAbsolute(database) || !isAbsolute(backup) ||
    !existsSync(database) || existsSync(backup)) {
  throw Error('Usage: node reset-shops.mjs <existing database absolute path> <new backup absolute path>');
}

process.umask(0o077);
const file = pathToFileURL(database);
file.searchParams.set('mode','rw');
const db = new DatabaseSync(file.href);
try {
  db.exec('PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
  if (db.prepare('PRAGMA quick_check').get()?.quick_check !== 'ok') throw Error('Invalid account database.');
  db.prepare('VACUUM INTO ?').run(backup);
  chmodSync(backup, 0o600);
  const saved = new DatabaseSync(backup, {readOnly:true});
  try {
    if (saved.prepare('PRAGMA quick_check').get()?.quick_check !== 'ok') throw Error('Invalid account backup.');
  } finally {
    saved.close();
  }
  db.exec('BEGIN IMMEDIATE');
  const accounts = db.prepare('SELECT id FROM trial_accounts').all();
  const reset = db.prepare('UPDATE trial_accounts SET snapshot=?,revision=revision+1 WHERE id=?');
  for (const {id} of accounts) {
    const result = reset.run(JSON.stringify(newTrialSnapshot()),id);
    if (result.changes !== 1) throw Error('Account changed during shop reset.');
  }
  db.exec('COMMIT');
  console.log(JSON.stringify({resetShops:accounts.length, backup}));
} finally {
  if (db.isTransaction) db.exec('ROLLBACK');
  db.close();
}
