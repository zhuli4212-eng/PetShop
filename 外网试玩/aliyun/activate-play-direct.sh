#!/usr/bin/env bash
set -euo pipefail

here=$(cd -- "$(dirname -- "$0")" && pwd)
base=/etc/petshop/play-direct
dropin=/etc/systemd/system/petshop-web.service.d/55-play-direct.conf
hook=/etc/letsencrypt/renewal-hooks/deploy/55-petshop-play-direct
runtime=/run/petshop-web
release=/opt/petshop/current
new_host=play.zhu-li-4212.xyz
origin=petshop.zhu-li-4212.xyz
[[ $EUID == 0 && ! -e $dropin && ! -L $dropin && ! -e $hook && ! -L $hook ]]
systemctl is-active --quiet petshop.service
systemctl is-active --quiet petshop-web.service
openssl verify -verify_hostname "$new_host" -purpose sslserver \
    -untrusted "/etc/letsencrypt/live/$new_host/fullchain.pem" "/etc/letsencrypt/live/$new_host/fullchain.pem"

install -d -o root -g petshop -m 0750 "$base"
install -o root -g petshop -m 0640 "$here/compose-play-nginx.py" "$here/play-direct.conf" "$base/"
RENEWED_LINEAGE="/etc/letsencrypt/live/$new_host" PETSHOP_STAGE_DIRECT=1 bash "$here/renew-play-certificate.sh"
runuser -u petshop -- /usr/bin/python3 "$base/compose-play-nginx.py" \
    "$release/nginx-production.conf" "$base/play-direct.conf" "$runtime/player-nginx.conf"
"$release/nginx" -t -p "$runtime/" -c "$runtime/player-nginx.conf"

rollback() {
    code=$?
    trap - EXIT
    if ((code != 0)); then
        if [[ -f $dropin ]]; then mv -T "$dropin" "$here/55-play-direct.failed"; fi
        systemctl daemon-reload
        systemctl restart petshop-web.service
        echo 'Previous web service configuration restored.' >&2
    fi
    exit "$code"
}
trap rollback EXIT
install -d -o root -g root -m 0755 "$(dirname "$dropin")"
install -o root -g root -m 0644 "$here/petshop-play-direct.service.conf" "$dropin"
systemctl daemon-reload
systemctl restart petshop-web.service

direct=(curl -sS --noproxy '*' --max-time 6 --resolve "$new_host:443:127.0.0.1")
ready=no
for attempt in {1..12}; do
    if "${direct[@]}" -f "https://$new_host/petshop/release.json" > "$here/play-version.json"; then
        ready=yes; break
    fi
    sleep 1
done
[[ $ready == yes ]]
cmp "$here/play-version.json" "$release/public/release.json"
"${direct[@]}" -f "https://$new_host/petshop/" > "$here/play-index.html"
cmp "$here/play-index.html" "$release/public/index.html"
"${direct[@]}" -f "https://$new_host/petshop-api/v1/health" > "$here/play-health.json"
python3 -c 'import json,sys; assert json.load(open(sys.argv[1]))["status"] == "ok"' "$here/play-health.json"
[[ $("${direct[@]}" -o /dev/null -w '%{http_code}' "https://$new_host/petshop-api/v1/shop") == 401 ]]
[[ $("${direct[@]}" -o /dev/null -w '%{http_code}' "https://$new_host/petshop/local-opening/wallet.mjs") == 404 ]]
[[ $("${direct[@]}" -o /dev/null -w '%{http_code}' "https://$new_host/") == 302 ]]

source /etc/petshop/upstream.env
printf 'header = "X-Petshop-Origin-Secret: %s"\n' "$PETSHOP_ORIGIN_SECRET" |
    curl --config - -fsS --noproxy '*' --max-time 6 --resolve "$origin:443:127.0.0.1" \
        "https://$origin/release.json" > "$here/upstream-version.json"
cmp "$here/upstream-version.json" "$release/public/release.json"
install -o root -g root -m 0755 "$here/renew-play-certificate.sh" "$hook"
trap - EXIT
printf 'DIRECT_READY_WITHOUT_DNS\n'
date -Is
cat "$here/play-version.json"
