#!/bin/bash
set -euo pipefail
live_dir=/opt/homenas-v3
stage_dir=/opt/homenas-repair-stage-20261001
backup_dir=/var/backups/homenas-repair-20261001
[[ $EUID == 0 ]]
[[ -f "$stage_dir/apps/backend/dist/apps/backend/src/server.js" ]]
[[ -d "$backup_dir/application/apps/backend/data" ]]
[[ $(sudo -u homenas git -C "$live_dir" rev-parse --short HEAD) == 332d4c2 ]]
sudo -u homenas git -C "$live_dir" diff --quiet
service_stopped=false
rollback() {
  local upgrade_exit=$?
  trap - ERR
  if $service_stopped; then
    systemctl stop homenas || true
    mv "$live_dir" /opt/homenas-repair-failed-20261001
    cp -a "$backup_dir/application" "$live_dir"
    systemctl start homenas
    echo 'Upgrade failed; original application restored.' >&2
  fi
  exit "$upgrade_exit"
}
trap rollback ERR
systemctl stop homenas
service_stopped=true
# Refresh the SQLite/WAL snapshot after graceful shutdown; no online DB copy is restored.
mv "$backup_dir/application/apps/backend/data" "$backup_dir/data-before-stop"
cp -a "$live_dir/apps/backend/data" "$backup_dir/application/apps/backend/data"
# Remove stale dependency/build files only within their generated directories.
for generated_dir in node_modules apps/backend/node_modules apps/frontend/node_modules packages/shared/node_modules apps/backend/dist apps/frontend/dist packages/shared/dist; do
  [[ ! -d "$stage_dir/$generated_dir" ]] || rsync -a --delete "$stage_dir/$generated_dir/" "$live_dir/$generated_dir/"
done
# Preserve runtime data/configuration and all unrelated local files; no --delete here.
rsync -a --exclude=.git --exclude=node_modules --exclude=dist --exclude=data --exclude=logs --exclude=certs --exclude='.env*' --exclude=.cache --exclude=.local --exclude=.npm --exclude=.gitconfig "$stage_dir/" "$live_dir/"
sudo -u homenas git -C "$live_dir" switch -c repair/audit-20261001
systemctl start homenas
healthy=false
for attempt in $(seq 1 30); do
  if curl --silent --show-error --insecure --fail --connect-timeout 2 https://127.0.0.1/api/health > "$backup_dir/health-after.json"; then healthy=true; break; fi
  sleep 1
done
$healthy
systemctl is-active --quiet homenas
sha256sum --check "$backup_dir/config-before.sha256"
service_stopped=false
trap - ERR
printf 'PASS application updated; rollback snapshot: %s/application\n' "$backup_dir"
