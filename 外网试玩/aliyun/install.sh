#!/usr/bin/env bash
set -euo pipefail

[[ $EUID == 0 ]] || { echo 'Run sudo bash install.sh' >&2; exit 1; }
. /etc/os-release
case "$ID:$VERSION_ID" in
    ubuntu:22.04) nginx_package=nginx-core ;;
    ubuntu:24.04) nginx_package=nginx ;;
    *) echo 'This package supports Ubuntu 22.04 and 24.04.' >&2; exit 1 ;;
esac

src=$(cd -- "$(dirname -- "$0")" && pwd -P)
base=/opt/petshop-trial-test
api=petshop-trial-test.service
web=petshop-trial-test-web.service
install -d -m 0755 "$base"
exec 9>"$base/.install.lock"
flock -x 9
for entry in server.mjs sqlite.mjs account-service.mjs schema.sql nginx.conf "$api" "$web" public/index.html; do
    [[ -f "$src/$entry" ]] || { echo "Missing file: $entry" >&2; exit 1; }
done

tmp=$(mktemp -d)
release=$(mktemp -d "$base/release.XXXXXXXX")
trap 'rm -rf -- "$tmp"' EXIT
chmod 0755 "$release"
install -m 0644 "$src"/{server.mjs,sqlite.mjs,account-service.mjs,schema.sql,nginx.conf} "$src/$api" "$src/$web" "$release/"
cp -R "$src/public" "$release/"
chmod -R a+rX,go-w "$release/public"

# Prefer a system Node that already supports the runtime. Otherwise fetch the
# matching official Linux binary and verify its SHA-256 before extracting it.
node_bin=$(command -v node || true)
if [[ -n "$node_bin" ]] && "$node_bin" -e 'if (+process.versions.node.split(".")[0] < 24) process.exit(1); require("node:sqlite")' >/dev/null 2>&1; then
    install -m 0755 "$(readlink -f "$node_bin")" "$release/node"
else
    case "$(dpkg --print-architecture)" in
        amd64) arch=x64 ;; arm64) arch=arm64 ;; *) echo 'Unsupported CPU architecture' >&2; exit 1 ;;
    esac
    curl_flags=(--proto '=https' --fail --show-error --silent --location --retry 2 --connect-timeout 15)
    cd "$tmp"
    curl "${curl_flags[@]}" https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt -o checksums
    awk -v arch="$arch" '$2 ~ ("^node-v24[.][0-9]+[.][0-9]+-linux-" arch "[.]tar[.]xz$") {print}' checksums > selected
    [[ $(wc -l < selected) == 1 ]] || { echo 'No unique Node 24 archive in official checksums' >&2; exit 1; }
    read -r _ archive < selected
    version=${archive#node-}
    version=${version%-linux-*}
    curl "${curl_flags[@]}" "https://nodejs.org/dist/$version/$archive" -o "$archive"
    sha256sum -c selected
    tar -xJf "$archive" -- "${archive%.tar.xz}/bin/node"
    install -m 0755 "${archive%.tar.xz}/bin/node" "$release/node"
fi
"$release/node" -e 'require("node:sqlite")'

# Extract the Ubuntu binary without installing or starting the machine-wide
# nginx service (its default configuration can listen on the public network).
if [[ -x /usr/sbin/nginx ]]; then
    install -m 0755 /usr/sbin/nginx "$release/nginx"
else
    cd "$tmp"
    apt-get download "$nginx_package"
    debs=(./*.deb)
    [[ ${#debs[@]} == 1 ]]
    dpkg-deb -x "${debs[0]}" nginx-pkg
    install -m 0755 nginx-pkg/usr/sbin/nginx "$release/nginx"
fi
"$release/nginx" -v

activate() {
    ln -sfn "$1" "$base/.next" &&
    mv -Tf "$base/.next" "$base/current" &&
    install -m 0644 "$1/$api" "$1/$web" /etc/systemd/system/ &&
    systemctl daemon-reload &&
    systemctl restart "$api" "$web"
}
healthy() {
    for _ in {1..20}; do
        if curl --noproxy '*' -fsS --max-time 2 http://127.0.0.1:8080/petshop-api/v1/health 2>/dev/null |
            "$release/node" -e 'const r=JSON.parse(require("node:fs").readFileSync(0,"utf8")); if (r.service!=="petshop" || r.storage!=="trial-accounts" || r.status!=="ok") process.exit(1)' 2>/dev/null &&
            curl --noproxy '*' -fsS --max-time 2 http://127.0.0.1:8080/ -o /dev/null &&
            systemctl is-active --quiet "$api" && systemctl is-active --quiet "$web"; then
            return 0
        fi
        sleep 1
    done
    return 1
}

previous=$(readlink -f "$base/current" || true)
# The previous path exists on repeat installs. Database files live separately.
if ! activate "$release" || ! healthy; then
    journalctl -u "$api" -u "$web" -n 25 --no-pager >&2 || true
    if [[ -d "$previous" && "$previous" == "$base"/release.* ]]; then
        activate "$previous"
    else
        systemctl stop "$web" "$api"
    fi
    echo 'Test site failed its health check.' >&2
    exit 1
fi
systemctl enable "$api" "$web"
for old_release in "$base"/release.*; do
    if [[ -d "$old_release" && ! -L "$old_release" && "$old_release" != "$release" && "$old_release" != "$previous" ]]; then
        rm -rf -- "$old_release"
    fi
done
printf '%s\n' 'Petshop test site ready at http://127.0.0.1:8080/ through SSH.'
