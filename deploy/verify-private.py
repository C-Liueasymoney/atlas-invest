"""Verify production login and data over certificate-validated private HTTPS."""
import json
from pathlib import Path
import subprocess
import tempfile
from urllib.parse import urlparse

values = dict(line.split('=', 1) for line in Path('/opt/atlas-invest/deploy/.env').read_text().splitlines() if line and not line.startswith('#'))
origin = values['APP_BASE_URL']
hostname = urlparse(origin).hostname
ip = subprocess.check_output(['tailscale', 'ip', '-4'], text=True).strip()
with tempfile.TemporaryDirectory(prefix='atlas-verify-') as directory:
    directory = Path(directory)
    cookies = directory / 'cookies'
    def call(path, method='GET', payload=None, request_origin=origin):
        headers = directory / 'headers'
        output = directory / 'body'
        command = ['curl', '--silent', '--show-error', '--connect-timeout', '10', '--max-time', '45',
                   '--resolve', f'{hostname}:443:{ip}', '-X', method,
                   '-H', f'Origin: {request_origin}', '-H', 'Content-Type: application/json',
                   '-b', str(cookies), '-c', str(cookies), '-D', str(headers), '-o', str(output),
                   '-w', '%{http_code}', origin + path]
        if payload is not None:
            command += ['--data-binary', '@-']
        response = subprocess.run(command, input=json.dumps(payload) if payload is not None else '', text=True, capture_output=True, check=True)
        return int(response.stdout), headers.read_text(), output.read_text()
    assert call('/login')[0] == 200
    assert call('/api/v1/catalog')[0] == 401
    assert call('/api/auth/login', 'POST', {'password': values['OWNER_PASSWORD']}, 'https://untrusted.invalid')[0] == 403
    code, headers, body = call('/api/auth/login', 'POST', {'password': values['OWNER_PASSWORD']})
    assert code == 200 and json.loads(body)['authenticated']
    assert all(flag.lower() in headers.lower() for flag in ['HttpOnly', 'SameSite=Strict', 'Secure'])
    code, _, body = call('/api/v1/session')
    session = json.loads(body)
    assert code == 200 and session['authenticated'] and session['mode'] == 'live' and not session['localDemo']
    code, _, body = call('/api/v1/catalog')
    assert code == 200 and len(json.loads(body)['items']) >= 15
    code, _, body = call('/api/v1/series/SGE_AU9999_D1/bars?interval=1d')
    assert code == 200, body
    data = json.loads(body)
    assert data.get('isDemo') is False
    print('HTTPS certificate, login, secure cookie, origin protection, live catalog, and SGE API verified.')
    print('SGE API summary:', {key: data.get(key) for key in ['seriesId', 'asOf', 'status', 'isDemo']})
    assert call('/api/auth/logout', 'POST', {})[0] == 200
    assert call('/api/v1/catalog')[0] == 401
    print('Logout verified; unauthenticated access denied.')
