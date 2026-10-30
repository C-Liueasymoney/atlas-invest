"""Verify the deployed owner API and Python vault without upstream requests.

Run as root with atlas-collect.timer paused and atlas-collect inactive.
No real provider credential is replaced; generated test keys are deleted in finally.
"""
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
from urllib.error import HTTPError
from urllib.request import Request, urlopen

root = Path('/opt/atlas-invest')
values = dict(line.split('=', 1) for line in (root / 'deploy/.env').read_text().splitlines()
              if line and not line.startswith('#'))
os.environ.update(values)
sys.path.insert(0, str(root / 'services/collector/src'))
import psycopg
from atlas_collector.credentials import credential, OWNER_ID

assert subprocess.run(['systemctl', 'is-active', '--quiet', 'atlas-collect.timer']).returncode != 0, 'Pause the collector timer first'
assert subprocess.run(['systemctl', 'is-active', '--quiet', 'atlas-collect']).returncode != 0, 'Wait for the current collector run'
assert not values.get('FRED_API_KEY'), 'An environment override prevents web management'
origin = values['APP_BASE_URL']
cookie = ''


def call(path, method='GET', payload=None, authenticated=True, request_origin=origin):
    headers = {'Origin': request_origin, 'Content-Type': 'application/json'}
    if authenticated and cookie:
        headers['Cookie'] = cookie
    request = Request('http://127.0.0.1:3000' + path,
                      data=json.dumps(payload).encode() if payload is not None else None,
                      headers=headers, method=method)
    try:
        with urlopen(request, timeout=30) as response:
            return response.status, response.headers, response.read().decode()
    except HTTPError as error:
        return error.code, error.headers, error.read().decode()


with psycopg.connect(values['DATABASE_URL'], autocommit=True) as db:
    assert not db.execute('SELECT 1 FROM provider_credentials WHERE provider_id=%s AND owner_id=%s', ('fred', OWNER_ID)).fetchone(), 'Existing FRED credential preserved; do not run the mutation probe'
    code, headers, _ = call('/api/auth/login', 'POST', {'password': values['OWNER_PASSWORD']})
    assert code == 200, 'Owner login failed'
    cookie = headers['Set-Cookie'].split(';', 1)[0]
    saved = False
    try:
        first = secrets.token_hex(24)
        second = secrets.token_hex(24)
        payload = {'apiKey': first, 'confirm': True}
        assert call('/api/providers/fred/credentials', 'POST', payload, authenticated=False)[0] == 401
        assert call('/api/providers/fred/credentials', 'POST', payload, request_origin='https://untrusted.invalid')[0] == 403
        saved = True
        assert call('/api/providers/fred/credentials', 'POST', payload)[0] == 200, 'Credential save failed'
        row = db.execute('SELECT secret_ciphertext FROM provider_credentials WHERE provider_id=%s AND owner_id=%s', ('fred', OWNER_ID)).fetchone()
        assert row and first not in row[0], 'Plaintext found in the database vault'
        assert credential('fred', db) == first, 'Python could not read the web-saved key'
        for path in ['/api/providers/catalog', '/api/providers/export']:
            code, _, body = call(path)
            assert code == 200 and first not in body and row[0] not in body, 'Credential leaked through a read/export API'
        assert call('/api/providers/fred/credentials', 'POST', {'apiKey': second, 'confirm': True})[0] == 200
        assert credential('fred', db) == second, 'Replacement was not visible to the collector'
        assert call('/api/providers/fred/credentials', 'DELETE', {'confirm': True})[0] == 200
        assert credential('fred', db) is None, 'Deletion was not visible to the collector'
        saved = False
        print('PASS: authenticated save, CSRF rejection, encrypted database, Python read, secret-free export, replacement and deletion.')
    finally:
        if saved:
            call('/api/providers/fred/credentials', 'DELETE', {'confirm': True})
            assert not db.execute('SELECT 1 FROM provider_credentials WHERE provider_id=%s AND owner_id=%s', ('fred', OWNER_ID)).fetchone(), 'Test credential cleanup failed'
        call('/api/auth/logout', 'POST', {})
