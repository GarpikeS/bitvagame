#!/usr/bin/env bash
set -euo pipefail

PACKAGE="${1:?Usage: deploy-partystore-api.sh PACKAGE STAMP}"
STAMP="${2:?Usage: deploy-partystore-api.sh PACKAGE STAMP}"
ROOT="/opt/partystore-api"
RELEASES="${ROOT}/releases"
CURRENT="${ROOT}/current"
NEW_RELEASE="${RELEASES}/${STAMP}"
STAGE="/tmp/partystore-api-stage-${STAMP}"
CONTENTS="/tmp/partystore-api-contents-${STAMP}.txt"
DATA_FILE="/var/lib/partystore/auth.json"
BACKUP_DIR="/var/backups/partystore"
BACKUP="${BACKUP_DIR}/auth-before-api-${STAMP}.json"
LOCAL_HEALTH="/tmp/partystore-api-health-${STAMP}.json"
ROUTE_BODY="/tmp/partystore-api-route-${STAMP}.json"
SWITCHED=0
SERVICE_STOPPED=0
OLD_RELEASE=""

case "${PACKAGE}" in
  /tmp/partystore-api-deploy-*.tgz) ;;
  *) printf 'Unexpected package path: %s\n' "${PACKAGE}" >&2; exit 40 ;;
esac

case "${STAMP}" in
  [0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]-[0-9][0-9][0-9][0-9][0-9][0-9]Z) ;;
  *) printf 'Unexpected release stamp: %s\n' "${STAMP}" >&2; exit 41 ;;
esac

cleanup() {
  rm -rf -- "${STAGE}"
  rm -f -- "${CONTENTS}" "${LOCAL_HEALTH}" "${ROUTE_BODY}" "${PACKAGE}"
}

rollback_on_error() {
  local exit_code=$?
  local failed_line="${1:-unknown}"
  trap - ERR
  set +e
  printf 'Deployment failed on line %s; exit=%s\n' "${failed_line}" "${exit_code}" >&2
  if [[ "${SWITCHED}" == "1" && -n "${OLD_RELEASE}" ]]; then
    systemctl stop partystore-api
    SERVICE_STOPPED=1
    rm -f -- "${ROOT}/.current-rollback-${STAMP}"
    ln -s "${OLD_RELEASE}" "${ROOT}/.current-rollback-${STAMP}"
    mv -Tf -- "${ROOT}/.current-rollback-${STAMP}" "${CURRENT}"
    printf 'Rolled back to %s\n' "${OLD_RELEASE}" >&2
  fi
  if [[ "${SERVICE_STOPPED}" == "1" ]]; then
    systemctl start partystore-api
  fi
  cleanup
  exit "${exit_code}"
}

trap 'rollback_on_error ${LINENO}' ERR
trap cleanup EXIT

test -f "${PACKAGE}"
OLD_RELEASE="$(readlink -f "${CURRENT}")"
case "${OLD_RELEASE}" in
  "${RELEASES}"/*) ;;
  *) printf 'Unexpected current target: %s\n' "${OLD_RELEASE}" >&2; exit 42 ;;
esac
test -d "${OLD_RELEASE}"
test ! -e "${NEW_RELEASE}"
test -f "${OLD_RELEASE}/package-lock.json"
test -d "${OLD_RELEASE}/node_modules"
test -f "${DATA_FILE}"

tar -tzf "${PACKAGE}" > "${CONTENTS}"
while IFS= read -r entry; do
  case "${entry}" in
    package.json|package-lock.json|server-dist|server-dist/|server-dist/*) ;;
    *) printf 'Unexpected archive entry: %s\n' "${entry}" >&2; exit 43 ;;
  esac
done < "${CONTENTS}"

mkdir -p "${STAGE}"
cp -a -- "${OLD_RELEASE}/node_modules" "${STAGE}/node_modules"
tar -xzf "${PACKAGE}" -C "${STAGE}"
test -f "${STAGE}/package.json"
test -f "${STAGE}/package-lock.json"
test -f "${STAGE}/server-dist/index.js"
test -f "${STAGE}/server-dist/src/app.js"
cmp -s "${OLD_RELEASE}/package-lock.json" "${STAGE}/package-lock.json"
grep -Fq '/api/purchases/entitlements' "${STAGE}/server-dist/src/app.js"

while IFS= read -r -d '' javascript_file; do
  node --check "${javascript_file}"
done < <(find "${STAGE}/server-dist" -type f -name '*.js' -print0)

chown -R partystore:partystore "${STAGE}"
mv -- "${STAGE}" "${NEW_RELEASE}"

systemctl stop partystore-api
SERVICE_STOPPED=1
install -d -m 0700 -o root -g root "${BACKUP_DIR}"
install -m 0600 -o root -g root "${DATA_FILE}" "${BACKUP}"
node -e 'JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"))' "${BACKUP}"
read -r DATA_SHA _ < <(sha256sum "${DATA_FILE}")
read -r BACKUP_SHA _ < <(sha256sum "${BACKUP}")
test "${DATA_SHA}" = "${BACKUP_SHA}"

ln -s "${NEW_RELEASE}" "${ROOT}/.current-${STAMP}"
mv -Tf -- "${ROOT}/.current-${STAMP}" "${CURRENT}"
SWITCHED=1
systemctl start partystore-api
SERVICE_STOPPED=0
systemctl is-active --quiet partystore-api

READY=0
for _attempt in $(seq 1 40); do
  if curl -fsS --max-time 2 "http://127.0.0.1:8788/api/health" -o "${LOCAL_HEALTH}" 2>/dev/null; then
    READY=1
    break
  fi
  sleep 0.25
done
test "${READY}" = "1"
node -e 'const value=JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")); if (value.ok !== true || (value.paymentConfigured === true && value.paymentReachable !== true)) process.exit(1)' "${LOCAL_HEALTH}"

ROUTE_STATUS="$(curl -sS --max-time 10 -o "${ROUTE_BODY}" -w '%{http_code}' \
  -X POST "http://127.0.0.1:8788/api/purchases/entitlements" \
  -H 'Content-Type: application/json' \
  -H 'Origin: https://bitvagame.ru' \
  --data '{"entitlementId":"karaoke:girls"}')"
test "${ROUTE_STATUS}" = "401"
node -e 'const value=JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")); if (value?.error?.code !== "UNAUTHORIZED") process.exit(1)' "${ROUTE_BODY}"

PUBLIC_STATUS="$(curl -sS --max-time 15 -o /dev/null -w '%{http_code}' 'https://bitvagame.ru/api/health')"
test "${PUBLIC_STATUS}" = "200"

trap - ERR
printf 'OLD_RELEASE=%s\n' "${OLD_RELEASE}"
printf 'NEW_RELEASE=%s\n' "${NEW_RELEASE}"
printf 'DATA_BACKUP=%s\n' "${BACKUP}"
printf 'LOCAL_HEALTH=ok\n'
printf 'ENTITLEMENT_ROUTE_STATUS=%s\n' "${ROUTE_STATUS}"
printf 'PUBLIC_HEALTH_STATUS=%s\n' "${PUBLIC_STATUS}"
