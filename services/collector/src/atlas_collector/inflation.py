"""Nationwide monthly CPI YoY, in percent, from Eastmoney's published table."""
from datetime import date
from .errors import CollectorError
from .models import Observation

def fetch_china_cpi(client, start, end):
    payload = client.get('https://datacenter-web.eastmoney.com/api/data/v1/get', {
        'reportName': 'RPT_ECONOMY_CPI', 'columns': 'REPORT_DATE,NATIONAL_SAME',
        'pageNumber': 1, 'pageSize': 2000, 'sortColumns': 'REPORT_DATE',
        'sortTypes': '1', 'source': 'WEB', 'client': 'WEB',
    })
    return normalize_china_cpi(payload, start, end)

def normalize_china_cpi(payload, start, end):
    from .adapters import number, day
    result = payload.get('result') if isinstance(payload, dict) else None
    if not isinstance(payload, dict) or payload.get('success') is not True or not isinstance(result, dict) or not isinstance(result.get('data'), list) or int(result.get('pages', 1)) > 1:
        raise CollectorError('invalid_response', 'Incomplete China CPI response.')
    records = {}
    for row in result['data']:
        period = day(str(row.get('REPORT_DATE', ''))[:10])
        if period.day != 1 or period > date.today().replace(day=1):
            raise CollectorError('invalid_date', 'Expected an observed month, represented by its first day.')
        value = None if row.get('NATIONAL_SAME') is None else number(row['NATIONAL_SAME'])
        if period in records and records[period].value != value:
            raise CollectorError('conflicting_duplicates', 'Conflicting China CPI observations.')
        records[period] = Observation(period, value, quality_flags=['nationwide_cpi_yoy', 'observation_month_not_release_date'])
    return [records[d] for d in sorted(records) if start <= d <= end]
