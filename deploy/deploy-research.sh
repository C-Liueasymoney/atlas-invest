#!/bin/bash
# Run as root with the extracted, source-only release directory as argument.
set -euo pipefail
umask 077
release="${1:?release directory required}"
root=/opt/atlas-invest
stamp=$(date -u +%Y%m%dT%H%M%SZ)
backups=/var/backups/atlas-invest
[ "$(id -u)" = 0 ]
[ -f "$release/apps/web/lib/agent/server.ts" ]
[ -f "$root/deploy/.env" ]
cd "$root"
bash deploy/backup.sh
rollback="$backups/research-code-$stamp.tar.gz"
tar --exclude='./node_modules' --exclude='./.atlas' --exclude='*.env' --exclude='./apps/web/test-results' -czf "$rollback" .
# Do not copy any release secrets, state, node_modules or prebuilt native binaries.
python3 - "$release" "$root" <<'PY'
from pathlib import Path
import shutil,sys
source,target=map(Path,sys.argv[1:])
for file in source.rglob('*'):
    if not file.is_file():continue
    rel=file.relative_to(source)
    if any(p in {'.atlas','node_modules','.git','.next'} for p in rel.parts) or file.name.endswith('.env'):
        raise SystemExit('Refusing unsafe release file')
    dest=target/rel
    dest.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(file,dest)
PY
NODE_OPTIONS=--max-old-space-size=384 npm ci --include=dev --no-audit --no-fund --maxsockets=2 --fetch-timeout=20000 --fetch-retries=1
systemctl stop atlas-web
# Keep a restart path even if building or migrating fails.
rollback_failure() {
  echo "Deployment failed; restoring prior build from $rollback"
  systemctl stop atlas-agent atlas-web || true
  tar -xzf "$rollback" -C "$root"
  if [ -f "$backups/atlas-public-before-research.conf" ]; then
    cp "$backups/atlas-public-before-research.conf" /etc/nginx/sites-available/atlas-public
    nginx -t && systemctl reload nginx
  fi
  systemctl start atlas-web || true
}
trap rollback_failure ERR
NODE_OPTIONS=--max-old-space-size=768 NEXT_TELEMETRY_DISABLED=1 npm run build
/usr/bin/node --env-file=deploy/.env scripts/db.mjs migrate
python3 - <<'PY'
from pathlib import Path
p=Path('deploy/.env')
s=p.read_text()
keys={'ATLAS_PUBLIC_BASE_URL':'https://47.101.193.94','ATLAS_AGENT_PUBLIC_URL':'https://47.101.193.94','ATLAS_AGENT_PORT':'3001'}
lines=[line for line in s.splitlines() if line.split('=',1)[0] not in keys]
p.write_text('\n'.join(lines+[f'{k}={v}' for k,v in keys.items()])+'\n')
p.chmod(0o600)
# Exact existing vhost, back up before adding only the MCP/OAuth routes.
p=Path('/etc/nginx/sites-available/atlas-public')
s=p.read_text()
if 'include /opt/atlas-invest/deploy/agent-nginx.conf;' not in s:
    needle='    location / {\n        proxy_pass http://127.0.0.1:3000;'
    if needle not in s:raise SystemExit('Unexpected Nginx vhost; manual merge required')
    backup=Path('/var/backups/atlas-invest/atlas-public-before-research.conf')
    if not backup.exists():backup.write_text(s)
    s=s.replace(needle,'    include /opt/atlas-invest/deploy/agent-nginx.conf;\n'+needle,1)
    p.write_text(s)
PY
install -m 644 deploy/atlas-agent.service /etc/systemd/system/atlas-agent.service
systemctl daemon-reload
nginx -t
systemctl enable --now atlas-agent.service
systemctl restart atlas-web.service
systemctl reload nginx
trap - ERR
systemctl is-active atlas-web atlas-agent nginx
curl --fail --silent http://127.0.0.1:3001/agent/health
printf '\nSource backup: %s\n' "$rollback"
