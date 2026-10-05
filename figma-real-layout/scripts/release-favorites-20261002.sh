#!/usr/bin/env bash
set -euo pipefail
exec 9>/run/lock/partystore-deploy.lock
flock -w 30 9
expected=7db1d92bf0b589a1103291733d0f94a69459a171c2c46ceedd7b103a2c5b82e4
actual=$(sha256sum /var/www/partystore/index.html | awk '{print $1}')
test "$actual" = "$expected"
printf '%s  %s\n' f7dea528517b86c1a8ac838571d44fb7bb9a3fbe294cd38894cc4a51011825a2 /tmp/partystore-deploy-20261002-favorites.tgz | sha256sum -c -
bash /tmp/deploy-partystore-favorites-20261002.sh /tmp/partystore-deploy-20261002-favorites.tgz 20261002-favorites
test "$(sha256sum /var/www/partystore/index.html | awk '{print $1}')" = e37ce8e021b7b844a28e57d976cb2c6e0ea85e4e48d92bd27abafa2d9b3bd6a2
systemctl is-active partystore-api
sha256sum /root/backups/partystore/partystore-before-20261002-favorites.tgz
