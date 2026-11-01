"""Set the canonical HTTPS origin after Tailscale authentication."""
import json
from pathlib import Path
import subprocess

status = json.loads(subprocess.check_output(['tailscale', 'status', '--json']))
hostname = status['Self']['DNSName'].rstrip('.')
if status.get('BackendState') != 'Running' or not hostname.endswith('.ts.net'):
    raise SystemExit('Tailscale must be authenticated first.')
env = Path('/opt/atlas-invest/deploy/.env')
lines = env.read_text().splitlines()
env.write_text('\n'.join(f'APP_BASE_URL=https://{hostname}' if line.startswith('APP_BASE_URL=') else line for line in lines) + '\n')
env.chmod(0o600)
print(f'Canonical application URL: https://{hostname}')
