import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';

// These are the D1 operations used by the released account service. An entire
// batch executes synchronously on a single SQLite connection and transaction.
class BoundStatement {
  constructor(statement, values = []) {
    this.statement = statement;
    this.values = values;
  }

  bind(...values) {
    return new BoundStatement(this.statement, values);
  }

  first() {
    return this.statement.get(...this.values) ?? null;
  }

  run() {
    const { changes } = this.statement.run(...this.values);
    return { meta: { changes } };
  }

  all() {
    return {results:this.statement.all(...this.values)};
  }
}

function tableDefinition(db, table) {
  const columns = db.prepare(`
    SELECT name, upper(type) AS type, "notnull", dflt_value, pk, hidden
    FROM pragma_table_xinfo(?) ORDER BY cid`).all(table);
  const foreignKeys = db.prepare(`
    SELECT * FROM pragma_foreign_key_list(?) ORDER BY id, seq`).all(table);
  // The original Drizzle release and schema.sql use different names for
  // equivalent UNIQUE indexes. Compare their key definitions.
  const indexColumns = db.prepare(`
    SELECT name, coll, "desc" FROM pragma_index_xinfo(?) WHERE key=1 ORDER BY seqno`);
  const indexes = db.prepare('SELECT name, "unique" AS is_unique, partial FROM pragma_index_list(?)')
    .all(table).map(index => JSON.stringify([index.is_unique, index.partial, indexColumns.all(index.name)])).sort();
  return JSON.stringify([columns, foreignKeys, indexes]);
}

function verifyProductionDatabase(db, schema) {
  const reference = new DatabaseSync(':memory:');
  try {
    reference.exec(schema);
    for (const {name} of reference.prepare("SELECT name FROM sqlite_schema WHERE type='table'").all()) {
      const type = db.prepare('SELECT type FROM sqlite_schema WHERE name=?').get(name)?.type;
      if (type !== 'table' || tableDefinition(db, name) !== tableDefinition(reference, name)) {
        throw Error('Production database has an incompatible table: ' + name);
      }
    }
    if (!db.prepare('SELECT 1 FROM trial_accounts LIMIT 1').get()) {
      throw Error('Production database has no migrated accounts.');
    }
    if (db.prepare('PRAGMA foreign_key_check').get()) throw Error('Production database has invalid references.');
  } finally {
    reference.close();
  }
}

export function openAccountDatabase(filename, { requireExisting = false } = {}) {
  if (!filename || !isAbsolute(filename)) throw Error('PETSHOP_DB must be an absolute SQLite file path.');
  if (!requireExisting) mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
  const file = pathToFileURL(filename);
  file.searchParams.set('mode', requireExisting ? 'rw' : 'rwc');
  const conn = new DatabaseSync(file.href);
  try {
    conn.exec('PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
    const schema = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
    if (requireExisting) verifyProductionDatabase(conn, schema);
    conn.exec('PRAGMA journal_mode = WAL;');
    if (!requireExisting) conn.exec('BEGIN IMMEDIATE;\n' + schema + '\nCOMMIT;');
  } catch (error) {
    conn.close();
    throw error;
  }

  const statements = new Map();
  return {
    prepare(sql) {
      if (!statements.has(sql)) statements.set(sql, conn.prepare(sql));
      return new BoundStatement(statements.get(sql));
    },
    batch(items) {
      conn.exec('BEGIN IMMEDIATE');
      try {
        const results = items.map(item => item.run());
        conn.exec('COMMIT');
        return results;
      } catch (error) {
        if (conn.isTransaction) conn.exec('ROLLBACK');
        throw error;
      }
    },
    close() {
      conn.close();
    },
  };
}
