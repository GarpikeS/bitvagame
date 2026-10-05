#!/usr/bin/env bash
set -euo pipefail

PACKAGE="${1:?Usage: deploy-partystore.sh PACKAGE STAMP}"
STAMP="${2:?Usage: deploy-partystore.sh PACKAGE STAMP}"
ROOT="/var/www/partystore"
STAGE="/tmp/partystore-stage-${STAMP}"
BACKUP_DIR="/root/backups/partystore"
BACKUP="${BACKUP_DIR}/partystore-before-${STAMP}.tgz"
ROLLBACK_INDEX="/tmp/partystore-index-before-${STAMP}.html"
INDEX_SWITCHED=0

case "${PACKAGE}" in
  /tmp/partystore-deploy-*.tgz) ;;
  *) printf 'Unexpected package path: %s\n' "${PACKAGE}" >&2; exit 40 ;;
esac

case "${STAGE}" in
  /tmp/partystore-stage-*) ;;
  *) printf 'Unexpected staging path: %s\n' "${STAGE}" >&2; exit 41 ;;
esac

test "$(readlink -f "${ROOT}")" = "/var/www/partystore"
test -f "${PACKAGE}"

mkdir -p "${BACKUP_DIR}" "${STAGE}"
cleanup() {
  rm -rf -- "${STAGE}"
  rm -f -- "${PACKAGE}" "${ROLLBACK_INDEX}"
}

rollback_on_error() {
  local exit_code=$?
  local failed_line="${1:-unknown}"
  trap - ERR
  set +e
  printf 'Deployment failed on line %s; exit=%s\n' "${failed_line}" "${exit_code}" >&2
  if [[ "${INDEX_SWITCHED}" == "1" && -s "${ROLLBACK_INDEX}" ]]; then
    install -m 0644 "${ROLLBACK_INDEX}" "${ROOT}/index.html.rollback"
    mv -f -- "${ROOT}/index.html.rollback" "${ROOT}/index.html"
    printf 'Rolled index.html back to the previous release\n' >&2
  fi
  exit "${exit_code}"
}

trap 'rollback_on_error ${LINENO}' ERR
trap cleanup EXIT

tar -xzf "${PACKAGE}" -C "${STAGE}"
test -f "${STAGE}/index.html"
test -d "${STAGE}/assets"
grep -q '<div id="root"></div>' "${STAGE}/index.html"
grep -Eq '/assets/index-[^" ]+\.js' "${STAGE}/index.html"
grep -Eq '/assets/index-[^" ]+\.css' "${STAGE}/index.html"

chown -R root:root "${STAGE}"
find "${STAGE}" -type d -exec chmod 0755 {} +
find "${STAGE}" -type f -exec chmod 0644 {} +

nginx -t
tar -czf "${BACKUP}" -C "${ROOT}" .
tar -tzf "${BACKUP}" >/dev/null
install -m 0644 "${ROOT}/index.html" "${ROLLBACK_INDEX}"

# Keep older hashed assets so cached HTML never points to a missing file.
rsync -a --exclude 'index.html' "${STAGE}/" "${ROOT}/"
chown -R root:root "${ROOT}"
find "${ROOT}" -type d -exec chmod 0755 {} +
find "${ROOT}" -type f -exec chmod 0644 {} +

while IFS= read -r asset; do
  test -r "${ROOT}${asset}"
done < <(grep -oE '/assets/index-[^" ]+\.(js|css)' "${STAGE}/index.html" | sort -u)

install -m 0644 "${STAGE}/index.html" "${ROOT}/index.html.next"
mv -f -- "${ROOT}/index.html.next" "${ROOT}/index.html"
INDEX_SWITCHED=1

nginx -t

INDEX_SHA="$(sha256sum "${ROOT}/index.html" | awk '{print $1}')"
ASSET_REFS="$(grep -oE '/assets/index-[^" ]+\.(js|css)' "${ROOT}/index.html" | sort | tr '\n' ' ')"
FILE_COUNT="$(find "${ROOT}" -type f | wc -l | tr -d ' ')"
ROOT_SIZE="$(du -sh "${ROOT}" | awk '{print $1}')"

trap - ERR
printf 'BACKUP=%s\n' "${BACKUP}"
printf 'INDEX_SHA=%s\n' "${INDEX_SHA}"
printf 'ASSET_REFS=%s\n' "${ASSET_REFS}"
printf 'FILE_COUNT=%s\n' "${FILE_COUNT}"
printf 'ROOT_SIZE=%s\n' "${ROOT_SIZE}"
