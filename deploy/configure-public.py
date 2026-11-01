"""Configure an IP HTTPS reverse proxy without changing the private app origin."""
import argparse
import datetime
from pathlib import Path
import shutil
import subprocess
from urllib.parse import urlsplit

parser = argparse.ArgumentParser()
parser.add_argument("stage", choices=("http", "https"))
args = parser.parse_args()
public_ip = "47.101.193.94"
bind_ip = "172.19.7.35"
root = Path("/opt/atlas-invest")
values = dict(line.split("=", 1) for line in (root / "deploy/.env").read_text().splitlines() if line and not line.startswith("#"))
canonical = values["APP_BASE_URL"]
assert canonical.startswith("https://") and urlsplit(canonical).hostname.endswith(".ts.net")
assert all(char not in canonical for char in '\n\r";{}')
config = f'''# Managed by Atlas Invest deploy/configure-public.py
server {{
    listen 80;
    server_name {public_ip};
    server_tokens off;
    location ^~ /.well-known/acme-challenge/ {{
        root /var/www/atlas-acme;
        default_type text/plain;
        try_files $uri =404;
    }}
    location / {{ return 308 https://{public_ip}$request_uri; }}
}}
'''
if args.stage == "https":
    cert = Path(f"/etc/letsencrypt/live/{public_ip}")
    assert (cert / "fullchain.pem").is_file() and (cert / "privkey.pem").is_file()
    # Translate only the explicitly allowed public origin. Untrusted origins pass
    # through unchanged so the application's existing CSRF check rejects them.
    config += f'''
map $http_origin $atlas_forward_origin {{
    default $http_origin;
    "https://{public_ip}" "{canonical}";
    "https://{public_ip}:443" "{canonical}";
}}
server {{
    listen {bind_ip}:443 ssl;
    server_name {public_ip};
    server_tokens off;
    ssl_certificate {cert}/fullchain.pem;
    ssl_certificate_key {cert}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_cache shared:AtlasTLS:10m;
    ssl_session_timeout 1d;
    client_max_body_size 10m;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy same-origin always;
    if ($host != "{public_ip}") {{ return 444; }}
    location / {{
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header Origin $atlas_forward_origin;
        proxy_set_header Connection "";
        proxy_read_timeout 60s;
    }}
}}
'''

Path("/var/www/atlas-acme/.well-known/acme-challenge").mkdir(parents=True, exist_ok=True)
available = Path("/etc/nginx/sites-available/atlas-public")
enabled = Path("/etc/nginx/sites-enabled/atlas-public")
default = Path("/etc/nginx/sites-enabled/default")
stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d%H%M%S%f")
backup_dir = Path("/etc/nginx/atlas-backups") / stamp
backup_dir.mkdir(parents=True)
previous = available.read_bytes() if available.exists() else None
if previous is not None:
    shutil.copy2(available, backup_dir / "atlas-public")
if default.is_symlink() or default.exists():
    default.rename(backup_dir / "default-enabled")
available.write_text(config)
available.chmod(0o644)
added_link = not enabled.is_symlink()
if added_link:
    assert not enabled.exists(), "Refusing to replace an unrelated file"
    enabled.symlink_to(available)
try:
    subprocess.run(["nginx", "-t"], check=True)
except Exception:
    if previous is not None:
        available.write_bytes(previous)
    if added_link:
        enabled.unlink()
    if (backup_dir / "default-enabled").is_symlink():
        (backup_dir / "default-enabled").rename(default)
    raise
subprocess.run(["systemctl", "reload", "nginx"], check=True)
print(f"Configured public {args.stage.upper()} for {public_ip}; backup at {backup_dir}")
