#!/usr/bin/env bash
# Run on the server. Idempotent: pulls latest, rebuilds, restarts.
set -euo pipefail

REPO_DIR="${REPO_DIR:-/home/ubuntu/codes/GhostMail}"
NGINX_CONF_DIR="${NGINX_CONF_DIR:-/home/ubuntu/dockers/nginx/conf.d}"
NGINX_CONTAINER="${NGINX_CONTAINER:-nginx}"
SERVICE_NAME="${SERVICE_NAME:-ghostmail}"

cd "$REPO_DIR"

echo "==> git pull"
git pull --ff-only

echo "==> npm install"
npm install --no-audit --no-fund

echo "==> build"
npm run build

echo "==> sync nginx vhost"
sudo cp deploy/nginx/mail.hwaipy.cn.conf "$NGINX_CONF_DIR/mail.hwaipy.cn.conf"
sudo docker exec "$NGINX_CONTAINER" nginx -t
sudo docker exec "$NGINX_CONTAINER" nginx -s reload

echo "==> sync systemd unit"
sudo cp deploy/systemd/ghostmail.service /etc/systemd/system/ghostmail.service
sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE_NAME"

if [ ! -f "$REPO_DIR/server/.env" ]; then
  echo "!! server/.env missing — copy from server/.env.example and fill in"
  echo "!! then run: sudo systemctl restart $SERVICE_NAME"
  exit 0
fi

echo "==> restart service"
sudo systemctl restart "$SERVICE_NAME"
sleep 1
sudo systemctl --no-pager --full status "$SERVICE_NAME" | head -15
