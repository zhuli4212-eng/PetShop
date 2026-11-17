#!/usr/bin/env bash
set -euo pipefail

base=/opt/petshop
state=/var/lib/petshop
db="$state/shop.sqlite"
host=petshop.zhu-li-4212.xyz
src=$(cd -- "$(dirname -- "$0")" && pwd -P)
action=${1:-}
shift || true

audit() {
    python3 - "$1" "$2" <<'PY'
import hashlib, json, re, sqlite3, sys
from pathlib import Path
path = Path(sys.argv[1]).resolve(strict=True)
expected = sys.argv[2].lower()
if not re.fullmatch(r"[0-9a-f]{64}", expected):
    sys.exit("Expected an independently verified SHA-256")
if any(Path(str(path) + ext).exists() for ext in ("-wal","-shm","-journal")):
    sys.exit("Use the final closed, checkpointed SQLite snapshot")
h = hashlib.sha256()
with path.open("rb") as f:
    for block in iter(lambda: f.read(1024*1024), b""):
        h.update(block)
if h.hexdigest() != expected:
    sys.exit("Snapshot SHA-256 mismatch")
conn = sqlite3.connect(path.as_uri() + "?mode=ro&immutable=1", uri=True)
conn.execute("PRAGMA query_only=ON")
if conn.execute("PRAGMA quick_check").fetchall() != [("ok",)]:
    sys.exit("SQLite integrity check failed")
if conn.execute("PRAGMA foreign_key_check").fetchone():
    sys.exit("Invalid account reference")
fields = {
    "trial_accounts": {"id","name_key","username","revision","snapshot","password_hash"},
    "trial_sessions": {"digest","account_id","expires_at","setup_digest","setup_expires_at"},
    "trial_auth_limits": {"bucket","attempts","expires_at"}
}
objects = conn.execute("SELECT type,name FROM sqlite_schema WHERE type IN ('table','trigger','view')").fetchall()
if any(kind != "table" or (name not in fields and not name.startswith("sqlite_")) for kind,name in objects):
    sys.exit("Snapshot contains unexpected schema objects")
counts = {}
for table,columns in fields.items():
    if {col[1] for col in conn.execute(f"PRAGMA table_info({table})")} != columns:
        sys.exit("Unexpected business schema: " + table)
    counts[table] = conn.execute(f"SELECT count(*) FROM {table}").fetchone()[0]
if counts["trial_accounts"] < 1:
    sys.exit("No production accounts in snapshot")
print(json.dumps({"sha256": h.hexdigest(), "counts": counts, "foreignKeyErrors": 0}))
PY
}

usage() {
    echo 'Usage: production.sh audit SNAPSHOT SHA256 | stage | set-secret < SECRET_FILE | import-final SNAPSHOT SHA256 | start-local | publish FULLCHAIN PRIVKEY' >&2
    exit 2
}

