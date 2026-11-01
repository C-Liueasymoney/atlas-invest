"""Run existing database integration tests in their disposable schemas."""
import os
from pathlib import Path
import subprocess

root = Path('/opt/atlas-invest')
values = dict(line.split('=', 1) for line in (root / 'deploy/.env').read_text().splitlines() if line and not line.startswith('#'))
env = {**os.environ, 'TEST_DATABASE_URL': values['DATABASE_URL']}
subprocess.run(['runuser', '-u', 'atlas', '--', str(root / 'services/collector/.venv/bin/python'), '-m', 'pytest', 'services/collector/tests', '-q', '-p', 'no:cacheprovider'], cwd=root, env=env, check=True)
subprocess.run(['runuser', '-u', 'atlas', '--', '/usr/bin/node', '../../node_modules/vitest/vitest.mjs', 'run', '--configLoader', 'runner', '--maxWorkers', '1', '--testTimeout', '30000'], cwd=root / 'apps/web', env=env, check=True)
