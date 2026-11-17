#!/bin/sh
set -eu
[ "${RENEWED_LINEAGE:-}" = /etc/letsencrypt/live/petshop.zhu-li-4212.xyz ] || exit 0
install -o root -g petshop -m 640 "$RENEWED_LINEAGE/fullchain.pem" /etc/petshop/tls/fullchain.next
install -o root -g petshop -m 640 "$RENEWED_LINEAGE/privkey.pem" /etc/petshop/tls/privkey.next
mv -f /etc/petshop/tls/fullchain.next /etc/petshop/tls/fullchain.pem
mv -f /etc/petshop/tls/privkey.next /etc/petshop/tls/privkey.pem
systemctl try-restart petshop-web.service
