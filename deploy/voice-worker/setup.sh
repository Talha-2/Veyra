#!/usr/bin/env bash
# Installs or updates the Veyra voice worker on a fresh VM: Ubuntu 22.04+ or
# Oracle Linux 9 (the Oracle Cloud default image), arm64 or x86_64.
#
#   curl -fsSL https://raw.githubusercontent.com/Talha-2/Veyra/main/deploy/voice-worker/setup.sh | bash
#
# First run: installs Docker, clones the repo, writes /opt/veyra/voice.env from
# the template and stops so you can fill it in. Every later run: pulls main,
# rebuilds the image and restarts the worker. The container restarts itself
# after a crash or a reboot.
set -euo pipefail

REPO=https://github.com/Talha-2/Veyra.git
DIR=/opt/veyra
SRC=$DIR/src
ENV_FILE=$DIR/voice.env

. /etc/os-release

if ! command -v docker >/dev/null 2>&1; then
  echo "==> Installing Docker and git"
  case "$ID" in
    ol|rhel|centos|rocky|almalinux)
      # Oracle Linux ships podman, whose runc conflicts with Docker's; Docker replaces it.
      sudo dnf install -y dnf-plugins-core git
      sudo dnf config-manager --add-repo https://download.docker.com/linux/rhel/docker-ce.repo
      sudo dnf install -y --allowerasing docker-ce docker-ce-cli containerd.io docker-buildx-plugin
      sudo systemctl enable --now docker
      ;;
    *)
      command -v git >/dev/null 2>&1 || { sudo apt-get update -y && sudo apt-get install -y git; }
      curl -fsSL https://get.docker.com | sudo sh
      ;;
  esac
  sudo usermod -aG docker "$USER" || true
fi

sudo mkdir -p "$DIR"
sudo chown "$USER" "$DIR"

if [ -d "$SRC/.git" ]; then
  echo "==> Pulling main"
  git -C "$SRC" fetch --depth 1 origin main
  git -C "$SRC" reset --hard origin/main
else
  echo "==> Cloning"
  git clone --depth 1 "$REPO" "$SRC"
fi

if [ ! -f "$ENV_FILE" ]; then
  cp "$SRC/deploy/voice-worker/voice.env.example" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  echo
  echo "Fill in $ENV_FILE (nano $ENV_FILE), then run this script again."
  exit 0
fi

echo "==> Building the image (the first build takes several minutes)"
sudo docker build -f "$SRC/apps/agent-layer/agents/voice/Dockerfile" -t veyra-voice "$SRC/apps/agent-layer"

echo "==> Restarting the worker"
sudo docker rm -f veyra-voice >/dev/null 2>&1 || true
sudo docker run -d --name veyra-voice --restart unless-stopped \
  --env-file "$ENV_FILE" \
  --log-opt max-size=20m --log-opt max-file=3 \
  veyra-voice

echo
echo "Running. Watch it register with LiveKit:  sudo docker logs -f veyra-voice"
