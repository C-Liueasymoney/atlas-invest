"""Bounded HTTP access. Raw exceptions/URLs never cross this boundary."""
from datetime import datetime, timezone
from decimal import Decimal
import json
import re
import time
import ssl
import certifi
from urllib.request import Request, urlopen
from urllib.parse import urlencode
from urllib.error import HTTPError, URLError
from .errors import CollectorError

class JsonClient:
    def __init__(self, opener=urlopen, sleep=time.sleep):
        self.opener = opener
        self.sleep = sleep
        self.cache_seconds = 0
        self.fetched_at = None

    def get(self, url, params=None):
        return self._request(url,params)

    def get_bytes(self, url):
        return self._request(url,binary=True)

    def _request(self, url, params=None, binary=False):
        request = Request(url + ('?' + urlencode(params) if params else ''), headers={'Accept': 'application/json', 'User-Agent': 'AtlasInvest/0.1 personal research'})
        for attempt in range(3):
            try:
                with self.opener(request, timeout=25, context=ssl.create_default_context(cafile=certifi.where())) as response:
                    raw = response.read(20_000_001)
                    if len(raw)>20_000_000:
                        raise CollectorError('invalid_response','Provider response exceeds 20MB.')
                    payload = raw if binary else json.loads(raw, parse_float=Decimal)
                    match = re.search(r'max-age=(\d+)', response.headers.get('Cache-Control', ''))
                    self.cache_seconds = min(86400, int(match[1])) if match else 0
                    self.fetched_at = datetime.now(timezone.utc)
                    return payload
            except HTTPError as error:
                if error.code in (401, 403):
                    raise CollectorError('unauthorized', 'Provider rejected authentication or access.') from None
                if error.code == 429:
                    raise CollectorError('rate_limited', 'Provider quota reached; retry on a later run.') from None
                if error.code < 500:
                    raise CollectorError('upstream_rejected', 'Provider rejected this request.') from None
            except (URLError, TimeoutError, OSError):
                pass
            except (ValueError, UnicodeError):
                raise CollectorError('invalid_response', 'Provider returned invalid JSON.') from None
            if attempt < 2:
                self.sleep(2 ** attempt)
        raise CollectorError('upstream_unavailable', 'Provider unavailable after three attempts.')
