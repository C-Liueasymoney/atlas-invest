"""One-time private deployment setup; run as root on the intended ECS."""
import base64
import os
from pathlib import Path
import secrets
import subprocess

root = Path('/opt/atlas-invest')
if not root.exists():
    root.mkdir(mode=0o755)
    subprocess.run(['tar', 'xzf', '/tmp/atlas-invest-deploy-20261017.tar.gz', '--no-same-owner', '--exclude=._*', '--exclude=*/._*', '-C', str(root)], check=True)
env = root / 'deploy/.env'
if not env.exists():
    database_password = secrets.token_hex(24)
    values = {
        'APP_BASE_URL': 'https://atlas-invest.invalid',
        'APP_TIMEZONE': 'Asia/Shanghai',
        'DATABASE_URL': f'postgresql://atlas:{database_password}@127.0.0.1:5432/atlas',
        'POSTGRES_PASSWORD': database_password,
        'OWNER_PASSWORD': secrets.token_urlsafe(18),
        'SESSION_SECRET': secrets.token_hex(32),
        'CREDENTIAL_ENCRYPTION_KEY': base64.b64encode(secrets.token_bytes(32)).decode(),
        'DATA_MODE': 'live',
        'LOCAL_DEV_NO_AUTH': 'false',
        'FRED_API_KEY': '',
        'ATLAS_PROJECT_ROOT': str(root),
        'COLLECTOR_PYTHON': str(root / 'services/collector/.venv/bin/python'),
        'ATLAS_CATALOG_PATH': str(root / 'config/indicators.json'),
        'HOSTNAME': '127.0.0.1',
        'PORT': '3000',
        'NODE_ENV': 'production',
        'NEXT_TELEMETRY_DISABLED': '1',
    }
    with open(os.open(env, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'w') as file:
        file.write(''.join(f'{key}={value}\n' for key, value in values.items()))
subprocess.run(['chmod', '600', str(env)], check=True)
swap = Path('/atlas-swapfile')
if not swap.exists() and not Path('/proc/swaps').read_text().splitlines()[1:]:
    subprocess.run(['fallocate', '-l', '2G', str(swap)], check=True)
    swap.chmod(0o600)
    subprocess.run(['mkswap', str(swap)], check=True)
    subprocess.run(['swapon', str(swap)], check=True)
    with Path('/etc/fstab').open('a') as file:
        file.write('\n/atlas-swapfile none swap sw 0 0\n')
print('Prepared deployment directory, restricted environment file, and swap.')
