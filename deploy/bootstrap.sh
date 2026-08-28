#!/usr/bin/env bash
# Prepares a fresh Ubuntu 22.04/24.04 VM (e.g. an Oracle Cloud Always Free
# instance) to run the Kitchen AI backend. Idempotent — safe to re-run.
#
#   curl -fsSL https://raw.githubusercontent.com/aomarab/kitchen-AI/main/deploy/bootstrap.sh | sudo bash
#
# It installs Docker + the compose plugin, opens the OS firewall for HTTP/HTTPS
# (Oracle's stock image drops them in iptables), and clones the repo. It does
# NOT start the stack — you must first create .env from deploy/.env.prod.example.
#
# NOTE: the VM firewall is only half the story on Oracle Cloud. You must also add
# an ingress rule for TCP 80 and 443 to the subnet's Security List (or a Network
# Security Group) in the console — that cannot be done from inside the VM.
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/aomarab/kitchen-AI.git}"
APP_DIR="${APP_DIR:-/opt/kitchen-ai}"
# The non-root user that will own the checkout and run docker. Defaults to the
# Oracle Ubuntu default login.
APP_USER="${APP_USER:-ubuntu}"

log() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }

if [[ $EUID -ne 0 ]]; then
  echo "Run as root (use sudo)." >&2
  exit 1
fi

log "Installing Docker Engine + compose plugin"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

if id "$APP_USER" >/dev/null 2>&1; then
  usermod -aG docker "$APP_USER"
fi

log "Opening the OS firewall for HTTP/HTTPS (80, 443)"
# Oracle's Ubuntu image ships an iptables INPUT chain that drops everything
# except established connections and SSH. Insert ACCEPT rules for 80/443 (only
# if absent) and persist them so they survive reboot.
ensure_port() {
  local port="$1"
  if ! iptables -C INPUT -m state --state NEW -p tcp --dport "$port" -j ACCEPT 2>/dev/null; then
    iptables -I INPUT -m state --state NEW -p tcp --dport "$port" -j ACCEPT
  fi
}
ensure_port 80
ensure_port 443
DEBIAN_FRONTEND=noninteractive apt-get update -qq || true
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq iptables-persistent >/dev/null 2>&1 || true
if command -v netfilter-persistent >/dev/null 2>&1; then
  netfilter-persistent save || true
fi

log "Cloning the repository into $APP_DIR"
if [[ ! -d "$APP_DIR/.git" ]]; then
  git clone "$REPO_URL" "$APP_DIR"
else
  git -C "$APP_DIR" pull --ff-only || true
fi
if id "$APP_USER" >/dev/null 2>&1; then
  chown -R "$APP_USER":"$APP_USER" "$APP_DIR"
fi

cat <<EOF

$(log "VM is ready.")
Next steps (as $APP_USER):

  cd $APP_DIR
  cp deploy/.env.prod.example .env
  \$EDITOR .env                      # fill API_DOMAIN, secrets, R2, OAuth ids

  # Point API_DOMAIN's DNS A record at this VM's public IP, then start it:
  docker compose -f docker-compose.prod.yml -f deploy/docker-compose.caddy.yml up -d --build

  # One-time catalog seed (bilingual ingredients):
  docker compose -f docker-compose.prod.yml --profile seed run --rm seed

  # Verify:
  curl -fsS https://\$API_DOMAIN/health

Reminder: also add an ingress rule for TCP 80 and 443 to this subnet's
Security List / NSG in the Oracle Cloud console.
EOF