if [[ $action == audit && $# == 2 ]]; then audit "$1" "$2"; exit; fi
[[ $EUID == 0 ]] || { echo 'Use sudo for installation and production activation.' >&2; exit 1; }
exec 9>/run/petshop-install.lock
flock -x 9

case "$action" in
set-secret)
    [[ $# == 0 && ! -t 0 ]] || usage
    install -d -o root -g petshop -m 0750 /etc/petshop
    umask 077
    python3 -c '
from pathlib import Path
import os, re, sys, tempfile
raw = sys.stdin.buffer.read(256)
secret = raw.rstrip(b"\r\n")
if not re.fullmatch(rb"[A-Za-z0-9_-]{40,128}", secret) or len(raw) == 256:
    sys.exit("Expected a single base64url-format upstream secret (40-128 characters)")
root = Path("/etc/petshop")
for name, value in (
    ("upstream.env", b"PETSHOP_ORIGIN_SECRET=" + secret + b"\n"),
    ("origin-gate.conf", b"if ($http_x_petshop_origin_secret != \"" + secret + b"\") { return 403; }\n"),
):
    with tempfile.NamedTemporaryFile(dir=root, delete=False) as f:
        f.write(value)
    os.replace(f.name, root / name)
    if name == "origin-gate.conf":
        import grp
        os.chown(root / name, 0, grp.getgrnam("petshop").gr_gid)
        os.chmod(root / name, 0o640)
'
    echo 'Upstream credential stored. Restart installed services to apply a rotation.'
    ;;
stage)
    [[ $# == 0 ]] || usage
    if systemctl is-active --quiet petshop.service || systemctl is-active --quiet petshop-web.service; then
        echo 'Stop the production services before replacing program files.' >&2; exit 1
    fi
    # Use the exact Linux binaries that passed the isolated Ubuntu test install.
    runtime=/opt/petshop-trial-test/current
    [[ -x $runtime/node && -x $runtime/nginx && -s "$src/public/index.html" ]]
    if ! id -u petshop >/dev/null 2>&1; then
        useradd --system --user-group --home-dir "$state" --shell /usr/sbin/nologin petshop
    fi
    [[ $(getent passwd petshop | cut -d: -f6) == "$state" && $(id -gn petshop) == petshop ]]
    install -d -m 0755 "$base"
    install -d -o petshop -g petshop -m 0700 "$state"
    release=$(mktemp -d "$base/release.XXXXXXXX")
    chmod 0755 "$release"
    install -m 0755 "$runtime/node" "$runtime/nginx" "$release/"
    install -m 0644 "$src"/{server.mjs,sqlite.mjs,account-service.mjs,schema.sql,nginx-production.conf,petshop.service,petshop-web.service} "$release/"
    cp -R "$src/public" "$release/"
    chmod -R a+rX,go-w "$release/public"
    ln -sfn "$release" "$base/.next"
    mv -Tf "$base/.next" "$base/current"
    install -m 0644 "$release"/{petshop.service,petshop-web.service} /etc/systemd/system/
    systemctl daemon-reload
    echo 'Production program staged. No database created and no listener started.'
    ;;
import-final)
    [[ $# == 2 ]] || usage
    [[ -x "$base/current/node" && -d "$state" ]]
    if [[ -e "$db" || -L "$db" ]]; then
        echo 'Existing production database retained; initial import is already closed.' >&2; exit 1
    fi
    audit "$1" "$2"
    incoming=$(mktemp "$state/.incoming-XXXXXXXX")
    trap 'rm -f -- "$incoming"' EXIT
    install -o petshop -g petshop -m 0600 "$1" "$incoming"
    audit "$incoming" "$2"
    # Same-volume hard link fails atomically if another writer created the path.
    ln "$incoming" "$db"
    echo 'Verified final snapshot installed. Production listeners are still off.'
    ;;
start-local)
    [[ $# == 0 ]] || usage
    [[ -s "$db" && ! -L "$db" ]] || { echo 'Import a verified production snapshot first.' >&2; exit 1; }
    systemctl start petshop.service
    for _ in {1..15}; do
        if curl -fsS --noproxy '*' --max-time 2 -H "Host: $host" -H "Origin: https://$host" \
            http://127.0.0.1:8788/petshop-api/v1/health; then
            echo; exit 0
        fi
        sleep 1
    done
    exit 1
    ;;
publish)
    [[ $# == 2 ]] || usage
    systemctl is-active --quiet petshop.service
    [[ -s /etc/petshop/upstream.env && -s /etc/petshop/origin-gate.conf ]]
    cert=$(realpath -e "$1")
    key=$(realpath -e "$2")
    openssl verify -verify_hostname "$host" -purpose sslserver -untrusted "$cert" "$cert"
    openssl pkey -in "$key" -passin pass: -check -noout >/dev/null
    cmp -s <(openssl x509 -in "$cert" -pubkey -noout) <(openssl pkey -in "$key" -passin pass: -pubout)
    install -d -o root -g petshop -m 0750 /etc/petshop/tls
    install -o root -g petshop -m 0640 "$cert" /etc/petshop/tls/fullchain.next
    install -o root -g petshop -m 0640 "$key" /etc/petshop/tls/privkey.next
    mv -f /etc/petshop/tls/fullchain.next /etc/petshop/tls/fullchain.pem
    mv -f /etc/petshop/tls/privkey.next /etc/petshop/tls/privkey.pem
    systemctl restart petshop-web.service
    systemctl enable petshop.service petshop-web.service
    echo 'HTTPS upstream started. Verify the two player URLs through their normal gateways.'
    ;;
*) usage ;;
esac
