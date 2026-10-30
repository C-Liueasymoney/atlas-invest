"""Read the existing owner-scoped provider vault; never log decrypted values."""
import base64
import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from .errors import CollectorError

OWNER_ID = '00000000-0000-4000-8000-000000000001'
ENV_VARS = {'fred': 'FRED_API_KEY', 'alpha_vantage': 'ALPHA_VANTAGE_API_KEY',
            'gold_api': 'GOLD_API_KEY', 'fmp': 'FMP_API_KEY'}


class MissingProviderCredential(CollectorError):
    def __init__(self):
        super().__init__('not_configured', 'Configure the provider API Key in the data-source settings or server environment.')


def decrypt_secret(payload, master_key):
    try:
        key = base64.b64decode(master_key, validate=True)
        iv, tag, data = [base64.b64decode(part, validate=True) for part in payload.split('.')]
        if len(key) != 32 or len(iv) != 12 or len(tag) != 16:
            raise ValueError
        return AESGCM(key).decrypt(iv, data + tag, None).decode('utf-8')
    except Exception:
        raise CollectorError('credential_decryption_failed',
                             'Cannot decrypt provider credential. Check the server master key and saved credential.') from None


def credential(provider_id, connection=None):
    env_var = ENV_VARS.get(provider_id)
    if not env_var:
        return None
    override = os.getenv(env_var)
    if override:
        return override
    if os.getenv('DATA_MODE') != 'live':
        return None
    if connection is None:
        if not os.getenv('DATABASE_URL'):
            return None
        import psycopg
        try:
            with psycopg.connect(os.environ['DATABASE_URL'], connect_timeout=10) as owned:
                return credential(provider_id, owned)
        except CollectorError:
            raise
        except Exception:
            raise CollectorError('credential_store_unavailable', 'Provider credential database is unavailable.') from None
    row = connection.execute(
        'SELECT secret_ciphertext FROM provider_credentials WHERE provider_id=%s AND owner_id=%s',
        (provider_id, OWNER_ID),
    ).fetchone()
    return decrypt_secret(row[0], os.getenv('CREDENTIAL_ENCRYPTION_KEY', '')) if row else None
