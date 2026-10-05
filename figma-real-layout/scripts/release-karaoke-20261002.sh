#!/usr/bin/env bash
set -euo pipefail
exec 9>/run/lock/partystore-deploy.lock
flock -w 30 9
expected=a136ee3263b2afc6556a2a763e5fe42f093d0348ae21b8790aab4726f2749f5b
actual=$(sha256sum /var/www/partystore/index.html | awk '{print $1}')
test "$actual" = "$expected"
printf '%s  %s\n' 80f541e21cb8d59c9b718b9584c31c7dca2206f1e42827bdab5839dcf28f6652 /tmp/partystore-deploy-20261002-1408Z.tgz | sha256sum -c -
bash /tmp/deploy-partystore-20261002.sh /tmp/partystore-deploy-20261002-1408Z.tgz 20261002-1408Z
test "$(sha256sum /var/www/partystore/index.html | awk '{print $1}')" = 7db1d92bf0b589a1103291733d0f94a69459a171c2c46ceedd7b103a2c5b82e4
systemctl is-active partystore-api
curl --fail --silent --show-error https://bitvagame.ru/api/health
