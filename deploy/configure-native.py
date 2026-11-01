"""Initialize the native database and migrate without printing any secrets."""
import os
from pathlib import Path
import subprocess

root = Path('/opt/atlas-invest')
values = dict(line.split('=', 1) for line in (root / 'deploy/.env').read_text().splitlines() if line and not line.startswith('#'))
def sql(statement):
    return subprocess.run(['runuser', '-u', 'postgres', '--', 'psql', '-v', 'ON_ERROR_STOP=1', '-At'], input=statement, text=True, check=True, capture_output=True).stdout.strip()
if not sql("SELECT 1 FROM pg_roles WHERE rolname='atlas';"):
    sql(f"CREATE ROLE atlas LOGIN PASSWORD '{values['POSTGRES_PASSWORD']}';")
if not sql("SELECT 1 FROM pg_database WHERE datname='atlas';"):
    sql('CREATE DATABASE atlas OWNER atlas;')
for operation in ['migrate', 'seed']:
    subprocess.run(['runuser', '-u', 'atlas', '--', '/usr/bin/node', 'scripts/db.mjs', operation], cwd=root, env={**os.environ, **values}, check=True)
print('Native database initialized with a non-superuser application role.')
