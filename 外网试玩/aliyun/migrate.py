"""Export the three petshop business tables to a private standalone SQLite database."""
import argparse
from contextlib import ExitStack, closing
from datetime import datetime, timezone
import hashlib
import itertools
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import uuid

TABLES = {
    'trial_accounts': ('id', 'name_key', 'username', 'revision', 'snapshot', 'password_hash'),
    'trial_sessions': ('digest', 'account_id', 'expires_at', 'setup_digest', 'setup_expires_at'),
    'trial_auth_limits': ('bucket', 'attempts', 'expires_at'),
}
NUMBERS = {'revision', 'expires_at', 'setup_expires_at', 'attempts'}
SCHEMA = Path(__file__).resolve().parents[1] / 'accounts' / 'schema.sql'
CLI = Path(__file__).resolve().parents[2] / '云端经营版/node_modules/wrangler/bin/wrangler.js'


def require(condition, message):
    if not condition:
        raise ValueError(message)


def private_work():
    # Use the owning user's local files, outside the repository, webroot and release.
    base = Path(os.environ['LOCALAPPDATA']) if os.name == 'nt' else Path.home() / '.local/state'
    parent = base / 'petshop-migrations'
    parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix='.building-', dir=parent))
    if os.name == 'nt':
        try:
            identity = subprocess.check_output(['whoami', '/user', '/fo', 'csv', '/nh'])
            sid = re.search(rb'\bS-1-[0-9-]+', identity).group().decode('ascii')
            subprocess.run(['icacls', str(stage), '/inheritance:r', '/grant:r',
                            '*' + sid + ':(OI)(CI)F'], check=True, stdout=subprocess.DEVNULL)
        except BaseException:
            stage.rmdir()
            raise
    return stage


def call(wrangler, scratch, args):
    cmd = ['node', str(wrangler), 'd1', *args, '--config', str(scratch / 'wrangler.json'), '--remote']
    result = subprocess.run(cmd, cwd=scratch, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, timeout=300,
                            env={**os.environ, 'CI': '1', 'WRANGLER_SEND_METRICS': 'false',
                                 'WRANGLER_LOG_PATH': str(scratch / 'wrangler.log')})
    # Export output may contain a signed download URL. Never log stdout or stderr.
    if result.returncode:
        raise RuntimeError(f'Wrangler d1 {args[0]} failed (exit {result.returncode}).')
    return result.stdout


def remote_rows(wrangler, scratch, sql):
    raw = call(wrangler, scratch, ['execute', 'DB', '--command', sql, '--json'])
    result = json.loads(raw)
    require(len(result) == 1 and result[0]['success'], 'D1 metadata check failed.')
    return result[0]['results']


def inspect_source(wrangler, scratch, frozen):
    def read(sql):
        return remote_rows(wrangler, scratch, sql)

    catalog = {row['name'] for row in read("SELECT name FROM sqlite_schema WHERE type='table'")}
    known = set(TABLES) | {'transfer_state', 'transfer_pages', 'd1_migrations', '__drizzle_migrations'}
    require(all(name in known or name.startswith(('sqlite_', '_cf_')) for name in catalog),
            'Source has an unrecognized table; review its role before exporting.')
    for name, columns in TABLES.items():
        fields = read(f"SELECT name, type, pk FROM pragma_table_info('{name}') ORDER BY cid")
        expected = [(c, 'INTEGER' if c in NUMBERS else 'TEXT', int(i == 0)) for i, c in enumerate(columns)]
        require([(f['name'], f['type'].upper(), f['pk']) for f in fields] == expected,
                f'Unexpected source columns or primary key for {name}.')
    if frozen:
        require(read('SELECT phase, applying, switch_open FROM transfer_state WHERE singleton=1') ==
                [{'phase': 'done', 'applying': 0, 'switch_open': 0}], 'Source has not been frozen.')
        rows = read("SELECT name, sql FROM sqlite_schema WHERE type='trigger' AND name LIKE 'transfer_target_%'")
        triggers = {r['name']: ' '.join(r['sql'].split()).lower().rstrip(';') for r in rows}
        for name in TABLES:
            for operation in ('insert', 'update', 'delete'):
                key = f'transfer_target_{name}_{operation}'
                expected = (f'create trigger {key} before {operation} on {name} when not exists '
                            f'(select 1 from transfer_state where singleton=1 and (applying=1 or switch_open=1)) '
                            f"begin select raise(abort,'target in maintenance'); end")
                require(triggers.get(key) == expected, f'Unexpected or missing source write fence: {key}.')


def export(wrangler, scratch, path):
    args = ['export', 'DB', '--no-schema', '--skip-confirmation', '--output', str(path)]
    for name in TABLES:
        args.extend(['--table', name])
    call(wrangler, scratch, args)
    require(path.is_file() and path.stat().st_size > 0, 'D1 did not write an SQL dump.')


def import_dump(db, path):
    db.executescript(SCHEMA.read_text(encoding='utf-8'))
    # Rows may be emitted out of foreign-key order by D1. Check all references after loading.
    db.execute('PRAGMA foreign_keys=OFF')
    def permit(op, first, second, database, trigger):
        if op == sqlite3.SQLITE_INSERT and first in TABLES and not trigger:
            return sqlite3.SQLITE_OK
        if op == sqlite3.SQLITE_PRAGMA and first.lower() in ('defer_foreign_keys', 'foreign_keys'):
            return sqlite3.SQLITE_OK
        if op in (sqlite3.SQLITE_TRANSACTION, sqlite3.SQLITE_SELECT):
            return sqlite3.SQLITE_OK
        if op == sqlite3.SQLITE_FUNCTION and second.lower() in ('char', 'replace', 'unistr'):
            return sqlite3.SQLITE_OK
        return sqlite3.SQLITE_DENY
    db.set_authorizer(permit)
    try:
        db.executescript(path.read_text(encoding='utf-8-sig'))
        db.commit()
    finally:
        db.set_authorizer(None)
    db.execute('PRAGMA foreign_keys=ON')
    require(db.execute('PRAGMA foreign_key_check').fetchone() is None, 'Orphan business row in SQL dump.')
    require(db.execute('SELECT 1 FROM trial_accounts WHERE NOT json_valid(snapshot) LIMIT 1').fetchone() is None,
            'The source contains an invalid shop snapshot.')


