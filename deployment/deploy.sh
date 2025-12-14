#!/bin/bash
set -euo pipefail

# Minimal deploy script modeled after deploy_example.sh
# Rsync the project (including the prebuilt md-web.service), then install the systemd unit remotely.

TARGET_HOST="${TARGET_HOST:-bh-cow}"
TARGET_USER="${TARGET_USER:-cow}"
REMOTE_PATH="${REMOTE_PATH:-/home/cow/repos/md}"
SERVICE_NAME="${SERVICE_NAME:-md-web}"
SSH_OPTS="${SSH_OPTS:--tt}"
SUDO_CMD="${SUDO_CMD:-sudo}"
SUDO_FLAGS="${SUDO_FLAGS:--n}" # set to "" if you want password prompts

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXCLUDES=(
  ".git/"
  "node_modules/"
  ".DS_Store"
  "tmp/"
  "tmp-test-vault/"
)
EXCLUDE_FLAGS=("${EXCLUDES[@]/#/--exclude=}")
TARGET="${TARGET_USER}@${TARGET_HOST}"
NGINX_CONF_PATH="${NGINX_CONF_PATH:-deployment/md_web/md-web.conf}"
NGINX_REMOTE_CONF="${NGINX_REMOTE_CONF:-/etc/nginx/conf.d/md-web.conf}"

echo "[+] Syncing files to ${TARGET}:${REMOTE_PATH}"
rsync -avz --delete "${EXCLUDE_FLAGS[@]}" "${REPO_ROOT}/" "${TARGET}:${REMOTE_PATH}/"

echo "[+] Installing dependencies and systemd unit on ${TARGET_HOST}"
ssh ${SSH_OPTS} "${TARGET}" \
  REMOTE_PATH="${REMOTE_PATH}" SERVICE_NAME="${SERVICE_NAME}" \
  SUDO_CMD="${SUDO_CMD}" SUDO_FLAGS="${SUDO_FLAGS}" \
  NGINX_CONF_PATH="${NGINX_CONF_PATH}" NGINX_REMOTE_CONF="${NGINX_REMOTE_CONF}" bash -s <<'EOF'
set -euo pipefail
cd "${REMOTE_PATH}"
if [[ ! -f package.json ]]; then
  echo "package.json not found in ${REMOTE_PATH}; set REMOTE_PATH correctly." >&2
  exit 1
fi
if command -v npm >/dev/null 2>&1; then
  npm install --production
fi
UNIT_FILE="${REMOTE_PATH}/${SERVICE_NAME}.service"
if [[ ! -f "${UNIT_FILE}" ]]; then
  echo "Unit file ${UNIT_FILE} not found on remote. Ensure it is present in the repo." >&2
  exit 1
fi
cat > /tmp/${SERVICE_NAME}-deploy.sh <<EOS
#!/bin/bash
set -e
${SUDO_CMD} ${SUDO_FLAGS} install -m 644 "${UNIT_FILE}" /etc/systemd/system/${SERVICE_NAME}.service
${SUDO_CMD} ${SUDO_FLAGS} systemctl daemon-reload
${SUDO_CMD} ${SUDO_FLAGS} systemctl enable ${SERVICE_NAME} || true
${SUDO_CMD} ${SUDO_FLAGS} systemctl restart ${SERVICE_NAME}
${SUDO_CMD} ${SUDO_FLAGS} systemctl status --no-pager ${SERVICE_NAME} || true
# nginx config (if present locally and nginx exists)
if command -v nginx >/dev/null 2>&1 && [[ -f "${REMOTE_PATH}/${NGINX_CONF_PATH}" ]]; then
  ${SUDO_CMD} ${SUDO_FLAGS} install -m 644 "${REMOTE_PATH}/${NGINX_CONF_PATH}" "${NGINX_REMOTE_CONF}"
  ${SUDO_CMD} ${SUDO_FLAGS} nginx -t && ${SUDO_CMD} ${SUDO_FLAGS} systemctl reload nginx
fi
EOS
chmod +x /tmp/${SERVICE_NAME}-deploy.sh
/tmp/${SERVICE_NAME}-deploy.sh
rm -f /tmp/${SERVICE_NAME}-deploy.sh
exit 0
EOF

echo "[✓] Deployed. Check status with: ssh ${TARGET} '${SUDO_CMD} ${SUDO_FLAGS} systemctl status ${SERVICE_NAME}'"
