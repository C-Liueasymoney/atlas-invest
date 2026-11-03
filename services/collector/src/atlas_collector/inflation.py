"""Nationwide monthly CPI YoY, in percent, from Eastmoney's published table."""
from datetime import date
from .errors import CollectorError
from .models import Observation

def fetch_china_cpi(client, start, end, field="NATIONAL_SAME"):
    payload = client.get('https://datacenter-web.eastmoney.com/api/data/v1/get', {
        'reportName': 'RPT_ECONOMY_CPI', 'columns': 'REPORT_DATE,' + field,
        'pageNumber': 1, 'pageSize': 2000, 'sortColumns': 'REPORT_DATE',
        'sortTypes': '1', 'source': 'WEB', 'client': 'WEB',
    })
    return normalize_china_cpi(payload, start, end, field)

def normalize_china_cpi(payload, start, end, field="NATIONAL_SAME"):
    from .adapters import number, day
    result = payload.get('result') if isinstance(payload, dict) else None
    if not isinstance(payload, dict) or payload.get('success') is not True or not isinstance(result, dict) or not isinstance(result.get('data'), list) or int(result.get('pages', 1)) > 1:
        raise CollectorError('invalid_response', 'Incomplete China CPI response.')
    if field not in ('NATIONAL_SAME', 'NATIONAL_SEQUENTIAL'):
        raise CollectorError('unsupported', 'Unsupported China CPI field.')
    records = {}
    for row in result['data']:
        if field not in row:
            raise CollectorError('invalid_response', 'China CPI field is missing.')
        period = day(str(row.get('REPORT_DATE', ''))[:10])
        if period.day != 1 or period > date.today().replace(day=1):
            raise CollectorError('invalid_date', 'Expected an observed month, represented by its first day.')
        value = None if row.get(field) is None else number(row[field])
        if period in records and records[period].value != value:
            raise CollectorError('conflicting_duplicates', 'Conflicting China CPI observations.')
        records[period] = Observation(period, value, quality_flags=['nationwide_cpi_yoy' if field == 'NATIONAL_SAME' else 'nationwide_cpi_mom_rounded', 'observation_month_not_release_date'])
    return [records[d] for d in sorted(records) if start <= d <= end]
