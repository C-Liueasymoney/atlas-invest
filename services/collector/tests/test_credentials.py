"""Verify real Node AES-GCM interoperability, not an alternate Python writer."""
import base64
import json
import os
from pathlib import Path
import subprocess
import pytest
from atlas_collector.errors import CollectorError


def node_ciphertext(secret, key):
    result = subprocess.run(['node', '-e', '''
const { createCipheriv, randomBytes } = require('node:crypto');
const [secret,key] = JSON.parse(require('node:fs').readFileSync(0,'utf8'));
const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',Buffer.from(key,'base64'),iv);
const data=Buffer.concat([cipher.update(secret,'utf8'),cipher.final()]);
process.stdout.write([iv,cipher.getAuthTag(),data].map(b=>b.toString('base64')).join('.'));
'''], input=json.dumps([secret,key]), text=True, capture_output=True, check=True)
    return result.stdout


def test_decrypts_existing_node_format_and_rejects_tampering():
    from atlas_collector.credentials import decrypt_secret
    key = base64.b64encode(os.urandom(32)).decode()
    ciphertext = node_ciphertext('private-interoperability-test', key)
    assert decrypt_secret(ciphertext, key) == 'private-interoperability-test'
    for payload, master in [(ciphertext, base64.b64encode(os.urandom(32)).decode()),
                            (ciphertext, 'invalid'), ('bad.payload', key),
                            (ciphertext + '!', key)]:
        with pytest.raises(CollectorError) as error:
            decrypt_secret(payload, master)
        assert error.value.code == 'credential_decryption_failed'
        assert 'private-interoperability-test' not in str(error.value)
        assert master not in str(error.value)


def test_environment_override_and_preview_do_not_open_database(monkeypatch):
    from atlas_collector.credentials import credential
    monkeypatch.setenv('DATABASE_URL', 'postgresql://unreachable.invalid/no')
    monkeypatch.setenv('DATA_MODE', 'live')
    monkeypatch.setenv('FRED_API_KEY', 'environment-test-key')
    assert credential('fred') == 'environment-test-key'
    monkeypatch.delenv('FRED_API_KEY')
    monkeypatch.setenv('DATA_MODE', 'preview')
    assert credential('fred') is None


def test_missing_optional_key_can_be_skipped_explicitly(monkeypatch, capsys):
    from atlas_collector.__main__ import main
    monkeypatch.delenv('FRED_API_KEY', raising=False)
    monkeypatch.setenv('DATA_MODE', 'demo')
    args = ['sync', '--series', 'FRED_SP500', '--probe']
    assert main(args) == 1
    assert json.loads(capsys.readouterr().err)['code'] == 'not_configured'
    assert main(args + ['--skip-unconfigured']) == 0
    result = json.loads(capsys.readouterr().out)
    assert result['status'] == 'skipped'
    assert result['code'] == 'not_configured'


def test_optional_key_skip_does_not_hide_missing_database(monkeypatch, capsys):
    from atlas_collector.__main__ import main
    monkeypatch.setenv('DATA_MODE', 'live')
    monkeypatch.delenv('DATABASE_URL', raising=False)
    monkeypatch.delenv('FRED_API_KEY', raising=False)
    assert main(['sync', '--series', 'FRED_SP500', '--skip-unconfigured']) == 1
    assert json.loads(capsys.readouterr().err)['code'] == 'not_configured'
