#!/usr/bin/env bash
set -euo pipefail

host=play.zhu-li-4212.xyz
base=/etc/petshop/play-direct
lineage=/etc/letsencrypt/live/$host
[[ ${RENEWED_LINEAGE:-} == "$lineage" ]] || exit 0

openssl x509 -in "$lineage/fullchain.pem" -noout -checkhost "$host"
cmp -s <(openssl x509 -in "$lineage/fullchain.pem" -pubkey -noout) \
    <(openssl pkey -in "$lineage/privkey.pem" -passin pass: -pubout)

directory=$(mktemp -d "$base/tls.XXXXXXXX")
chown root:petshop "$directory"
chmod 0750 "$directory"
install -o root -g petshop -m 0640 "$lineage/fullchain.pem" "$directory/fullchain.pem"
install -o root -g petshop -m 0640 "$lineage/privkey.pem" "$directory/privkey.pem"
ln -s "$directory" "$base/.tls-$$"
mv -Tf "$base/.tls-$$" "$base/tls"
if [[ ${PETSHOP_STAGE_DIRECT:-0} != 1 ]]; then
    systemctl try-restart petshop-web.service
fi
