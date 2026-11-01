"""Restore one encrypted backup into a new disposable database and compare counts."""
import gzip
from pathlib import Path
import subprocess

backup = sorted(Path('/var/backups/atlas-invest').glob('*.sql.gz.enc'))[-1]
compressed = subprocess.check_output(['openssl', 'enc', '-d', '-aes-256-cbc', '-pbkdf2', '-iter', '200000', '-pass', 'file:/etc/atlas-invest/backup.key', '-in', str(backup)])
dump = gzip.decompress(compressed)
database = 'atlas_restore_verify_20261017'
def psql(db, sql):
    return subprocess.run(['runuser', '-u', 'postgres', '--', 'psql', '-v', 'ON_ERROR_STOP=1', '-At', '-d', db], input=sql, text=True, capture_output=True, check=True).stdout.strip()
if psql('postgres', f"SELECT 1 FROM pg_database WHERE datname='{database}';"):
    raise SystemExit('Disposable restore database already exists; refusing to overwrite.')
psql('postgres', f'CREATE DATABASE {database};')
try:
    subprocess.run(['runuser', '-u', 'postgres', '--', 'psql', '-v', 'ON_ERROR_STOP=1', '-q', '--single-transaction', '-d', database], input=dump, check=True, stdout=subprocess.DEVNULL)
    query = 'SELECT (SELECT count(*) FROM series), (SELECT count(*) FROM price_bars), (SELECT count(*) FROM metric_observations), (SELECT count(*) FROM latest_quotes);'
    restored = psql(database, query)
    live = psql('atlas', query)
    assert restored == live, (restored, live)
    print('Encrypted backup restored successfully; series/bars/observations/quotes:', restored)
finally:
    psql('postgres', f'DROP DATABASE {database};')
    print('Removed the disposable restore-test database; original database and encrypted backup retained.')
