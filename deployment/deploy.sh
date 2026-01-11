#!/bin/bash
set -euo pipefail

# Minimal deploy script modeled after deploy_example.sh
# Rsync the project (including the prebuilt md-web.service), then install the systemd unit remotely.

TARGET_HOST="${TARGET_HOST:-bh-cow}"
TARGET_USER="${TARGET_USER:-cow}"
REMOTE_PATH="${REMOTE_PATH:-/home/cow/repos/md}"
SERVICE_NAME="${SERVICE_NAME:-md-web}"
SSH_OPTS="${SSH_OPTS:--tt}"
SCP_OPTS="${SCP_OPTS:-}"
SUDO_CMD="${SUDO_CMD:-sudo}"
SUDO_FLAGS="${SUDO_FLAGS:--n}" # set to "" if you want password prompts
ALLOW_SUDO_PROMPT="${ALLOW_SUDO_PROMPT:-1}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXCLUDES=(
  ".git/"
  "node_modules/"
  ".DS_Store"
  ".env"
  "tmp/"
  "tmp-test-vault/"
  "deployment/deploy_remote.sh.tmpl"
)
EXCLUDE_FLAGS=("${EXCLUDES[@]/#/--exclude=}")
TARGET="${TARGET_USER}@${TARGET_HOST}"
NGINX_CONF_PATH="${NGINX_CONF_PATH:-deployment/md_web/md-web.conf}"
NGINX_REMOTE_CONF="${NGINX_REMOTE_CONF:-/etc/nginx/conf.d/md-web.conf}"

echo "[+] Syncing files to ${TARGET}:${REMOTE_PATH}"
rsync -avz --delete "${EXCLUDE_FLAGS[@]}" "${REPO_ROOT}/" "${TARGET}:${REMOTE_PATH}/"

escape_sed() {
  printf '%s' "$1" | sed -e 's/[&|]/\\&/g'
}
REMOTE_SCRIPT="$(mktemp -t ${SERVICE_NAME}-deploy.XXXXXX)"
sed \
  -e "s|__REMOTE_PATH__|$(escape_sed "${REMOTE_PATH}")|g" \
  -e "s|__SERVICE_NAME__|$(escape_sed "${SERVICE_NAME}")|g" \
  -e "s|__SUDO_CMD__|$(escape_sed "${SUDO_CMD}")|g" \
  -e "s|__SUDO_FLAGS__|$(escape_sed "${SUDO_FLAGS}")|g" \
  -e "s|__ALLOW_SUDO_PROMPT__|$(escape_sed "${ALLOW_SUDO_PROMPT}")|g" \
  -e "s|__REQUIRE_DEPS__|$(escape_sed "${REQUIRE_DEPS:-1}")|g" \
  -e "s|__NGINX_CONF_PATH__|$(escape_sed "${NGINX_CONF_PATH}")|g" \
  -e "s|__NGINX_REMOTE_CONF__|$(escape_sed "${NGINX_REMOTE_CONF}")|g" \
  "${REPO_ROOT}/deployment/deploy_remote.sh.tmpl" > "${REMOTE_SCRIPT}"

echo "[+] Uploading remote deploy script to ${TARGET_HOST}"
scp ${SCP_OPTS} "${REMOTE_SCRIPT}" "${TARGET}:/tmp/${SERVICE_NAME}-deploy.sh"
rm -f "${REMOTE_SCRIPT}"

echo "[+] Running remote deploy script on ${TARGET_HOST}"
ssh ${SSH_OPTS} "${TARGET}" bash "/tmp/${SERVICE_NAME}-deploy.sh"
ssh ${SSH_OPTS} "${TARGET}" rm -f "/tmp/${SERVICE_NAME}-deploy.sh"

echo "[✓] Deployed. Check status with: ssh ${TARGET} '${SUDO_CMD} ${SUDO_FLAGS} systemctl status ${SERVICE_NAME}'"