def database_rows(db, table):
    cols = TABLES[table]
    return db.execute(f"SELECT {','.join(cols)} FROM {table} ORDER BY {cols[0]} COLLATE BINARY")


def inspect_copy(db, other_db=None):
    require(db.execute('PRAGMA integrity_check').fetchall() == [('ok',)], 'SQLite integrity check failed.')
    require(db.execute('PRAGMA foreign_key_check').fetchone() is None, 'SQLite foreign key check failed.')
    tables = {}
    for table in TABLES:
        digest = hashlib.sha256()
        count = 0
        with ExitStack() as cursors:
            rows = cursors.enter_context(closing(database_rows(db, table)))
            if other_db is None:
                pairs = ((row, row) for row in rows)
            else:
                other_rows = cursors.enter_context(closing(database_rows(other_db, table)))
                pairs = itertools.zip_longest(rows, other_rows)
            for row, other in pairs:
                require(row is not None and other is not None and row[0] is not None and tuple(row) == tuple(other),
                        f'Row comparison failed for {table}.')
                line = json.dumps(tuple(row), ensure_ascii=False, separators=(',', ':'), allow_nan=False)
                digest.update(line.encode('utf-8') + b'\n')
                count += 1
        tables[table] = {'rows': count, 'sha256': digest.hexdigest()}
    return tables


def readonly(path):
    return sqlite3.connect(path.resolve().as_uri() + '?mode=ro', uri=True)


def file_digest(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def receipt(path, expected=None):
    with closing(readonly(path)) as db:
        return {'tables': inspect_copy(db, expected), 'sqlite_sha256': file_digest(path)}


def snapshot(args):
    account = os.environ.get('CLOUDFLARE_ACCOUNT_ID', '')
    require(re.fullmatch(r'[a-fA-F0-9]{32}', account), 'Set CLOUDFLARE_ACCOUNT_ID to the owning Cloudflare account.')
    database_id = str(uuid.UUID(args.database_id))
    frozen = args.mode == 'cutover'
    stage = private_work()
    try:
        with tempfile.TemporaryDirectory(prefix='scratch-', dir=stage) as inner:
            scratch = Path(inner)
            (scratch / 'wrangler.json').write_text(json.dumps({
                'name': 'petshop-private-export', 'compatibility_date': '2026-05-15', 'account_id': account,
                'd1_databases': [{'binding': 'DB', 'database_name': 'petshop', 'database_id': database_id}],
            }), encoding='utf-8')
            inspect_source(args.wrangler, scratch, frozen)
            sql = scratch / 'source.sql'
            export(args.wrangler, scratch, sql)
            destination = stage / (args.mode + '.sqlite')
            with closing(sqlite3.connect(':memory:')) as source:
                import_dump(source, sql)
                with closing(sqlite3.connect(destination)) as dest:
                    source.backup(dest)
                manifest = receipt(destination, source)
            if frozen:
                # Independently re-read D1 after the first export, including every protected column.
                sql.unlink()
                export(args.wrangler, scratch, sql)
                with closing(sqlite3.connect(':memory:')) as again:
                    import_dump(again, sql)
                    require(receipt(destination, again) == manifest, 'Second frozen export did not match.')
                inspect_source(args.wrangler, scratch, True)
        with (stage / 'receipt.json').open('x', encoding='utf-8') as stream:
            json.dump(manifest, stream, indent=2)
        stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
        final = stage.parent / f'{args.mode}-{stamp}-{uuid.uuid4().hex[:8]}'
        stage.rename(final)
    except BaseException:
        shutil.rmtree(stage)
        raise
    print(str(final))
    print(json.dumps(manifest, separators=(',', ':')))


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_subparsers(dest='command', required=True)
    cp = modes.add_parser('snapshot', help='Export rehearsal copy or independently verified final frozen copy.')
    cp.add_argument('mode', choices=['rehearsal', 'cutover'])
    cp.add_argument('--remote', required=True, action='store_true', help='Read the explicitly identified remote D1.')
    cp.add_argument('--database-id', required=True)
    cp.add_argument('--wrangler', type=lambda p: Path(p).resolve(), default=CLI, help='Path to the Wrangler JS CLI.')
    check = modes.add_parser('verify', help='Check untouched SQLite copy against its private receipt before use.')
    check.add_argument('database', type=Path)
    check.add_argument('receipt', type=Path)
    args = parser.parse_args()
    if args.command == 'snapshot':
        snapshot(args)
    else:
        manifest = json.loads(args.receipt.read_text(encoding='utf-8'))
        require(receipt(args.database) == manifest, 'SQLite file or business row summary differs from the receipt.')
        print('Verified SQLite file, rows, integrity and foreign keys.')


if __name__ == '__main__':
    try:
        main()
    except sqlite3.Error as error:
        sys.exit('Migration failed: SQLite import or verification returned ' + getattr(error, 'sqlite_errorname', 'an error'))
    except (ValueError, OSError, RuntimeError, subprocess.SubprocessError) as error:
        sys.exit(f'Migration failed: {error}')
