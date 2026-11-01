#!/bin/bash
set -euo pipefail
umask 077
cd /opt/atlas-invest
install -d -m 700 /var/backups/atlas-invest /etc/atlas-invest
if [ ! -s /etc/atlas-invest/backup.key ]; then
  openssl rand -base64 48 > /etc/atlas-invest/backup.key
fi
backup="/var/backups/atlas-invest/atlas-$(date -u +%Y%m%dT%H%M%SZ).sql.gz.enc"
runuser -u postgres -- pg_dump -d atlas --no-owner --no-acl | gzip | \
  openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 -pass file:/etc/atlas-invest/backup.key -out "$backup"
test -s "$backup"
printf 'Encrypted backup saved: %s\n' "$backup"
